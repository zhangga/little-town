package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
)

type LearnHandler struct {
	db                *gorm.DB
	cfg               *config.Config
	reviewService     *services.SpacedRepetitionService
}

func NewLearnHandler(db *gorm.DB, cfg *config.Config) *LearnHandler {
	return &LearnHandler{
		db:            db,
		cfg:           cfg,
		reviewService: services.NewSpacedRepetitionService(db),
	}
}

// GetDailyWords 获取今日学习单词（新词 + 复习词）
func (h *LearnHandler) GetDailyWords(c *gin.Context) {
	userID := getCurrentUserID(c)

	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// 先取需要复习的单词（最多 3 个）
	dueSchedules, err := h.reviewService.GetDueWords(userID, 3)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get review words"})
		return
	}

	// 再取新单词补足每日目标
	remaining := h.cfg.DailyWordCount - len(dueSchedules)
	newWords := []models.Word{}
	if remaining > 0 {
		newWords, err = h.reviewService.GetNewWords(userID, user.Grade, remaining)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get new words"})
			return
		}
	}

	// 组装返回数据
	type WordItem struct {
		ID          uint   `json:"id"`
		Word        string `json:"word"`
		Translation string `json:"translation"`
		ImageURL    string `json:"image_url"`
		AudioURL    string `json:"audio_url"`
		IsReview    bool   `json:"is_review"`
	}

	items := make([]WordItem, 0, len(dueSchedules)+len(newWords))

	for _, s := range dueSchedules {
		items = append(items, WordItem{
			ID:          s.Word.ID,
			Word:        s.Word.Word,
			Translation: s.Word.Translation,
			ImageURL:    s.Word.ImageURL,
			AudioURL:    s.Word.AudioURL,
			IsReview:    true,
		})
	}

	for _, w := range newWords {
		items = append(items, WordItem{
			ID:          w.ID,
			Word:        w.Word,
			Translation: w.Translation,
			ImageURL:    w.ImageURL,
			AudioURL:    w.AudioURL,
			IsReview:    false,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"words": items,
		"count": len(items),
	})
}

type SubmitAnswerRequest struct {
	WordID    uint `json:"word_id" binding:"required"`
	IsCorrect bool `json:"is_correct"`
}

// SubmitAnswer 提交答案
func (h *LearnHandler) SubmitAnswer(c *gin.Context) {
	userID := getCurrentUserID(c)

	var req SubmitAnswerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 更新学习记录
	var record models.LearningRecord
	result := h.db.Where("user_id = ? AND word_id = ?", userID, req.WordID).First(&record)

	if result.Error == gorm.ErrRecordNotFound {
		record = models.LearningRecord{
			UserID:    userID,
			WordID:    req.WordID,
			IsCorrect: req.IsCorrect,
		}
		if req.IsCorrect {
			record.TimesRight = 1
		} else {
			record.TimesWrong = 1
		}
		h.db.Create(&record)
	} else {
		record.IsCorrect = req.IsCorrect
		if req.IsCorrect {
			record.TimesRight++
		} else {
			record.TimesWrong++
		}
		h.db.Save(&record)
	}

	// 更新复习计划
	var schedule models.ReviewSchedule
	currentLevel := 0
	if err := h.db.Where("user_id = ? AND word_id = ?", userID, req.WordID).First(&schedule).Error; err == nil {
		currentLevel = schedule.ReviewLevel
	}

	if err := h.reviewService.UpdateReviewSchedule(userID, req.WordID, req.IsCorrect, currentLevel); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update review schedule"})
		return
	}

	// 答对奖励砖块
	coinsEarned := 0
	bricksEarned := 0
	if req.IsCorrect {
		coinsEarned = 5
		bricksEarned = 1

		// 更新用户金币和砖块
		var user models.User
		if err := h.db.First(&user, userID).Error; err == nil {
			user.Coins += coinsEarned
			user.Bricks += bricksEarned
			h.db.Save(&user)

			c.JSON(http.StatusOK, gin.H{
				"message":       "answer submitted",
				"is_correct":    req.IsCorrect,
				"coins_earned":  coinsEarned,
				"bricks_earned": bricksEarned,
				"total_coins":   user.Coins,
				"total_bricks":  user.Bricks,
			})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "answer submitted",
		"is_correct":    req.IsCorrect,
		"coins_earned":  coinsEarned,
		"bricks_earned": bricksEarned,
	})
}

// GetStats 获取学习统计
func (h *LearnHandler) GetStats(c *gin.Context) {
	userID := getCurrentUserID(c)

	stats, err := h.reviewService.GetUserStats(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get stats"})
		return
	}

	upcoming, _ := h.reviewService.GetUpcomingReviews(userID, 7)

	c.JSON(http.StatusOK, gin.H{
		"stats":    stats,
		"upcoming": upcoming,
	})
}
