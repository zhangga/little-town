package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/middleware"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/services"
)

func TestPracticeHTTPAndRewardedDueWords(t *testing.T) {
	name := os.Getenv("MYSQL_TEST_DB")
	if name == "" {
		t.Skip("set MYSQL_TEST_DB for MySQL integration tests")
	}
	if !strings.HasPrefix(name, "littletown_test_") {
		t.Fatal("MYSQL_TEST_DB must start with littletown_test_")
	}
	cfg := config.Load()
	cfg.DBName = name
	cfg.JWTSecret = "practice-http-key"
	db, err := database.InitDBSilent(cfg)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { sqlDB.Close() })
	if err := database.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	user := models.User{OpenID: fmt.Sprintf("practice-http-%d", time.Now().UnixNano()), Grade: 93}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	word := models.Word{Word: "apple", Translation: "苹果", Grade: 93, Subject: "english"}
	if err := db.Create(&word).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, m := range []interface{}{&models.PracticeRound{}, &models.ResidentStudy{}, &models.ReviewSchedule{}} {
			db.Where("user_id = ?", user.ID).Delete(m)
		}
		db.Unscoped().Delete(&user)
		db.Unscoped().Delete(&word)
	})
	if err := db.Create(&models.ReviewSchedule{UserID: user.ID, WordID: word.ID, NextReviewAt: time.Now().Add(-time.Minute), LastReviewedAt: time.Now().Add(-time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.ResidentStudy{UserID: user.ID, Day: services.TodayString(), WordID: word.ID, Rewarded: true}).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	h := NewLearnHandler(db, cfg)
	r.GET("/words", h.GetDailyWords)
	r.POST("/answer", h.SubmitPracticeAnswer)
	r.POST("/complete", h.CompletePractice)
	auth, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"user_id": user.ID}).SignedString([]byte(cfg.JWTSecret))
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, token string, body interface{}) (int, map[string]interface{}) {
		encoded, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, bytes.NewReader(encoded))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		r.ServeHTTP(w, req)
		var result map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return w.Code, result
	}
	status, data := request("GET", "/words", auth, nil)
	if status != 200 || data["session_kind"] != "practice" {
		t.Fatalf("already rewarded due words should enter practice: %d %+v", status, data)
	}
	ticket, ok := data["practice_token"].(string)
	if !ok || ticket == "" {
		t.Fatal("no practice ticket")
	}
	for _, token := range []string{"", ticket} {
		status, _ := request("POST", "/answer", token, gin.H{"practice_token": ticket, "word_id": word.ID})
		if status != 401 {
			t.Fatalf("practice ticket used as login: %d", status)
		}
	}
	status, _ = request("POST", "/complete", auth, gin.H{"practice_token": ticket})
	if status != 400 {
		t.Fatal("unfinished round rewarded")
	}
	status, _ = request("POST", "/answer", auth, gin.H{"practice_token": ticket, "word_id": word.ID})
	if status != 200 {
		t.Fatalf("answer: %d", status)
	}
	status, data = request("POST", "/complete", auth, gin.H{"practice_token": ticket, "bricks": 999})
	if status != 200 || data["bricks_earned"] != float64(4) || data["coins_earned"] != float64(12) {
		t.Fatalf("completion: %d %+v", status, data)
	}
	status, data = request("POST", "/complete", auth, gin.H{"practice_token": ticket})
	if status != 200 || data["bricks_earned"] != float64(0) || data["round_bricks"] != float64(4) {
		t.Fatalf("replay: %d %+v", status, data)
	}
	// Yesterday's reward does not suppress today's normal scheduled review.
	db.Model(&models.ResidentStudy{}).Where("user_id = ?", user.ID).Update("day", time.Now().AddDate(0, 0, -1).Format("2006-01-02"))
	status, data = request("GET", "/words", auth, nil)
	if status != 200 || data["session_kind"] != "learning" {
		t.Fatalf("next-day review missing: %d %+v", status, data)
	}
}
