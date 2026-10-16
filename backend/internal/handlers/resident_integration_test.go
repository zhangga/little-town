package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Only run against an explicitly named disposable database, never the app database.
func TestResidentMySQLLifecycle(t *testing.T) {
	name := os.Getenv("MYSQL_TEST_DB")
	if name == "" {
		t.Skip("set MYSQL_TEST_DB for MySQL integration tests")
	}
	if !strings.HasPrefix(name, "littletown_test_") {
		t.Fatal("MYSQL_TEST_DB must start with littletown_test_")
	}
	cfg := config.Load()
	cfg.DBName = name
	cfg.DailyWordCount = 2
	db, err := database.InitDBSilent(cfg)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { sqlDB.Close() })
	if err := database.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	db = db.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
	user := models.User{OpenID: fmt.Sprintf("resident-test-%d", time.Now().UnixNano()), Coins: 200, Bricks: 100, Grade: 1}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	other := models.User{OpenID: user.OpenID + "-other", Grade: 1}
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	words := []models.Word{{Word: "apple", Translation: "苹果", Grade: 1}, {Word: "zebra", Translation: "斑马", Grade: 1}, {Word: "water", Translation: "水", Grade: 1}}
	if err := db.Create(&words).Error; err != nil {
		t.Fatal(err)
	}
	building := models.Building{Name: "测试商店", CostBricks: 6}
	if err := db.Create(&building).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ids := []uint{user.ID, other.ID}
		for _, model := range []interface{}{&models.ResidentStudy{}, &models.ResidentItem{}, &models.Resident{}, &models.ReviewSchedule{}, &models.LearningRecord{}, &models.UserBuilding{}} {
			db.Where("user_id IN ?", ids).Delete(model)
		}
		db.Unscoped().Delete(&models.User{}, ids)
		for _, word := range words {
			db.Unscoped().Delete(&word)
		}
		db.Unscoped().Delete(&building)
	})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", user.ID) })
	h := NewResidentHandler(db, cfg)
	learn := NewLearnHandler(db, cfg)
	router.GET("/resident", h.Get)
	router.PUT("/resident", h.Rename)
	router.POST("/purchase", h.Purchase)
	router.POST("/equip", h.Equip)
	router.POST("/upgrade", h.UpgradeHome)
	router.POST("/answer", learn.SubmitAnswer)
	router.POST("/build", NewBuildingHandler(db).BuildBuilding)
	request := func(method, path string, body interface{}) (int, map[string]interface{}) {
		data, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)
		var result map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &result)
		return w.Code, result
	}
	ok := func(method, path string, body interface{}) map[string]interface{} {
		t.Helper()
		status, result := request(method, path, body)
		if status != 200 {
			t.Fatalf("%s %s: %d %+v", method, path, status, result)
		}
		return result
	}
	reject := func(path string, body interface{}) {
		t.Helper()
		status, result := request("POST", path, body)
		if status != 400 {
			t.Fatalf("expected rejected %s: %d %+v", path, status, result)
		}
	}
	wallet := func(coins, bricks int) {
		t.Helper()
		var stored models.User
		if err := db.First(&stored, user.ID).Error; err != nil {
			t.Fatal(err)
		}
		if stored.Coins != coins || stored.Bricks != bricks {
			t.Fatalf("wallet=(%d,%d), want=(%d,%d)", stored.Coins, stored.Bricks, coins, bricks)
		}
	}
	answer := func(index int, correct bool) map[string]interface{} {
		return ok("POST", "/answer", gin.H{"word_id": words[index].ID, "is_correct": correct})
	}
	initial := ok("GET", "/resident", nil)["resident"].(map[string]interface{})
	if initial["outfit_id"] != "everyday" || initial["home_level"] != float64(1) {
		t.Fatalf("bad initial resident: %+v", initial)
	}
	ok("PUT", "/resident", gin.H{"name": "  阿圆🌱  "})
	status, _ := request("PUT", "/resident", gin.H{"name": "一二三四五六七八九十一二三"})
	if status != 400 {
		t.Fatal("long name accepted")
	}
	if ok("GET", "/resident", nil)["resident"].(map[string]interface{})["name"] != "阿圆🌱" {
		t.Fatal("name did not persist")
	}
	reject("/equip", gin.H{"item_id": "builder"})
	reject("/purchase", gin.H{"item_id": "unknown"})
	// Two devices purchasing the same outfit charge once, including a tampered client price.
	var wg sync.WaitGroup
	codes := make(chan int, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code, _ := request("POST", "/purchase", gin.H{"item_id": "builder", "price": 0})
			codes <- code
		}()
	}
	wg.Wait()
	close(codes)
	for code := range codes {
		if code != 200 {
			t.Fatalf("parallel purchase: %d", code)
		}
	}
	wallet(140, 100)
	var owned int64
	db.Model(&models.ResidentItem{}).Where("user_id = ?", user.ID).Count(&owned)
	if owned != 1 {
		t.Fatal("duplicate ownership")
	}
	ok("POST", "/equip", gin.H{"item_id": "everyday"})
	ok("POST", "/equip", gin.H{"item_id": "builder"})
	wallet(140, 100)
	// A stale upgrade request cannot charge for a second level.
	codes = make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code, _ := request("POST", "/upgrade", gin.H{"expected_level": 1})
			codes <- code
		}()
	}
	wg.Wait()
	close(codes)
	successes := 0
	for code := range codes {
		if code == 200 {
			successes++
		} else if code != 400 {
			t.Fatalf("upgrade %d", code)
		}
	}
	if successes != 1 {
		t.Fatal("duplicate upgrade succeeded")
	}
	wallet(140, 85)
	first := answer(0, false)
	if first["xp_earned"] != float64(5) {
		t.Fatalf("first attempt XP: %+v", first)
	}
	corrected := answer(0, true)
	if corrected["xp_earned"] != float64(0) || corrected["coins_earned"] != float64(5) {
		t.Fatalf("correction: %+v", corrected)
	}
	repeat := answer(0, true)
	if repeat["xp_earned"] != float64(0) || repeat["coins_earned"] != float64(0) {
		t.Fatal("repeat rewards")
	}
	second := answer(1, true)
	if second["xp_earned"] != float64(15) || second["bonus_granted"] != true {
		t.Fatalf("daily completion: %+v", second)
	}
	answer(1, true)
	wallet(160, 97)
	extra := answer(2, true)
	if extra["xp_earned"] != float64(0) {
		t.Fatal("XP exceeded daily goal")
	}
	wallet(165, 98)
	status, _ = request("POST", "/answer", gin.H{"word_id": 4294967295, "is_correct": true})
	if status != 404 {
		t.Fatal("unknown word accepted")
	}
	wallet(165, 98)
	// Simultaneous learning, building and purchasing retain every change to the wallet.
	yesterday := services.DayStart(time.Now()).AddDate(0, 0, -1).Format("2006-01-02")
	if err := db.Model(&models.ResidentStudy{}).Where("user_id = ?", user.ID).Update("day", yesterday).Error; err != nil {
		t.Fatal(err)
	}
	db.Model(&models.Resident{}).Where("user_id = ?", user.ID).Update("xp_bonus_date", yesterday)
	db.Model(&models.User{}).Where("id = ?", user.ID).Updates(map[string]interface{}{"daily_bonus_date": yesterday, "reward_date": yesterday})
	paths := []string{"/answer", "/purchase", "/build"}
	bodies := []interface{}{gin.H{"word_id": words[0].ID, "is_correct": true}, gin.H{"item_id": "flowers"}, gin.H{"building_id": building.ID}}
	codes = make(chan int, 3)
	for i := range paths {
		wg.Add(1)
		go func(i int) { defer wg.Done(); code, _ := request("POST", paths[i], bodies[i]); codes <- code }(i)
	}
	wg.Wait()
	close(codes)
	for code := range codes {
		if code != 200 {
			t.Fatalf("concurrent mutation %d", code)
		}
	}
	wallet(130, 93)
	reject("/build", gin.H{"building_id": building.ID})
	wallet(130, 93)
	state := ok("GET", "/resident", nil)
	daily := state["daily"].(map[string]interface{})
	if daily["completed"] != float64(1) || daily["reviews"] != float64(1) || daily["done"] != false {
		t.Fatalf("review day %+v", daily)
	}
	answer(1, true)
	wallet(145, 104)
	ok("POST", "/upgrade", gin.H{"expected_level": 2})
	wallet(145, 74)
	reject("/upgrade", gin.H{"expected_level": 3})
	isolated, err := services.NewResidentService(db, 2).Get(other.ID)
	if err != nil || isolated.Resident.Name != "小镇长" || isolated.Resident.Experience != 0 {
		t.Fatalf("user isolation: %+v %v", isolated, err)
	}
	if _, err := services.NewResidentService(db, 2).Purchase(other.ID, "builder"); err != services.ErrResidentCoins {
		t.Fatalf("insufficient coins: %v", err)
	}
	if _, err := services.NewResidentService(db, 2).UpgradeHome(other.ID, 1); err != services.ErrResidentBricks {
		t.Fatalf("insufficient bricks: %v", err)
	}
}
