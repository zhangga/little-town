package services

import (
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

// 奖励规则。数值集中在这里，便于调整与核对。
const (
	// BricksPerCorrect 每答对一个单词给的砖块
	BricksPerCorrect = 1
	// CoinsPerCorrect 每答对一个单词给的金币
	CoinsPerCorrect = 5

	// DailyBrickCap 每日通过答题获得的砖块上限。
	//
	// 设这个上限是为了堵住刷砖：后端对答对奖励原本没有限制，
	// 反复答同一个简单单词就能无限攒砖，那会把"记住单词"和
	// "拿到砖块"解耦，孩子会挑最简单的词猛点。
	//
	// 默认每轮 10 词，20 块允许两轮答对奖励；领满后仍可继续学习。
	DailyBrickCap = 20

	// DailyCompletionBonus 完成当日全部单词的一次性奖励。
	//
	// 奖励完成每日目标的行为，让首次学习就能攒够建造所需的砖块。
	// 默认 10 词全部答对，加上完成奖励共获得 20 块砖。
	DailyCompletionBonus = 10
)

// RewardService 负责发放答题奖励并执行每日限额
type RewardService struct {
	db *gorm.DB
}

func NewRewardService(db *gorm.DB) *RewardService {
	return &RewardService{db: db}
}

// RewardResult 一次奖励发放的结果
type RewardResult struct {
	CoinsEarned  int  `json:"coins_earned"`
	BricksEarned int  `json:"bricks_earned"`
	Capped       bool `json:"capped"` // 是否撞到每日上限而被削减
	TotalCoins   int  `json:"total_coins"`
	TotalBricks  int  `json:"total_bricks"`
	BricksToday  int  `json:"bricks_today"` // 今日已获得的砖块
	DailyCap     int  `json:"daily_cap"`
}

func today() string {
	return TodayString()
}

// GrantForAnswer 发放一次答题奖励，并遵守每日上限。
//
// 注意：这里只负责发奖，不判断答案对错是否可信——调用方目前依赖
// 客户端上报的 is_correct。正式版应由后端判定对错（见 docs/miniapp-guide.md）。
func (s *RewardService) GrantForAnswer(userID uint, isCorrect bool) (*RewardResult, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, err
	}

	date := today()
	// 跨天则重置当日计数
	if user.RewardDate != date {
		user.RewardDate = date
		user.RewardBricks = 0
	}

	result := &RewardResult{
		DailyCap: DailyBrickCap,
	}

	if isCorrect {
		// 金币用于角色和庭院装饰；接口层限制同一个词每天只领一次。
		result.CoinsEarned = CoinsPerCorrect
		user.Coins += result.CoinsEarned

		remaining := DailyBrickCap - user.RewardBricks
		bricks := BricksPerCorrect
		if bricks > remaining {
			bricks = remaining
			result.Capped = true
		}
		if bricks < 0 {
			bricks = 0
		}

		result.BricksEarned = bricks
		user.Bricks += bricks
		user.RewardBricks += bricks
	}

	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"coins": user.Coins, "bricks": user.Bricks, "reward_date": user.RewardDate, "reward_bricks": user.RewardBricks,
	}).Error; err != nil {
		return nil, err
	}

	result.TotalCoins = user.Coins
	result.TotalBricks = user.Bricks
	result.BricksToday = user.RewardBricks
	return result, nil
}

// GrantCompletionBonus 发放"完成当日全部单词"的奖励。
// 每天只能领一次；若今天已领过则返回 granted=false。
func (s *RewardService) GrantCompletionBonus(userID uint) (granted bool, result *RewardResult, err error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return false, nil, err
	}

	date := today()
	if user.DailyBonusDate == date {
		return false, &RewardResult{
			TotalCoins:  user.Coins,
			TotalBricks: user.Bricks,
			BricksToday: user.RewardBricks,
			DailyCap:    DailyBrickCap,
		}, nil
	}

	// 完成奖励不受每日答题上限约束——它奖励的是"做完"，
	// 而不是又一次答对。否则刷满上限的孩子完成当天任务时拿不到任何东西。
	user.Bricks += DailyCompletionBonus
	user.Coins += CoinsPerCorrect * 2
	user.DailyBonusDate = date

	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"coins": user.Coins, "bricks": user.Bricks, "daily_bonus_date": user.DailyBonusDate,
	}).Error; err != nil {
		return false, nil, err
	}

	return true, &RewardResult{
		CoinsEarned:  CoinsPerCorrect * 2,
		BricksEarned: DailyCompletionBonus,
		TotalCoins:   user.Coins,
		TotalBricks:  user.Bricks,
		BricksToday:  user.RewardBricks,
		DailyCap:     DailyBrickCap,
	}, nil
}

// IsDayComplete 判断用户今天是否已经完成了当日学习量。
//
// 判定依据是"今天答过多少个**不同**的词"，而不是去比对当日下发的名单。
// 原因是名单本身会随答题而改变：答过的词不再是新词，也不再是到期复习词，
// 用它当基准的话集合会缩到空，永远返回"已完成"。
//
// 用 distinct 统计的另一个好处是重复答同一个词只算一次，
// 刷题无法凑出完成状态。
func (s *RewardService) IsDayComplete(userID uint, dailyCount int) (bool, error) {
	if dailyCount <= 0 {
		return false, nil
	}

	// 从本地零点开始统计，而不是 Truncate(24h)（那是 UTC 截断）
	dayStart := DayStart(time.Now())

	var answeredToday int64
	if err := s.db.Model(&models.LearningRecord{}).
		Where("user_id = ? AND created_at >= ?", userID, dayStart).
		Distinct("word_id").
		Count(&answeredToday).Error; err != nil {
		return false, err
	}

	return int(answeredToday) >= dailyCount, nil
}
