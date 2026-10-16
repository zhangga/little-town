package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
)

type ParentHandler struct {
	db *gorm.DB
}

func NewParentHandler(db *gorm.DB) *ParentHandler {
	return &ParentHandler{db: db}
}

// GetChildStats 获取孩子的学习统计（家长端）
func (h *ParentHandler) GetChildStats(c *gin.Context) {
	userID := getCurrentUserID(c)

	// 获取用户基本信息
	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// 累计学习天数（有学习记录的不同日期数）
	var studyDays int64
	h.db.Model(&models.LearningRecord{}).
		Where("user_id = ?", userID).
		Select("COUNT(DISTINCT DATE(created_at))").
		Count(&studyDays)

	// 累计学习单词数
	var totalWords int64
	h.db.Model(&models.ReviewSchedule{}).Where("user_id = ?", userID).Count(&totalWords)

	// 今日学习
	todayStart := services.DayStart(time.Now())
	var todayWords int64
	h.db.Model(&models.LearningRecord{}).
		Where("user_id = ? AND created_at >= ?", userID, todayStart).
		Count(&todayWords)

	// 正确率
	var totalRecords int64
	var correctRecords int64
	h.db.Model(&models.LearningRecord{}).Where("user_id = ?", userID).Count(&totalRecords)
	h.db.Model(&models.LearningRecord{}).Where("user_id = ? AND is_correct = ?", userID, true).Count(&correctRecords)

	accuracy := 0.0
	if totalRecords > 0 {
		accuracy = float64(correctRecords) / float64(totalRecords) * 100
	}

	// 连续打卡天数：从昨天开始往前数，连续有记录的天数
	streakDays := 0
	for i := 1; i <= 365; i++ {
		dayStart := services.DayStartOffset(time.Now(), -i)
		dayEnd := dayStart.AddDate(0, 0, 1)

		var count int64
		h.db.Model(&models.LearningRecord{}).
			Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, dayStart, dayEnd).
			Count(&count)

		if count > 0 {
			streakDays++
		} else {
			break
		}
	}

	// 今天有学习，+1
	if todayWords > 0 {
		streakDays++
	}

	// 最近 7 天的学习数据
	recentDays := make([]map[string]interface{}, 0, 7)
	for i := 6; i >= 0; i-- {
		dayStart := services.DayStartOffset(time.Now(), -i)
		dayEnd := dayStart.AddDate(0, 0, 1)

		var count int64
		h.db.Model(&models.LearningRecord{}).
			Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, dayStart, dayEnd).
			Count(&count)

		recentDays = append(recentDays, map[string]interface{}{
			"date":  dayStart.Format("01-02"),
			"count": count,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"nickname": user.Nickname,
			"avatar":   user.Avatar,
			"grade":    user.Grade,
		},
		"stats": gin.H{
			"total_words":  totalWords,
			"today_words":  todayWords,
			"study_days":   studyDays,
			"streak_days":  streakDays,
			"accuracy":     accuracy,
		},
		"recent_days": recentDays,
	})
}

type AddCustomWordRequest struct {
	Word        string `json:"word" binding:"required"`
	Translation string `json:"translation" binding:"required"`
	ImageURL    string `json:"image_url"`
}

// AddCustomWord 家长手动添加单词
func (h *ParentHandler) AddCustomWord(c *gin.Context) {
	userID := getCurrentUserID(c)

	var req AddCustomWordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// 创建自定义单词
	word := models.Word{
		Word:        req.Word,
		Translation: req.Translation,
		Grade:       user.Grade,
		Subject:     "english",
		ImageURL:    req.ImageURL,
		Difficulty:  1,
	}

	if err := h.db.Create(&word).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add word"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "word added successfully",
		"word":    word,
	})
}

// timeNow 返回当前时间（用于方便测试时 mock）
func timeNow() time.Time {
	return time.Now()
}
