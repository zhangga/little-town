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
	db            *gorm.DB
	cfg           *config.Config
	reviewService *services.SpacedRepetitionService
	rewardService *services.RewardService
}

func NewLearnHandler(db *gorm.DB, cfg *config.Config) *LearnHandler {
	return &LearnHandler{
		db:            db,
		cfg:           cfg,
		reviewService: services.NewSpacedRepetitionService(db),
		rewardService: services.NewRewardService(db),
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
		// 让前端知道今天是否已经达标，用于展示"还差几个词"
		"daily_goal": h.cfg.DailyWordCount,
		"bonus_bricks":     services.DailyCompletionBonus,
		"daily_brick_cap":  services.DailyBrickCap,
		"bonus_claimed":    user.DailyBonusDate == todayString(),
	})
}

type SubmitAnswerRequest struct {
	WordID    uint `json:"word_id" binding:"required"`
	IsCorrect bool `json:"is_correct"`
}

// SubmitAnswer 提交答案
//
// 奖励发放交给 RewardService，它负责每日上限。
// 若答完这一题后今天的学习量已达标，会顺带发放完成奖励。
func (h *LearnHandler) SubmitAnswer(c *gin.Context) {
	userID := getCurrentUserID(c)

	var req SubmitAnswerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 记录学习情况
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

	// 发奖
	reward, err := h.rewardService.GrantForAnswer(userID, req.IsCorrect)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to grant reward"})
		return
	}

	// 检查是否刚好完成当日学习量，是则发放完成奖励
	bonusGranted := false
	bonusBricks := 0
	complete, err := h.rewardService.IsDayComplete(userID, h.cfg.DailyWordCount)
	if err == nil && complete {
		granted, bonusResult, bonusErr := h.rewardService.GrantCompletionBonus(userID)
		if bonusErr == nil && granted {
			bonusGranted = true
			bonusBricks = bonusResult.BricksEarned
			// 完成奖励叠加到本次返回
			reward.BricksEarned += bonusResult.BricksEarned
			reward.CoinsEarned += bonusResult.CoinsEarned
			reward.TotalCoins = bonusResult.TotalCoins
			reward.TotalBricks = bonusResult.TotalBricks
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "answer submitted",
		"is_correct":     req.IsCorrect,
		"coins_earned":   reward.CoinsEarned,
		"bricks_earned":  reward.BricksEarned,
		"total_coins":    reward.TotalCoins,
		"total_bricks":   reward.TotalBricks,
		"capped":         reward.Capped,
		"bricks_today":   reward.BricksToday,
		"daily_cap":      reward.DailyCap,
		"bonus_granted":  bonusGranted,
		"bonus_bricks":   bonusBricks,
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
