package handlers

import (
	"errors"
	"gorm.io/gorm/clause"
	"net/http"
	"strconv"

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

	afterID, err := strconv.ParseUint(c.DefaultQuery("practice_after", "0"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid practice cursor"})
		return
	}
	goal := h.cfg.DailyWordCount
	if goal < 1 {
		goal = 5
	}
	// 每日目标是每轮题量和奖励目标，不是每天最多能学的词数。
	dueSchedules, err := h.reviewService.GetDueWords(userID, min(3, goal))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get review words"})
		return
	}

	// 再取新单词补足每日目标
	remaining := goal - len(dueSchedules)
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

	sessionKind := "learning"
	var practiceNextID uint
	if len(items) == 0 {
		practice, err := h.reviewService.GetPracticeWords(userID, goal, uint(afterID))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get practice words"})
			return
		}
		sessionKind = "practice"
		for _, w := range practice {
			items = append(items, WordItem{ID: w.ID, Word: w.Word, Translation: w.Translation, ImageURL: w.ImageURL, AudioURL: w.AudioURL, IsReview: true})
			practiceNextID = w.ID
		}
		if len(items) == 0 {
			sessionKind = "empty"
		}
	}

	var practiceToken string
	practiceRewards, err := h.practiceService().Status(userID)
	if err != nil {
		practiceError(c, err)
		return
	}
	if sessionKind == "practice" {
		ids := make([]uint, len(items))
		for i, item := range items {
			ids[i] = item.ID
		}
		practiceToken, err = h.practiceService().NewTicket(userID, ids)
		if err != nil {
			practiceError(c, err)
			return
		}
	}
	bricksToday := 0
	if user.RewardDate == todayString() {
		bricksToday = max(0, user.RewardBricks)
	}
	c.JSON(http.StatusOK, gin.H{
		"words": items, "count": len(items),
		"session_kind": sessionKind, "practice_next_id": practiceNextID,
		"practice_token": practiceToken, "practice_rewards": practiceRewards,
		// 让前端知道今天是否已经达标，用于展示"还差几个词"
		"daily_goal":         goal,
		"bonus_bricks":       services.DailyCompletionBonus,
		"daily_brick_cap":    services.DailyBrickCap,
		"bricks_today":       bricksToday,
		"bricks_per_correct": services.BricksPerCorrect,
		"bonus_claimed":      user.DailyBonusDate == todayString(),
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "提交的单词无效"})
		return
	}
	var reward *services.RewardResult
	var growth *services.ResidentLearning
	bonusGranted, bonusBricks := false, 0
	err := h.db.Transaction(func(tx *gorm.DB) error {
		// 学习发奖与换装/小屋消费使用同一把用户行锁，避免旧余额覆盖新消费。
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		var word models.Word
		if err := tx.First(&word, req.WordID).Error; err != nil {
			return err
		}
		var record models.LearningRecord
		lookup := tx.Where("user_id = ? AND word_id = ?", userID, req.WordID).First(&record).Error
		isReview := lookup == nil
		if lookup != nil && !errors.Is(lookup, gorm.ErrRecordNotFound) {
			return lookup
		}
		var err error
		growth, err = services.NewResidentService(tx, h.cfg.DailyWordCount).RecordLearning(tx, userID, req.WordID, req.IsCorrect, isReview)
		if err != nil {
			return err
		}
		// 同一个词当天重复提交不推进复习级别；先答错再答对仍可记录一次纠正。
		if growth.FirstToday || growth.RewardEligible {
			if !isReview {
				record = models.LearningRecord{UserID: userID, WordID: req.WordID}
			}
			record.IsCorrect = req.IsCorrect
			if req.IsCorrect {
				record.TimesRight++
			} else {
				record.TimesWrong++
			}
			if err := tx.Save(&record).Error; err != nil {
				return err
			}
			var schedule models.ReviewSchedule
			lookup := tx.Where("user_id = ? AND word_id = ?", userID, req.WordID).First(&schedule).Error
			if lookup != nil && !errors.Is(lookup, gorm.ErrRecordNotFound) {
				return lookup
			}
			if err := services.NewSpacedRepetitionService(tx).UpdateReviewSchedule(userID, req.WordID, req.IsCorrect, schedule.ReviewLevel); err != nil {
				return err
			}
		}
		rewards := services.NewRewardService(tx)
		reward, err = rewards.GrantForAnswer(userID, growth.RewardEligible)
		if err != nil {
			return err
		}
		if growth.DayComplete {
			granted, bonus, err := rewards.GrantCompletionBonus(userID)
			if err != nil {
				return err
			}
			if granted {
				bonusGranted, bonusBricks = true, bonus.BricksEarned
				reward.BricksEarned += bonus.BricksEarned
				reward.CoinsEarned += bonus.CoinsEarned
				reward.TotalCoins, reward.TotalBricks = bonus.TotalCoins, bonus.TotalBricks
			}
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户或单词不存在"})
			return
		}
		_ = c.Error(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "学习记录暂未保存，请稍后重试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "answer submitted", "is_correct": req.IsCorrect,
		"coins_earned": reward.CoinsEarned, "bricks_earned": reward.BricksEarned,
		"total_coins": reward.TotalCoins, "total_bricks": reward.TotalBricks,
		"capped": reward.Capped, "bricks_today": reward.BricksToday, "daily_cap": reward.DailyCap,
		"bonus_granted": bonusGranted, "bonus_bricks": bonusBricks,
		"xp_earned": growth.XPEarned, "total_xp": growth.Experience, "resident_level": growth.Level,
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
