package services

import (
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

// SpacedRepetitionService 艾宾浩斯记忆曲线复习服务
type SpacedRepetitionService struct {
	db *gorm.DB
	// 复习间隔（分钟）：5分钟、30分钟、12小时、1天、2天、4天、7天、15天、30天
	intervals []int
}

func NewSpacedRepetitionService(db *gorm.DB) *SpacedRepetitionService {
	return &SpacedRepetitionService{
		db: db,
		intervals: []int{
			5,     // Level 0: 5 分钟后
			30,    // Level 1: 30 分钟后
			720,   // Level 2: 12 小时后
			1440,  // Level 3: 1 天后
			2880,  // Level 4: 2 天后
			5760,  // Level 5: 4 天后
			10080, // Level 6: 7 天后
			21600, // Level 7: 15 天后
			43200, // Level 8: 30 天后
		},
	}
}

// GetMasteryLevel 根据复习级别返回掌握程度描述
func (s *SpacedRepetitionService) GetMasteryLevel(reviewLevel int) string {
	switch {
	case reviewLevel == 0:
		return "新学"
	case reviewLevel <= 2:
		return "初步记忆"
	case reviewLevel <= 4:
		return "基本掌握"
	case reviewLevel <= 6:
		return "熟练"
	default:
		return "完全掌握"
	}
}

// UpdateReviewSchedule 更新复习计划（答对时调用）
func (s *SpacedRepetitionService) UpdateReviewSchedule(userID, wordID uint, isCorrect bool, currentLevel int) error {
	var schedule models.ReviewSchedule
	result := s.db.Where("user_id = ? AND word_id = ?", userID, wordID).First(&schedule)

	now := time.Now()

	if result.Error == gorm.ErrRecordNotFound {
		// 第一次学习该单词
		newLevel := 0
		if !isCorrect {
			newLevel = 0 // 答错则从 0 开始
		}
		schedule = models.ReviewSchedule{
			UserID:         userID,
			WordID:         wordID,
			ReviewLevel:    newLevel,
			NextReviewAt:   now.Add(time.Duration(s.intervals[newLevel]) * time.Minute),
			LastReviewedAt: now,
		}
		return s.db.Create(&schedule).Error
	}

	if result.Error != nil {
		return result.Error
	}

	// 更新已有记录
	newLevel := schedule.ReviewLevel
	if isCorrect {
		// 答对了，级别 +1（最高到 len(intervals)-1）
		if newLevel < len(s.intervals)-1 {
			newLevel++
		}
	} else {
		// 答错了，级别回退（回退到 0，重新开始）
		newLevel = 0
	}

	schedule.ReviewLevel = newLevel
	schedule.LastReviewedAt = now
	schedule.NextReviewAt = now.Add(time.Duration(s.intervals[newLevel]) * time.Minute)

	return s.db.Save(&schedule).Error
}

// GetDueWords 获取需要复习的单词
func (s *SpacedRepetitionService) GetDueWords(userID uint, limit int) ([]models.ReviewSchedule, error) {
	var schedules []models.ReviewSchedule
	err := s.db.
		Preload("Word").
		Where("user_id = ? AND next_review_at <= ?", userID, time.Now()).
		Where("word_id IN (?)", s.db.Model(&models.Word{}).Select("id").Where("subject = ?", "english")).
		Order("next_review_at ASC").
		Limit(limit).
		Find(&schedules).Error

	return schedules, err
}

// GetNewWords 获取用户还没学过的新单词
func (s *SpacedRepetitionService) GetNewWords(userID uint, grade int, limit int) ([]models.Word, error) {
	var words []models.Word

	// 查询该年级下，用户还没有学习记录的单词
	subQuery := s.db.Model(&models.ReviewSchedule{}).
		Select("word_id").
		Where("user_id = ?", userID)

	err := s.db.
		Where("grade = ? AND subject = ?", grade, "english").
		Where("id NOT IN (?)", subQuery).
		Order("difficulty ASC, id ASC").
		Limit(limit).
		Find(&words).Error

	return words, err
}

// GetPracticeWords 在没有新词和到期任务时提供已学词，读取不改变复习计划。
// 用单词 ID 游标轮换题组；到词库末尾后从头补齐，不重复返回同一词。
func (s *SpacedRepetitionService) GetPracticeWords(userID uint, limit int, afterID uint) ([]models.Word, error) {
	words := []models.Word{}
	if limit < 1 {
		return words, nil
	}
	learned := s.db.Model(&models.ReviewSchedule{}).Select("word_id").Where("user_id = ?", userID)
	query := func() *gorm.DB {
		return s.db.Where("subject = ? AND id IN (?)", "english", learned).Order("id ASC")
	}
	if err := query().Where("id > ?", afterID).Limit(limit).Find(&words).Error; err != nil {
		return nil, err
	}
	if len(words) < limit && afterID > 0 {
		var wrapped []models.Word
		if err := query().Where("id <= ?", afterID).Limit(limit - len(words)).Find(&wrapped).Error; err != nil {
			return nil, err
		}
		words = append(words, wrapped...)
	}
	return words, nil
}

// GetUserStats 获取用户学习统计
func (s *SpacedRepetitionService) GetUserStats(userID uint) (map[string]interface{}, error) {
	var totalWords int64
	var masteredWords int64
	var dueToday int64
	var todayLearned int64

	// 累计学过的单词数
	s.db.Model(&models.ReviewSchedule{}).Where("user_id = ?", userID).Count(&totalWords)

	// 已掌握的单词数（复习级别 >= 6）
	s.db.Model(&models.ReviewSchedule{}).
		Where("user_id = ? AND review_level >= ?", userID, 6).
		Count(&masteredWords)

	// 今天需要复习的数量（截止到本地次日零点）
	todayEnd := DayEnd(time.Now())
	s.db.Model(&models.ReviewSchedule{}).
		Where("user_id = ? AND next_review_at < ?", userID, todayEnd).
		Count(&dueToday)

	// 今天学习的数量
	todayStart := DayStart(time.Now())
	s.db.Model(&models.LearningRecord{}).
		Where("user_id = ? AND updated_at >= ?", userID, todayStart).
		Count(&todayLearned)

	// 正确率
	var totalRecords int64
	var correctRecords int64
	s.db.Model(&models.LearningRecord{}).Where("user_id = ?", userID).Count(&totalRecords)
	s.db.Model(&models.LearningRecord{}).Where("user_id = ? AND is_correct = ?", userID, true).Count(&correctRecords)

	accuracy := 0.0
	if totalRecords > 0 {
		accuracy = float64(correctRecords) / float64(totalRecords) * 100
	}

	return map[string]interface{}{
		"total_words":    totalWords,
		"mastered_words": masteredWords,
		"due_today":      dueToday,
		"today_learned":  todayLearned,
		"accuracy":       accuracy,
	}, nil
}

// GetUpcomingReviews 获取未来几天的复习安排（用于遗忘曲线可视化）
func (s *SpacedRepetitionService) GetUpcomingReviews(userID uint, days int) ([]map[string]interface{}, error) {
	result := make([]map[string]interface{}, 0, days)

	for i := 0; i < days; i++ {
		dayStart := DayStartOffset(time.Now(), i)
		dayEnd := dayStart.AddDate(0, 0, 1)

		var count int64
		s.db.Model(&models.ReviewSchedule{}).
			Where("user_id = ? AND next_review_at >= ? AND next_review_at < ?", userID, dayStart, dayEnd).
			Count(&count)

		result = append(result, map[string]interface{}{
			"date":  dayStart.Format("2006-01-02"),
			"count": count,
		})
	}

	return result, nil
}
