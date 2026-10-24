package handlers

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/services"
)

func TestLearningContinuesAfterDailyGoal(t *testing.T) {
	name := os.Getenv("MYSQL_TEST_DB")
	if name == "" {
		t.Skip("set MYSQL_TEST_DB for MySQL integration tests")
	}
	if !strings.HasPrefix(name, "littletown_test_") {
		t.Fatal("MYSQL_TEST_DB must start with littletown_test_")
	}
	t.Setenv("DAILY_WORD_COUNT", "")
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
	user := models.User{OpenID: fmt.Sprintf("continue-learning-%d", time.Now().UnixNano()), Grade: 91, DailyBonusDate: services.TodayString(), RewardDate: "2000-01-01", RewardBricks: 19}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	words := []models.Word{{Word: "apple", Translation: "苹果", Grade: 91}, {Word: "zebra", Translation: "斑马", Grade: 91}, {Word: "water", Translation: "水", Grade: 91}}
	for _, word := range []string{"banana", "cat", "dog", "egg", "fish", "grape", "hat", "ice"} {
		words = append(words, models.Word{Word: word, Translation: word, Grade: 91})
	}
	if err := db.Create(&words).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("user_id = ?", user.ID).Delete(&models.PracticeRound{})
		db.Where("user_id = ?", user.ID).Delete(&models.ReviewSchedule{})
		db.Unscoped().Delete(&user)
		for _, w := range words {
			db.Unscoped().Delete(&w)
		}
	})
	for index, day := range []string{services.TodayString(), "2000-01-01"} {
		if err := db.Create(&models.PracticeRound{ID: fmt.Sprintf("%032x", time.Now().UnixNano()+int64(index)), UserID: user.ID, Day: day, AnsweredWords: "[]", Completed: true, Rewarded: true}).Error; err != nil {
			t.Fatal(err)
		}
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", user.ID) })
	router.GET("/words", NewLearnHandler(db, cfg).GetDailyWords)
	type response struct {
		Words []struct {
			ID       uint `json:"id"`
			IsReview bool `json:"is_review"`
		}
		SessionKind      string                    `json:"session_kind"`
		Next             uint                      `json:"practice_next_id"`
		DailyGoal        int                       `json:"daily_goal"`
		BonusClaimed     bool                      `json:"bonus_claimed"`
		BricksToday      int                       `json:"bricks_today"`
		DailyBrickCap    int                       `json:"daily_brick_cap"`
		BricksPerCorrect int                       `json:"bricks_per_correct"`
		PracticeRewards  *services.PracticeRewards `json:"practice_rewards"`
	}
	get := func(query string) response {
		t.Helper()
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", "/words"+query, nil))
		if w.Code != 200 {
			t.Fatalf("words: %d %s", w.Code, w.Body.String())
		}
		var res response
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatal(err)
		}
		if res.PracticeRewards == nil || res.PracticeRewards.RemainingRounds != 11 || res.PracticeRewards.DailyRoundCap != 12 || res.DailyBrickCap != 20 || res.BricksPerCorrect != 1 || res.DailyGoal != 10 {
			t.Fatalf("all learning modes must include daily reward status: %+v", res)
		}
		return res
	}
	learning := get("")
	if len(learning.Words) != 10 || learning.SessionKind != "learning" {
		t.Fatalf("normal learning must use the larger round: %+v", learning)
	}
	for _, word := range words {
		if err := db.Create(&models.ReviewSchedule{UserID: user.ID, WordID: word.ID, NextReviewAt: time.Now().Add(time.Hour), LastReviewedAt: time.Now()}).Error; err != nil {
			t.Fatal(err)
		}
	}
	first := get("")
	if len(first.Words) != 10 || first.SessionKind != "practice" {
		t.Fatalf("learner with completed goal and learned words cannot continue: %+v", first)
	}
	if !first.BonusClaimed || !first.Words[0].IsReview {
		t.Fatal("practice lost goal or review state")
	}
	if first.BricksToday != 0 {
		t.Fatal("yesterday's answer quota must not count toward today")
	}
	next := get(fmt.Sprintf("?practice_after=%d", first.Next))
	if len(next.Words) != 10 || next.Words[0].ID != words[10].ID || next.Words[1].ID != words[0].ID {
		t.Fatalf("practice must rotate and wrap without duplicates: %+v", next)
	}
	// Fetching free practice does not change due times, awards or study records.
	var due int64
	db.Model(&models.ReviewSchedule{}).Where("user_id = ? AND next_review_at <= ?", user.ID, time.Now()).Count(&due)
	if due != 0 {
		t.Fatal("free practice changed due dates")
	}
	var studied int64
	db.Model(&models.ResidentStudy{}).Where("user_id = ?", user.ID).Count(&studied)
	if studied != 0 {
		t.Fatal("listing practice awarded growth")
	}
	// Even after the daily bonus, a newly available word remains learnable.
	newWord := models.Word{Word: "bird", Translation: "鸟", Grade: 91}
	if err := db.Create(&newWord).Error; err != nil {
		t.Fatal(err)
	}
	words = append(words, newWord)
	if err := db.Model(&user).Updates(map[string]interface{}{"reward_date": services.TodayString(), "reward_bricks": 7}).Error; err != nil {
		t.Fatal(err)
	}
	more := get("")
	if len(more.Words) != 1 || more.Words[0].ID != newWord.ID || more.SessionKind != "learning" {
		t.Fatalf("daily goal must not block new words: %+v", more)
	}
	if more.BricksToday != 7 {
		t.Fatal("normal learning lost today's consumed reward quota")
	}
	// Due reviews have priority over optional practice; deleted vocabulary is never returned.
	if err := db.Model(&models.ReviewSchedule{}).Where("user_id = ? AND word_id = ?", user.ID, words[0].ID).Update("next_review_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	more = get("")
	if len(more.Words) != 2 || more.Words[0].ID != words[0].ID || more.SessionKind != "learning" {
		t.Fatalf("due review priority: %+v", more)
	}
	if err := db.Delete(&words[0]).Error; err != nil {
		t.Fatal(err)
	}
	more = get("")
	for _, word := range more.Words {
		if word.ID == 0 || word.ID == words[0].ID {
			t.Fatal("deleted word returned")
		}
	}
	// A new account without any vocabulary receives an honest empty result, not fake words.
	if err := db.Where("user_id = ?", user.ID).Delete(&models.ReviewSchedule{}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&user).Update("grade", 92).Error; err != nil {
		t.Fatal(err)
	}
	empty := get("")
	if len(empty.Words) != 0 || empty.SessionKind != "empty" {
		t.Fatalf("empty vocabulary: %+v", empty)
	}
}
