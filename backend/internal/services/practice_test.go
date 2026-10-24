package services

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/models"
)

func TestPracticeTicketsBindUserAndWords(t *testing.T) {
	s := NewPracticeService(nil, "test-practice-key")
	token, err := s.NewTicket(7, []uint{11, 12})
	if err != nil {
		t.Fatal(err)
	}
	claims, err := s.parseTicket(7, token)
	if err != nil || len(claims.WordIDs) != 2 {
		t.Fatalf("ticket: %+v %v", claims, err)
	}
	if _, err := s.parseTicket(8, token); err == nil {
		t.Fatal("another user's ticket accepted")
	}
	if _, err := NewPracticeService(nil, "different-key").parseTicket(7, token); err == nil {
		t.Fatal("wrong signature accepted")
	}
	if _, err := s.NewTicket(7, []uint{11, 11}); err == nil {
		t.Fatal("duplicate words accepted")
	}
	if _, err := s.NewTicket(7, nil); err == nil {
		t.Fatal("empty round accepted")
	}
	claims.Day = time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	old, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.key)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.parseTicket(7, old); err != ErrPracticeTicket {
		t.Fatal("yesterday's ticket accepted")
	}
	claims.Day = TodayString()
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute))
	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.key)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.parseTicket(7, expired); err != ErrPracticeTicket {
		t.Fatal("expired ticket accepted")
	}
}

func TestPracticeRewardsMySQL(t *testing.T) {
	name := os.Getenv("MYSQL_TEST_DB")
	if name == "" {
		t.Skip("set MYSQL_TEST_DB for MySQL integration tests")
	}
	if !strings.HasPrefix(name, "littletown_test_") {
		t.Fatal("MYSQL_TEST_DB must start with littletown_test_")
	}
	cfg := config.Load()
	cfg.DBName = name
	db, err := database.InitDBSilent(cfg)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { sqlDB.Close() })
	if err := database.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	user := models.User{OpenID: fmt.Sprintf("practice-%d", time.Now().UnixNano()), Coins: 100, Bricks: 50, RewardDate: TodayString(), RewardBricks: 20}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Where("user_id = ?", user.ID).Delete(&models.PracticeRound{}); db.Unscoped().Delete(&user) })
	s := NewPracticeService(db, "test-practice-key")
	ticket := func() string {
		t.Helper()
		token, err := s.NewTicket(user.ID, []uint{11, 12})
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	answer := func(token string, id uint) {
		t.Helper()
		if err := s.Answer(user.ID, token, id); err != nil {
			t.Fatal(err)
		}
	}
	complete := func(token string) *PracticeResult {
		t.Helper()
		r, err := s.Complete(user.ID, token)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	first := ticket()
	if _, err := s.Complete(user.ID, first); err != ErrPracticeIncomplete {
		t.Fatalf("empty round: %v", err)
	}
	answer(first, 11)
	answer(first, 11)
	if _, err := s.Complete(user.ID, first); err != ErrPracticeIncomplete {
		t.Fatalf("duplicate counted: %v", err)
	}
	if err := s.Answer(user.ID, first, 99); err != ErrPracticeTicket {
		t.Fatalf("unissued word: %v", err)
	}
	answer(first, 12)
	var wg sync.WaitGroup
	var earned atomic.Int64
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, err := s.Complete(user.ID, first)
			if err != nil {
				t.Error(err)
				return
			}
			earned.Add(int64(r.BricksEarned))
		}()
	}
	wg.Wait()
	if earned.Load() != 4 {
		t.Fatalf("concurrent reward: %d", earned.Load())
	}
	if r := complete(first); r.BricksEarned != 0 || !r.AlreadyCompleted {
		t.Fatalf("replayed round: %+v", r)
	}
	for i := 0; i < 11; i++ {
		token := ticket()
		answer(token, 11)
		answer(token, 12)
		r := complete(token)
		if r.BricksEarned != 4 || r.CoinsEarned != 12 || r.PracticeRewards.RemainingRounds != 10-i || r.PracticeRewards.DailyRoundCap != 12 {
			t.Fatalf("reward: %+v", r)
		}
	}
	token := ticket()
	answer(token, 11)
	answer(token, 12)
	if r := complete(token); r.BricksEarned != 0 || r.CoinsEarned != 0 || !r.Capped || r.PracticeRewards.RemainingRounds != 0 {
		t.Fatalf("cap: %+v", r)
	}
	var stored models.User
	db.First(&stored, user.ID)
	if stored.Bricks != 98 || stored.Coins != 244 || stored.RewardBricks != 20 || stored.DailyBonusDate != "" {
		t.Fatalf("wallet or ordinary rewards changed: %+v", stored)
	}
	var studies int64
	db.Model(&models.ResidentStudy{}).Where("user_id = ?", user.ID).Count(&studies)
	if studies != 0 {
		t.Fatal("practice awarded growth")
	}
	var schedules int64
	db.Model(&models.ReviewSchedule{}).Where("user_id = ?", user.ID).Count(&schedules)
	if schedules != 0 {
		t.Fatal("practice changed review schedules")
	}
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	if err := db.Model(&models.PracticeRound{}).Where("user_id = ?", user.ID).Update("day", yesterday).Error; err != nil {
		t.Fatal(err)
	}
	status, err := s.Status(user.ID)
	if err != nil || status.RemainingRounds != 12 {
		t.Fatalf("new day: %+v %v", status, err)
	}
	// The persisted date must still agree with its signed ticket.
	if _, err := s.Complete(user.ID, first); err != ErrPracticeTicket {
		t.Fatalf("old round replayed on new day: %v", err)
	}
	token = ticket()
	answer(token, 11)
	answer(token, 12)
	if r := complete(token); r.BricksEarned != 4 {
		t.Fatal("daily quota did not reset")
	}
	// Several different rounds completing at once still share the same daily cap.
	var second models.User
	second.OpenID = user.OpenID + "-concurrent"
	if err := db.Create(&second).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("user_id = ?", second.ID).Delete(&models.PracticeRound{})
		db.Unscoped().Delete(&second)
	})
	var total atomic.Int64
	for i := 0; i < 16; i++ {
		token, err := s.NewTicket(second.ID, []uint{11})
		if err != nil {
			t.Fatal(err)
		}
		if err := s.Answer(second.ID, token, 11); err != nil {
			t.Fatal(err)
		}
		wg.Add(1)
		go func(token string) {
			defer wg.Done()
			r, err := s.Complete(second.ID, token)
			if err != nil {
				t.Error(err)
				return
			}
			total.Add(int64(r.BricksEarned))
		}(token)
	}
	wg.Wait()
	if total.Load() != 48 {
		t.Fatalf("concurrent daily cap: %d", total.Load())
	}
}
