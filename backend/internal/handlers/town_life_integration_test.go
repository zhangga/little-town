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

func TestTownLifeMySQLLifecycle(t *testing.T) {
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
	db = db.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
	key := fmt.Sprintf("town-life-%d", time.Now().UnixNano())
	users := []models.User{{OpenID: key, Coins: 40, Bricks: 100}, {OpenID: key + "-other", Coins: 20}, {OpenID: key + "-concurrent", Coins: 3}}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	buildings := []models.Building{{Name: "医院", CostBricks: 12}, {Name: "宠物医院", CostBricks: 10}}
	if err := db.Create(&buildings).Error; err != nil {
		t.Fatal(err)
	}
	ids := []uint{users[0].ID, users[1].ID, users[2].ID}
	t.Cleanup(func() {
		for _, model := range []interface{}{&models.TownPet{}, &models.TownEvent{}, &models.UserBuilding{}} {
			db.Where("user_id IN ?", ids).Delete(model)
		}
		db.Unscoped().Delete(&models.User{}, ids)
		for _, b := range buildings {
			db.Unscoped().Delete(&b)
		}
	})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		id := users[0].ID
		if c.GetHeader("X-Test-User") == "other" {
			id = users[1].ID
		}
		c.Set("user_id", id)
	})
	h := NewTownLifeHandler(db)
	router.GET("/life", h.Get)
	router.POST("/pet", h.PurchasePet)
	router.POST("/resolve", h.Resolve)
	router.POST("/build", NewBuildingHandler(db).BuildBuilding)
	request := func(method, path, who string, body interface{}) (int, services.TownLifeState) {
		data, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User", who)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		var state services.TownLifeState
		_ = json.Unmarshal(w.Body.Bytes(), &state)
		return w.Code, state
	}
	ok := func(method, path, who string, body interface{}) services.TownLifeState {
		t.Helper()
		status, state := request(method, path, who, body)
		if status != 200 {
			t.Fatalf("%s %s = %d", method, path, status)
		}
		return state
	}
	wallet := func(index, coins int) {
		t.Helper()
		var user models.User
		if err := db.First(&user, users[index].ID).Error; err != nil || user.Coins != coins {
			t.Fatalf("wallet %d = %d, want %d (%v)", index, user.Coins, coins, err)
		}
	}
	parallel := func(fn func()) {
		var wg sync.WaitGroup
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); fn() }()
		}
		wg.Wait()
	}
	initial := ok("GET", "/life", "", nil)
	if initial.Event != nil || initial.UnlockedCount != 0 || len(initial.Pets) != 2 {
		t.Fatalf("empty town: %+v", initial)
	}
	for _, body := range []interface{}{gin.H{}, gin.H{"pet_id": "invented", "price": 0}} {
		if status, _ := request("POST", "/pet", "", body); status != 400 {
			t.Fatalf("invalid pet status=%d", status)
		}
	}
	ok("POST", "/build", "", gin.H{"building_id": buildings[0].ID})
	state := ok("GET", "/life", "", nil)
	if state.Event == nil || state.Event.Kind != "resident_sick" || state.Wallet.Bricks != 88 {
		t.Fatalf("hospital unlock: %+v", state)
	}
	eventID := state.Event.ID
	if got := ok("GET", "/life", "", nil).Event; got == nil || got.ID != eventID {
		t.Fatal("refresh replaced a pending event")
	}
	wallet(0, 40)
	if status, _ := request("POST", "/resolve", "other", gin.H{"event_id": eventID}); status != 400 {
		t.Fatal("another user resolved an event")
	}
	db.Model(&users[0]).Update("coins", 0)
	if status, _ := request("POST", "/resolve", "", gin.H{"event_id": eventID, "cost": 0}); status != 400 {
		t.Fatal("insufficient coins accepted")
	}
	if got := ok("GET", "/life", "", nil).Event; got == nil || got.ID != eventID {
		t.Fatal("failed service lost pending event")
	}
	db.Model(&users[0]).Update("coins", 40)
	parallel(func() {
		status, _ := request("POST", "/resolve", "", gin.H{"event_id": eventID, "cost": 0})
		if status != 200 {
			t.Errorf("parallel service status=%d", status)
		}
	})
	wallet(0, 39)
	state = ok("GET", "/life", "", nil)
	if state.Event != nil || len(state.Recent) != 1 || state.Recent[0].ResolvedAt == nil {
		t.Fatal("resolution or cooldown not persisted")
	}
	parallel(func() {
		status, _ := request("POST", "/pet", "", gin.H{"pet_id": "dog", "price": 0})
		if status != 200 {
			t.Errorf("parallel purchase status=%d", status)
		}
	})
	wallet(0, 19)
	if status, _ := request("POST", "/pet", "", gin.H{"pet_id": "cat"}); status != 400 {
		t.Fatal("insufficient pet purchase accepted")
	}
	state = ok("GET", "/life", "", nil)
	if !state.Pets[0].Owned || state.Pets[1].Owned {
		t.Fatal("pet ownership not persisted")
	}
	var petCount int64
	db.Model(&models.TownPet{}).Where("user_id = ?", users[0].ID).Count(&petCount)
	if petCount != 1 {
		t.Fatal("duplicate pet rows")
	}
	// Even if an invalid pending record exists, service resolution enforces prerequisites again.
	locked := models.TownEvent{UserID: users[0].ID, Kind: "small_fire"}
	if err := db.Create(&locked).Error; err != nil {
		t.Fatal(err)
	}
	if status, _ := request("POST", "/resolve", "", gin.H{"event_id": locked.ID}); status != 400 {
		t.Fatal("unbuilt fire station could be called")
	}
	wallet(0, 19)
	db.Delete(&locked)
	// A vet building by itself never makes a pet sick.
	if err := db.Create(&models.UserBuilding{UserID: users[1].ID, BuildingID: buildings[1].ID, BuiltAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	if got := ok("GET", "/life", "other", nil); got.Event != nil || got.UnlockedCount != 0 {
		t.Fatal("vet without pet generated an event")
	}
	ok("POST", "/pet", "other", gin.H{"pet_id": "cat"})
	wallet(1, 0)
	state = ok("GET", "/life", "other", nil)
	if state.Event == nil || state.UnlockedCount != 2 || (state.Event.Kind != "pet_play" && state.Event.Kind != "pet_sick") {
		t.Fatal("pet + vet unlock failed")
	}
	// Force each eligible kind so the test covers both random branches deterministically.
	db.Model(&models.TownEvent{}).Where("id = ?", state.Event.ID).Update("kind", "pet_sick")
	db.Model(&users[1]).Update("coins", 1)
	ok("POST", "/resolve", "other", gin.H{"event_id": state.Event.ID})
	wallet(1, 0)
	free := models.TownEvent{UserID: users[1].ID, Kind: "pet_play"}
	if err := db.Create(&free).Error; err != nil {
		t.Fatal(err)
	}
	ok("POST", "/resolve", "other", gin.H{"event_id": free.ID})
	wallet(1, 0)
	// Concurrent readers create only one event; resolving it never creates the next immediately.
	if err := db.Create(&models.UserBuilding{UserID: users[2].ID, BuildingID: buildings[0].ID, BuiltAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	service := services.NewTownLifeService(db)
	parallel(func() {
		got, err := service.Get(users[2].ID)
		if err != nil || got.Event == nil || got.Event.Kind != "resident_sick" {
			t.Errorf("parallel get: %+v %v", got, err)
		}
	})
	var count int64
	db.Model(&models.TownEvent{}).Where("user_id = ?", users[2].ID).Count(&count)
	if count != 1 {
		t.Fatalf("generated %d simultaneous events", count)
	}
	for i := 0; i < 3; i++ {
		got, err := service.Get(users[2].ID)
		if err != nil || got.Event == nil {
			t.Fatalf("event %d: %+v %v", i, got, err)
		}
		resolved, err := service.Resolve(users[2].ID, got.Event.ID)
		if err != nil || resolved.Event != nil {
			t.Fatalf("resolve %d: %v", i, err)
		}
		past := time.Now().Add(-2*time.Hour - time.Second)
		if err := db.Model(&models.TownEvent{}).Where("id = ?", got.Event.ID).Update("resolved_at", past).Error; err != nil {
			t.Fatal(err)
		}
	}
	got, err := service.Get(users[2].ID)
	if err != nil || got.Event != nil {
		t.Fatal("daily limit failed")
	}
	wallet(2, 0)
	// A new date has no offline backlog: just one new pending event, still no charge.
	yesterday := services.DayStart(time.Now()).Add(-time.Hour)
	db.Model(&models.TownEvent{}).Where("user_id = ?", users[2].ID).Update("created_at", yesterday)
	got, err = service.Get(users[2].ID)
	if err != nil || got.Event == nil {
		t.Fatalf("new-day event: %v", err)
	}
	wallet(2, 0)
}
