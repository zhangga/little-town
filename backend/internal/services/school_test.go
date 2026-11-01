package services

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func schoolDB(t *testing.T) (*gorm.DB, models.User) {
	t.Helper()
	name := os.Getenv("MYSQL_TEST_DB")
	if name == "" {
		t.Skip("set MYSQL_TEST_DB for MySQL integration tests")
	}
	if !strings.HasPrefix(name, "littletown_test_") {
		t.Fatal("test database required")
	}
	cfg := config.Load()
	cfg.DBName = name
	db, err := database.InitDBSilent(cfg)
	if err != nil {
		t.Fatal(err)
	}
	sql, _ := db.DB()
	t.Cleanup(func() { sql.Close() })
	if err := database.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	user := models.User{OpenID: fmt.Sprintf("school-%d", time.Now().UnixNano()), Bricks: 100, Coins: 100}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, model := range []interface{}{&models.SchoolRound{}, &models.SchoolStudy{}, &models.SchoolDaily{}, &models.PracticeRound{}, &models.ResidentStudy{}} {
			db.Where("user_id = ?", user.ID).Delete(model)
		}
		db.Unscoped().Delete(&user)
	})
	return db, user
}
func schoolRequest(subject, kind string, count int, prefix string) SchoolStart {
	questions := make([]SchoolQuestion, count)
	for i := range questions {
		questions[i] = SchoolQuestion{Key: fmt.Sprintf("%s-%d", prefix, i), Kind: "choice"}
	}
	return SchoolStart{RoundID: fmt.Sprintf("%032x", time.Now().UnixNano()), Subject: subject, Kind: kind, Questions: questions}
}
func schoolFinish(t *testing.T, s *SchoolService, userID uint, req SchoolStart) *SchoolResult {
	t.Helper()
	if _, err := s.Start(userID, req); err != nil {
		t.Fatal(err)
	}
	for i := range req.Questions {
		if _, err := s.Answer(userID, req.RoundID, i, true); err != nil {
			t.Fatal(err)
		}
	}
	result, err := s.Complete(userID, req.RoundID)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestSchoolSubjectsHaveIndependentIdenticalRewards(t *testing.T) {
	db, user := schoolDB(t)
	s := NewSchoolService(db, 10)
	for subjectIndex, subject := range []string{"chinese", "math", "english"} {
		req := schoolRequest(subject, "learning", 25, "daily")
		result := schoolFinish(t, s, user.ID, req)
		if result.RoundBricks != 30 || result.RoundCoins != 135 || result.Rewards.BricksToday != 20 || !result.Rewards.BonusClaimed {
			t.Fatalf("%s: %+v %+v", subject, result, result.Rewards)
		}
		// Same question in a new round does not pay again or increase daily completion.
		repeat := schoolRequest(subject, "learning", 25, "daily")
		if r := schoolFinish(t, s, user.ID, repeat); r.RoundBricks != 0 || r.RoundCoins != 0 || r.Rewards.CompletedToday != 25 {
			t.Fatalf("duplicate daily: %+v", r)
		}
		for i := 0; i < 13; i++ {
			r := schoolFinish(t, s, user.ID, schoolRequest(subject, "practice", 10, "review"))
			want := 4
			if i == 12 {
				want = 0
			}
			if r.RoundBricks != want || r.Rewards.PracticeRewards.RemainingRounds != max(0, 11-i) {
				t.Fatalf("practice cap: %+v", r)
			}
		}
		status, err := s.Status(user.ID)
		if err != nil {
			t.Fatal(err)
		}
		if subjectIndex == 0 && (status["math"].BricksToday != 0 || status["english"].PracticeRewards.RemainingRounds != 12) {
			t.Fatal("one subject used another subject's allowance")
		}
	}
	var stored models.User
	db.First(&stored, user.ID)
	if stored.Bricks != 100+3*(30+48) || stored.Coins != 100+3*(135+144) {
		t.Fatalf("wallet: %+v", stored)
	}
}

func TestSchoolRoundRetryOwnershipAndCompletion(t *testing.T) {
	db, user := schoolDB(t)
	s := NewSchoolService(db, 10)
	req := schoolRequest("math", "learning", 2, "retry")
	if _, err := s.Start(user.ID, req); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Start(user.ID, req); err != nil {
		t.Fatal("lost start response cannot retry", err)
	}
	changed := req
	changed.Subject = "chinese"
	if _, err := s.Start(user.ID, changed); err != ErrSchoolRound {
		t.Fatal("changed subject accepted", err)
	}
	if _, err := s.Answer(user.ID+100000, req.RoundID, 0, true); err == nil {
		t.Fatal("another owner accepted")
	}
	if _, err := s.Answer(user.ID, req.RoundID, 2, true); err != ErrSchoolRound {
		t.Fatal("unissued index accepted")
	}
	if _, err := s.Complete(user.ID, req.RoundID); err != ErrSchoolIncomplete {
		t.Fatal("unfinished round accepted")
	}
	r, err := s.Answer(user.ID, req.RoundID, 0, false)
	if err != nil || r.RoundBricks != 0 {
		t.Fatal(r, err)
	}
	r, err = s.Answer(user.ID, req.RoundID, 0, true)
	if err != nil || r.RoundBricks != 0 {
		t.Fatal("first answer was overwritten", r, err)
	}
	if _, err := s.Answer(user.ID, req.RoundID, 1, true); err != nil {
		t.Fatal(err)
	}
	r, err = s.Complete(user.ID, req.RoundID)
	if err != nil || r.RoundBricks != 1 {
		t.Fatal(r, err)
	}
	r, err = s.Complete(user.ID, req.RoundID)
	if err != nil || r.TotalBricks != 101 {
		t.Fatal("duplicate complete paid", r, err)
	}
	// A later learning round may correct the original wrong answer, once.
	correction := schoolRequest("math", "learning", 1, "retry")
	if r := schoolFinish(t, s, user.ID, correction); r.RoundBricks != 1 || r.Rewards.CompletedToday != 2 {
		t.Fatal("correction or distinct count", r)
	}
	bad := schoolRequest("math", "practice", 5, "short")
	if _, err := s.Start(user.ID, bad); err != ErrSchoolRound {
		t.Fatal("short practice round accepted")
	}
	db.Model(&models.SchoolRound{}).Where("id = ?", req.RoundID).Update("day", "2000-01-01")
	if _, err := s.Complete(user.ID, req.RoundID); err != ErrSchoolExpired {
		t.Fatal("old day accepted")
	}
	if _, err := s.Start(user.ID, req); err != ErrSchoolExpired {
		t.Fatal("old start accepted")
	}
}

func TestSchoolConcurrentPracticeSharesOldEnglishQuotaAndWalletLock(t *testing.T) {
	db, user := schoolDB(t)
	s := NewSchoolService(db, 10)
	original := NewPracticeService(db, "school-test")
	// An existing English classroom round consumes one of the SAME twelve rounds.
	token, err := original.NewTicket(user.ID, []uint{11})
	if err != nil {
		t.Fatal(err)
	}
	if err := original.Answer(user.ID, token, 11); err != nil {
		t.Fatal(err)
	}
	if _, err := original.Complete(user.ID, token); err != nil {
		t.Fatal(err)
	}
	var requests []SchoolStart
	for i := 0; i < 14; i++ {
		req := schoolRequest("english", "practice", 10, "review")
		if _, err := s.Start(user.ID, req); err != nil {
			t.Fatal(err)
		}
		for j := range req.Questions {
			if _, err := s.Answer(user.ID, req.RoundID, j, false); err != nil {
				t.Fatal(err)
			}
		}
		requests = append(requests, req)
	}
	var wg sync.WaitGroup
	for _, req := range append(requests, requests[0], requests[0]) {
		wg.Add(1)
		go func(req SchoolStart) {
			defer wg.Done()
			if _, err := s.Complete(user.ID, req.RoundID); err != nil {
				t.Error(err)
			}
		}(req)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := db.Transaction(func(tx *gorm.DB) error {
			var wallet models.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&wallet, user.ID).Error; err != nil {
				return err
			}
			return tx.Model(&wallet).Update("bricks", wallet.Bricks-7).Error
		}); err != nil {
			t.Error(err)
		}
	}()
	wg.Wait()
	status, err := original.Status(user.ID)
	if err != nil || status.RemainingRounds != 0 || status.RewardedRounds != 12 {
		t.Fatal(status, err)
	}
	var stored models.User
	db.First(&stored, user.ID)
	if stored.Bricks != 100+48-7 || stored.Coins != 100+144 {
		t.Fatalf("concurrent wallet: %+v", stored)
	}
	// Original English cannot award a thirteenth round either.
	token, _ = original.NewTicket(user.ID, []uint{11})
	_ = original.Answer(user.ID, token, 11)
	if r, err := original.Complete(user.ID, token); err != nil || r.BricksEarned != 0 || !r.Capped {
		t.Fatal(r, err)
	}
}

func TestSchoolDayResetAndEnglishWordDedup(t *testing.T) {
	db, user := schoolDB(t)
	s := NewSchoolService(db, 2)
	word := models.Word{Word: "school-test-word", Translation: "测试单词", Subject: "english", Grade: 99}
	if err := db.Create(&word).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Unscoped().Delete(&word) })
	db.Create(&models.ResidentStudy{UserID: user.ID, Day: TodayString(), WordID: word.ID, Rewarded: true})
	req := schoolRequest("english", "learning", 1, "word")
	req.Questions[0].Word, req.Questions[0].Translation = word.Word, word.Translation
	if r := schoolFinish(t, s, user.ID, req); r.RoundBricks != 0 || r.Rewards.CompletedToday != 1 {
		t.Fatal("old English word paid twice", r)
	}
	r := schoolFinish(t, s, user.ID, schoolRequest("english", "learning", 1, "sentence"))
	if r.RoundBricks != 11 || !r.Rewards.BonusClaimed {
		t.Fatal("combined English goal", r)
	}
	for _, subject := range []string{"math", "chinese"} {
		schoolFinish(t, s, user.ID, schoolRequest(subject, "learning", 2, "fresh"))
	}
	for _, model := range []interface{}{&models.SchoolDaily{}, &models.SchoolStudy{}, &models.ResidentStudy{}} {
		db.Model(model).Where("user_id = ?", user.ID).Update("day", "2000-01-01")
	}
	db.Model(&user).Updates(map[string]interface{}{"reward_date": "2000-01-01", "daily_bonus_date": "2000-01-01"})
	status, err := s.Status(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	for subject, reward := range status {
		if reward.BricksToday != 0 || reward.BonusClaimed || reward.CompletedToday != 0 {
			t.Fatal(subject, reward)
		}
	}
	for _, subject := range []string{"chinese", "math", "english"} {
		r := schoolFinish(t, s, user.ID, schoolRequest(subject, "learning", 2, "fresh"))
		if r.RoundBricks != 12 {
			t.Fatal("new day missing rewards", subject, r)
		}
	}
}
