package services

import (
	"errors"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

type SchoolRewards struct {
	Subject          string           `json:"subject"`
	DailyGoal        int              `json:"daily_goal"`
	CompletedToday   int              `json:"completed_today"`
	BricksPerCorrect int              `json:"bricks_per_correct"`
	DailyBrickCap    int              `json:"daily_brick_cap"`
	BricksToday      int              `json:"bricks_today"`
	BonusBricks      int              `json:"bonus_bricks"`
	BonusClaimed     bool             `json:"bonus_claimed"`
	PracticeRewards  *PracticeRewards `json:"practice_rewards"`
}

func schoolDaily(db *gorm.DB, userID uint, subject string) (*models.SchoolDaily, error) {
	daily := &models.SchoolDaily{}
	err := db.Where("user_id = ? AND day = ? AND subject = ?", userID, TodayString(), subject).First(daily).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &models.SchoolDaily{UserID: userID, Day: TodayString(), Subject: subject}, nil
	}
	return daily, err
}

// EnglishDailyCompleted counts a word once across the original and school classrooms.
func EnglishDailyCompleted(db *gorm.DB, userID uint) (int, error) {
	var original, school int64
	if err := db.Model(&models.ResidentStudy{}).Where("user_id = ? AND day = ?", userID, TodayString()).Count(&original).Error; err != nil {
		return 0, err
	}
	err := db.Model(&models.SchoolStudy{}).
		Where("user_id = ? AND day = ? AND subject = ?", userID, TodayString(), "english").
		Where(`word_id = 0 OR NOT EXISTS (
			SELECT 1 FROM resident_studies r JOIN words w ON w.id = r.word_id
			JOIN words school_word ON school_word.id = school_studies.word_id
			WHERE r.user_id = school_studies.user_id AND r.day = school_studies.day
			AND LOWER(w.word) = LOWER(school_word.word) AND w.translation = school_word.translation
		)`).Count(&school).Error
	return int(original + school), err
}

func SchoolWordRewarded(db *gorm.DB, userID, wordID uint) (bool, error) {
	var word models.Word
	if err := db.First(&word, wordID).Error; err != nil {
		return false, err
	}
	// The same vocabulary appears under different grade-specific catalog IDs.
	ids := db.Model(&models.Word{}).Select("id").Where("LOWER(word) = LOWER(?) AND translation = ? AND subject = ?", word.Word, word.Translation, "english")
	var count int64
	err := db.Model(&models.SchoolStudy{}).Where("user_id = ? AND day = ? AND subject = ? AND word_id IN (?) AND rewarded = ?", userID, TodayString(), "english", ids, true).Count(&count).Error
	return count > 0, err
}

func (s *SchoolService) status(db *gorm.DB, user *models.User, subject string) (*SchoolRewards, error) {
	status := &SchoolRewards{Subject: subject, DailyGoal: s.goal, BricksPerCorrect: BricksPerCorrect,
		DailyBrickCap: DailyBrickCap, BonusBricks: DailyCompletionBonus}
	if subject == "english" {
		if user.RewardDate == TodayString() {
			status.BricksToday = user.RewardBricks
		}
		status.BonusClaimed = user.DailyBonusDate == TodayString()
		count, err := EnglishDailyCompleted(db, user.ID)
		if err != nil {
			return nil, err
		}
		status.CompletedToday = count
	} else {
		daily, err := schoolDaily(db, user.ID, subject)
		if err != nil {
			return nil, err
		}
		status.BricksToday, status.BonusClaimed = daily.Bricks, daily.BonusClaimed
		var count int64
		if err := db.Model(&models.SchoolStudy{}).Where("user_id = ? AND day = ? AND subject = ?", user.ID, TodayString(), subject).Count(&count).Error; err != nil {
			return nil, err
		}
		status.CompletedToday = int(count)
	}
	practice, err := schoolPracticeStatus(db, user.ID, subject)
	status.PracticeRewards = practice
	return status, err
}

func schoolPracticeStatus(db *gorm.DB, userID uint, subject string) (*PracticeRewards, error) {
	var school, original int64
	if err := db.Model(&models.SchoolRound{}).Where("user_id = ? AND day = ? AND subject = ? AND kind = ? AND rewarded = ?", userID, TodayString(), subject, "practice", true).Count(&school).Error; err != nil {
		return nil, err
	}
	if subject == "english" {
		if err := db.Model(&models.PracticeRound{}).Where("user_id = ? AND day = ? AND rewarded = ?", userID, TodayString(), true).Count(&original).Error; err != nil {
			return nil, err
		}
	}
	count := int(school + original)
	return &PracticeRewards{BricksPerRound: PracticeBricksPerRound, CoinsPerRound: PracticeCoinsPerRound,
		DailyRoundCap: PracticeDailyRounds, RewardedRounds: count, RemainingRounds: max(0, PracticeDailyRounds-count)}, nil
}

func (s *SchoolService) Status(userID uint) (map[string]*SchoolRewards, error) {
	result := map[string]*SchoolRewards{}
	// A single read snapshot avoids mixing balances and counters from simultaneous submissions.
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.First(&user, userID).Error; err != nil {
			return err
		}
		for _, subject := range []string{"chinese", "math", "english"} {
			status, err := s.status(tx, &user, subject)
			if err != nil {
				return err
			}
			result[subject] = status
		}
		return nil
	})
	return result, err
}

// grantSchoolAnswer runs under the same user lock as spending, original English and practice rewards.
// Correctness remains reported by the mini-program, matching the original English API.
// Handwriting reports completion, not an automatic handwriting score.
func (s *SchoolService) grantSchoolAnswer(tx *gorm.DB, user *models.User, round *models.SchoolRound, q SchoolQuestion, correct bool) error {
	study := models.SchoolStudy{}
	err := tx.Where("user_id = ? AND day = ? AND subject = ? AND question_key = ?", user.ID, round.Day, round.Subject, q.Key).First(&study).Error
	first := errors.Is(err, gorm.ErrRecordNotFound)
	if err != nil && !first {
		return err
	}
	if first {
		study = models.SchoolStudy{UserID: user.ID, Day: round.Day, Subject: round.Subject, QuestionKey: q.Key, WordID: q.WordID}
	}
	eligible := correct && !study.Rewarded
	if eligible && q.WordID != 0 {
		var count int64
		ids := tx.Model(&models.Word{}).Select("id").Where("LOWER(word) = ? AND translation = ? AND subject = ?", q.Word, q.Translation, "english")
		if err := tx.Model(&models.ResidentStudy{}).Where("user_id = ? AND day = ? AND word_id IN (?) AND rewarded = ?", user.ID, round.Day, ids, true).Count(&count).Error; err != nil {
			return err
		}
		eligible = count == 0
	}
	study.Rewarded = study.Rewarded || correct
	if err := tx.Save(&study).Error; err != nil {
		return err
	}
	status, err := s.status(tx, user, round.Subject)
	if err != nil {
		return err
	}
	bricks, coins := 0, 0
	if eligible {
		bricks = min(BricksPerCorrect, max(0, DailyBrickCap-status.BricksToday))
		coins = CoinsPerCorrect
	}
	bonus := !status.BonusClaimed && status.CompletedToday >= s.goal
	if round.Subject == "english" {
		user.RewardDate = round.Day
		user.RewardBricks = status.BricksToday + bricks
		if bonus {
			user.DailyBonusDate = round.Day
		}
	} else {
		daily, err := schoolDaily(tx, user.ID, round.Subject)
		if err != nil {
			return err
		}
		daily.Bricks += bricks
		daily.BonusClaimed = daily.BonusClaimed || bonus
		if err := tx.Save(daily).Error; err != nil {
			return err
		}
	}
	if bonus {
		bricks += DailyCompletionBonus
		coins += CoinsPerCorrect * 2
	}
	user.Bricks += bricks
	user.Coins += coins
	round.Bricks += bricks
	round.Coins += coins
	return tx.Model(user).Updates(map[string]interface{}{"bricks": user.Bricks, "coins": user.Coins, "reward_date": user.RewardDate,
		"reward_bricks": user.RewardBricks, "daily_bonus_date": user.DailyBonusDate}).Error
}
