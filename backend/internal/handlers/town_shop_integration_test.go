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

func TestTownShopMySQLLifecycle(t *testing.T) {
	name := os.Getenv("MYSQL_TEST_DB")
	if name == "" {
		t.Skip("set MYSQL_TEST_DB for MySQL integration tests")
	}
	if !strings.HasPrefix(name, "littletown_test_") {
		t.Fatal("test database prefix required")
	}
	cfg := config.Load()
	cfg.DBName = name
	db, err := database.InitDBSilent(cfg)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	if err = database.AutoMigrate(db); err != nil {
		t.Fatal(err)
	}
	db = db.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
	users := []models.User{{OpenID: fmt.Sprint("shop-", time.Now().UnixNano()), Coins: 20}, {OpenID: fmt.Sprint("shop-other-", time.Now().UnixNano()), Coins: 0}}
	buildings := []models.Building{{Name: "商店"}, {Name: "餐厅"}}
	if err = db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	if err = db.Create(&buildings).Error; err != nil {
		t.Fatal(err)
	}
	ids := []uint{users[0].ID, users[1].ID}
	defer func() {
		for _, m := range []interface{}{&models.TownNeeds{}, &models.TownSupplyPurchase{}, &models.TownEvent{}, &models.UserBuilding{}} {
			db.Where("user_id IN ?", ids).Delete(m)
		}
		db.Unscoped().Delete(&models.User{}, ids)
		for _, b := range buildings {
			db.Unscoped().Delete(&b)
		}
	}()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		id := users[0].ID
		if c.GetHeader("X-Other") == "yes" {
			id = users[1].ID
		}
		c.Set("user_id", id)
	})
	h := NewTownLifeHandler(db)
	router.GET("/life", h.Get)
	router.POST("/supply", h.PurchaseSupply)
	request := func(method, path, item, id string, other bool) (int, services.TownLifeState) {
		data, _ := json.Marshal(gin.H{"item_id": item, "request_id": id, "price": 0, "food": 999})
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		if other {
			req.Header.Set("X-Other", "yes")
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		var state services.TownLifeState
		json.Unmarshal(w.Body.Bytes(), &state)
		return w.Code, state
	}
	read := func(other bool) services.TownLifeState {
		t.Helper()
		code, state := request("GET", "/life", "", "", other)
		if code != 200 {
			t.Fatalf("read=%d", code)
		}
		return state
	}
	if read(false).Needs.Enabled {
		t.Fatal("empty town has needs")
	}
	if code, _ := request("POST", "/supply", "bread", "shop-unbuilt-0001", false); code != 400 {
		t.Fatal("unbuilt shop accepted")
	}
	for _, uid := range ids {
		if err = db.Create(&models.UserBuilding{UserID: uid, BuildingID: buildings[0].ID, BuiltAt: time.Now()}).Error; err != nil {
			t.Fatal(err)
		}
	}
	initial := read(false)
	if !initial.Needs.Enabled || initial.Needs.Food != 70 || initial.Needs.Water != 70 {
		t.Fatalf("initial=%+v", initial.Needs)
	}
	// Force elapsed time, verify persistence and the floor without charging a read.
	db.Model(&models.TownNeeds{}).Where("user_id = ?", users[0].ID).Update("checked_at", time.Now().Add(-24*time.Hour))
	hungry := read(false)
	if hungry.Needs.Food != 20 || hungry.Needs.Water != 20 || hungry.Wallet.Coins != 20 {
		t.Fatalf("hungry=%+v", hungry)
	}
	for _, body := range [][2]string{{"invented", "shop-invalid-0001"}, {"bread", "short"}, {"meal", "shop-restaurant-001"}} {
		if code, _ := request("POST", "/supply", body[0], body[1], false); code != 400 {
			t.Fatalf("invalid accepted=%v", body)
		}
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if code, _ := request("POST", "/supply", "bread", "shop-bread-once-001", false); code != 200 {
				t.Errorf("concurrent=%d", code)
			}
		}()
	}
	wg.Wait()
	got := read(false)
	if got.Wallet.Coins != 18 || got.Needs.Food != 60 || got.Needs.Water != 20 {
		t.Fatalf("duplicate charged or fake price used: %+v", got)
	}
	if code, _ := request("POST", "/supply", "water", "shop-bread-once-001", false); code != 400 {
		t.Fatal("reused ID for other item")
	}
	if code, _ := request("POST", "/supply", "bread", "shop-bread-once-001", true); code != 400 {
		t.Fatal("zero-coin user bypassed with another user's request")
	}
	if read(true).Needs.Food != 70 || read(true).Wallet.Coins != 0 {
		t.Fatal("insufficient purchase changed state")
	}
	if code, _ := request("POST", "/supply", "bread", "shop-bread-second-001", false); code != 200 {
		t.Fatal("second purchase failed")
	}
	if code, _ := request("POST", "/supply", "bread", "shop-bread-full-001", false); code != 400 {
		t.Fatal("full resident bought useless food")
	}
	if code, water := request("POST", "/supply", "water", "shop-water-once-001", false); code != 200 || water.Needs.Water != 70 || water.Wallet.Coins != 15 {
		t.Fatalf("water=%d %+v", code, water)
	}
	if err = db.Create(&models.UserBuilding{UserID: users[0].ID, BuildingID: buildings[1].ID, BuiltAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	if code, meal := request("POST", "/supply", "meal", "shop-meal-once-0001", false); code != 200 || meal.Needs.Food != 100 || meal.Needs.Water != 100 || meal.Wallet.Coins != 12 {
		t.Fatalf("meal=%d %+v", code, meal)
	}
	if persisted := services.NewTownLifeService(db); persisted != nil {
		state, err := persisted.Get(users[0].ID)
		if err != nil || state.Wallet.Coins != 12 || state.Needs.Water != 100 {
			t.Fatal("re-entry lost state")
		}
	}
	var count int64
	db.Model(&models.TownSupplyPurchase{}).Where("user_id = ?", users[0].ID).Count(&count)
	if count != 4 {
		t.Fatalf("purchase count=%d", count)
	}
}
