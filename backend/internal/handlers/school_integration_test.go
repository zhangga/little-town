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

func TestSchoolHTTPAndOriginalEnglishShareRewards(t *testing.T) {
	name := os.Getenv("MYSQL_TEST_DB")
	if name == "" {
		t.Skip("set MYSQL_TEST_DB for MySQL integration tests")
	}
	if !strings.HasPrefix(name, "littletown_test_") {
		t.Fatal("test database required")
	}
	cfg := config.Load()
	cfg.DBName = name
	cfg.JWTSecret = "school-http-test"
	cfg.DailyWordCount = 2
	db, err := database.InitDBSilent(cfg)
	if err != nil {
		t.Fatal(err)
	}
	sql, _ := db.DB()
	t.Cleanup(func() { sql.Close() })
	if err := database.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	user := models.User{OpenID: fmt.Sprintf("school-http-%d", time.Now().UnixNano()), Grade: 99}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	words := []models.Word{{Word: "school-http-alpha", Translation: "甲", Grade: 98}, {Word: "school-http-beta", Translation: "乙", Grade: 99}, {Word: "school-http-alpha", Translation: "甲", Grade: 99}}
	if err := db.Create(&words).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, m := range []interface{}{&models.SchoolRound{}, &models.SchoolStudy{}, &models.SchoolDaily{}, &models.ResidentStudy{}, &models.Resident{}, &models.LearningRecord{}, &models.ReviewSchedule{}} {
			db.Where("user_id = ?", user.ID).Delete(m)
		}
		db.Unscoped().Delete(&user)
		for _, word := range words {
			db.Unscoped().Delete(&word)
		}
	})
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	h := NewLearnHandler(db, cfg)
	r.GET("/status", h.SchoolRewards)
	r.POST("/start", h.StartSchoolRound)
	r.POST("/answer", h.SchoolAnswer)
	r.POST("/complete", h.CompleteSchoolRound)
	r.POST("/old-answer", h.SubmitAnswer)
	auth, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"user_id": user.ID}).SignedString([]byte(cfg.JWTSecret))
	request := func(path string, body interface{}, token string, expected int) map[string]interface{} {
		t.Helper()
		data, _ := json.Marshal(body)
		method := "POST"
		if path == "/status" {
			method = "GET"
		}
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != expected {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
		var result map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	request("/status", nil, "", 401)
	request("/answer", gin.H{"round_id": "fake", "index": 0}, auth, 400)
	id := fmt.Sprintf("%032x", time.Now().UnixNano())
	start := services.SchoolStart{RoundID: id, Subject: "english", Kind: "learning", Questions: []services.SchoolQuestion{{Key: "first-word", Kind: "spell", Word: words[0].Word, Translation: words[0].Translation}}}
	request("/start", start, auth, 200)
	request("/complete", gin.H{"round_id": id}, auth, 400)
	answer := request("/answer", gin.H{"round_id": id, "index": 0, "correct": true, "bricks": 999}, auth, 200)
	if answer["round_bricks"] != float64(1) {
		t.Fatal("client amount trusted", answer)
	}
	request("/answer", gin.H{"round_id": id, "index": 0, "correct": true}, auth, 200)
	request("/complete", gin.H{"round_id": id}, auth, 200)
	old := request("/old-answer", gin.H{"word_id": words[2].ID, "is_correct": true}, auth, 200)
	if old["bricks_earned"] != float64(0) || old["coins_earned"] != float64(0) {
		t.Fatal("word paid again in old English", old)
	}
	old = request("/old-answer", gin.H{"word_id": words[1].ID, "is_correct": true}, auth, 200)
	if old["bricks_earned"] != float64(11) || old["total_bricks"] != float64(12) {
		t.Fatal("shared daily goal or wallet", old)
	}
	start.RoundID = fmt.Sprintf("%032x", time.Now().UnixNano())
	start.Questions[0] = services.SchoolQuestion{Key: "different-mode", Kind: "choice", Word: words[1].Word, Translation: words[1].Translation}
	request("/start", start, auth, 200)
	answer = request("/answer", gin.H{"round_id": start.RoundID, "index": 0, "correct": true}, auth, 200)
	if answer["round_bricks"] != float64(0) || answer["total_bricks"] != float64(12) {
		t.Fatal("old English word paid again in school", answer)
	}
	status := request("/status", nil, auth, 200)["subjects"].(map[string]interface{})
	english := status["english"].(map[string]interface{})
	if english["bricks_today"] != float64(2) || english["completed_today"] != float64(2) || english["bonus_claimed"] != true {
		t.Fatal("shared English status", english)
	}
	if status["math"].(map[string]interface{})["bricks_today"] != float64(0) {
		t.Fatal("English consumed math quota")
	}
	db.Model(&models.SchoolRound{}).Where("id = ?", id).Update("day", "2000-01-01")
	request("/complete", gin.H{"round_id": id}, auth, 410)
}
