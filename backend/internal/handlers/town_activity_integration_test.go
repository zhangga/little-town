package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
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

func TestTownActivityMySQLLifecycle(t *testing.T) {
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
	key := fmt.Sprintf("activity-%d", time.Now().UnixNano())
	users := []models.User{{OpenID: key, Coins: 100, Bricks: 17}, {OpenID: key + "-other", Coins: 0}, {OpenID: key + "-race", Coins: 3}}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	buildings := []models.Building{}
	for _, name := range []string{"电影院", "学校", "图书馆", "商店", "餐厅", "公园", "体育馆", "医院", "宠物医院", "消防站", "警察局"} {
		buildings = append(buildings, models.Building{Name: name})
	}
	if err := db.Create(&buildings).Error; err != nil {
		t.Fatal(err)
	}
	ids := []uint{users[0].ID, users[1].ID, users[2].ID}
	t.Cleanup(func() {
		for _, model := range []interface{}{&models.TownActivityVisit{}, &models.TownPet{}, &models.TownNeeds{}, &models.TownEvent{}, &models.UserBuilding{}} {
			db.Where("user_id IN ?", ids).Delete(model)
		}
		db.Unscoped().Delete(&models.User{}, ids)
		for _, building := range buildings {
			db.Unscoped().Delete(&building)
		}
	})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		id := users[0].ID
		switch c.GetHeader("X-Test-User") {
		case "other":
			id = users[1].ID
		case "race":
			id = users[2].ID
		}
		c.Set("user_id", id)
	})
	h := NewTownLifeHandler(db)
	router.GET("/life", h.Get)
	router.POST("/start", h.StartActivity)
	request := func(method, path, who string, body interface{}) (int, services.TownLifeState) {
		data, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User", who)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		var state services.TownLifeState
		if err := json.Unmarshal(w.Body.Bytes(), &state); err != nil {
			t.Errorf("invalid response: %v", err)
		}
		return w.Code, state
	}
	read := func(who string) services.TownLifeState {
		t.Helper()
		code, state := request("GET", "/life", who, nil)
		if code != 200 {
			t.Fatalf("GET life=%d", code)
		}
		return state
	}
	start := func(who, activity, requestID string) (int, services.TownLifeState) {
		// None of these extra fields may change the trusted catalog or authenticated identity.
		return request("POST", "/start", who, gin.H{"activity_id": activity, "request_id": requestID, "price": 0, "coins": 999, "bricks": 999, "food": 999, "user_id": users[1].ID})
	}
	wallet := func(index, coins int) {
		t.Helper()
		var user models.User
		if err := db.First(&user, users[index].ID).Error; err != nil || user.Coins != coins || user.Bricks != users[index].Bricks {
			t.Fatalf("wallet %d=%+v want coins=%d (%v)", index, user, coins, err)
		}
	}
	setCoins := func(index, coins int) {
		t.Helper()
		if err := db.Model(&models.User{}).Where("id = ?", users[index].ID).Update("coins", coins).Error; err != nil {
			t.Fatal(err)
		}
	}
	countVisits := func(index int) int64 {
		t.Helper()
		var count int64
		if err := db.Model(&models.TownActivityVisit{}).Where("user_id = ?", users[index].ID).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		return count
	}
	parallel := func(fn func(int)) {
		var wg sync.WaitGroup
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func(i int) { defer wg.Done(); fn(i) }(i)
		}
		wg.Wait()
	}

	initial := read("")
	if len(initial.Activities) != 22 || initial.ActivityVisits == nil || len(initial.ActivityVisits) != 0 || initial.ActivityReceipt != nil {
		t.Fatalf("initial catalog: %+v", initial)
	}
	for _, activity := range initial.Activities {
		if activity.Available || activity.LockedReason == "" {
			t.Fatalf("unbuilt activity available: %+v", activity)
		}
	}
	for _, body := range []interface{}{gin.H{}, gin.H{"activity_id": "cinema_cloud"}, gin.H{"activity_id": "cinema_cloud", "request_id": "short"}, gin.H{"activity_id": "invented", "request_id": "activity-invalid-0001"}} {
		if code, _ := request("POST", "/start", "", body); code != 400 {
			t.Fatalf("invalid request=%d", code)
		}
	}
	if code, _ := start("", "cinema_cloud", "activity-unbuilt-001"); code != 400 {
		t.Fatal("unbuilt cinema sold a ticket")
	}
	wallet(0, 100)
	if countVisits(0) != 0 {
		t.Fatal("failed purchases created receipts")
	}
	for _, building := range buildings {
		if err := db.Create(&models.UserBuilding{UserID: users[0].ID, BuildingID: building.ID, BuiltAt: time.Now()}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, uid := range ids[1:] {
		if err := db.Create(&models.UserBuilding{UserID: uid, BuildingID: buildings[0].ID, BuiltAt: time.Now()}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, activity := range read("").Activities {
		if activity.Available != (activity.Building != "宠物医院") {
			t.Fatalf("building gate failed: %+v", activity)
		}
	}
	if code, _ := start("", "vet_checkup", "activity-vet-no-pet-001"); code != 400 {
		t.Fatal("vet sold a ticket without a pet")
	}
	if err := db.Create(&models.TownPet{UserID: users[0].ID, PetID: "dog"}).Error; err != nil {
		t.Fatal(err)
	}
	ready := read("")
	for _, activity := range ready.Activities {
		if !activity.Available {
			t.Fatalf("owned activity unavailable: %+v", activity)
		}
	}

	const firstRequest = "activity-cinema-once-001"
	code, paid := start("", "cinema_cloud", firstRequest)
	if code != 200 || paid.ActivityReceipt == nil || paid.ActivityReceipt.Price != 3 || paid.ActivityReceipt.RequestID != firstRequest || paid.ActivityReceipt.ActivityID != "cinema_cloud" || paid.ActivityReceipt.CreatedAt.IsZero() || len(paid.ActivityVisits) != 1 || paid.Wallet.Coins != 97 || paid.Wallet.Bricks != 17 || paid.Needs != ready.Needs {
		t.Fatalf("purchase=%d %+v", code, paid)
	}
	firstReceipt := *paid.ActivityReceipt
	parallel(func(_ int) {
		code, state := start("", "cinema_cloud", firstRequest)
		if code != 200 || state.ActivityReceipt == nil || state.ActivityReceipt.RequestID != firstRequest || !state.ActivityReceipt.CreatedAt.Equal(firstReceipt.CreatedAt) {
			t.Errorf("duplicate request=%d %+v", code, state.ActivityReceipt)
		}
	})
	wallet(0, 97)
	if countVisits(0) != 1 {
		t.Fatal("duplicate requests created multiple receipts")
	}
	if code, _ := start("", "cinema_space", firstRequest); code != 400 {
		t.Fatal("request ID reused for a different activity")
	}
	setCoins(0, 0)
	if code, replay := start("", "cinema_cloud", firstRequest); code != 200 || replay.Wallet.Coins != 0 || replay.ActivityReceipt == nil {
		t.Fatal("paid receipt could not be recovered at zero balance")
	}
	if code, _ := start("", "cinema_cloud", "activity-no-coins-001"); code != 400 {
		t.Fatal("new purchase succeeded with zero coins")
	}
	setCoins(0, 97)
	if code, _ := start("other", "cinema_cloud", firstRequest); code != 400 {
		t.Fatal("another user reused a paid receipt")
	}
	if other := read("other"); len(other.ActivityVisits) != 0 || other.ActivityReceipt != nil || countVisits(1) != 0 {
		t.Fatal("another user's purchase history leaked")
	}
	setCoins(1, 3)
	if code, own := start("other", "cinema_cloud", firstRequest); code != 200 || own.Wallet.Coins != 0 || len(own.ActivityVisits) != 1 {
		t.Fatal("request IDs were not scoped to each account")
	}
	wallet(0, 97)

	var successes atomic.Int32
	parallel(func(i int) {
		code, _ := start("race", "cinema_space", fmt.Sprintf("activity-race-%04d", i))
		if code == 200 {
			successes.Add(1)
		} else if code != 400 {
			t.Errorf("concurrent distinct request=%d", code)
		}
	})
	if successes.Load() != 1 || countVisits(2) != 1 {
		t.Fatalf("concurrent purchases exceeded balance: success=%d visits=%d", successes.Load(), countVisits(2))
	}
	wallet(2, 0)

	// A failure after the wallet update must roll back both the balance and receipt.
	const createFailure = "test:activity-create-failure"
	if err := db.Callback().Create().Before("gorm:create").Register(createFailure, func(tx *gorm.DB) {
		if visit, ok := tx.Statement.Dest.(*models.TownActivityVisit); ok && visit.RequestID == "activity-fail-create-001" {
			tx.AddError(errors.New("injected receipt write failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	service := services.NewTownLifeService(db)
	state, err := service.StartActivity(users[0].ID, "school_words", "activity-fail-create-001")
	db.Callback().Create().Remove(createFailure)
	if err == nil || state != nil || countVisits(0) != 1 {
		t.Fatalf("write failure escaped transaction: %+v %v", state, err)
	}
	wallet(0, 97)
	// Even a response-building failure after the receipt INSERT cannot leave a charge.
	const stateFailure = "test:activity-state-failure"
	if err := db.Callback().Query().Before("gorm:query").Register(stateFailure, func(tx *gorm.DB) {
		if tx.Statement.Schema != nil && tx.Statement.Schema.Table == "town_events" {
			tx.AddError(errors.New("injected state read failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	state, err = service.StartActivity(users[0].ID, "school_words", "activity-fail-state-001")
	db.Callback().Query().Remove(stateFailure)
	if err == nil || state != nil || countVisits(0) != 1 {
		t.Fatalf("state failure escaped transaction: %+v %v", state, err)
	}
	wallet(0, 97)
	if err := db.Create(&models.TownActivityVisit{UserID: users[0].ID, RequestID: firstRequest, ActivityID: "cinema_cloud", Price: 3}).Error; err == nil {
		t.Fatal("database accepted duplicate user/request key")
	}

	for i := 0; i < 13; i++ {
		if code, _ := start("", "school_words", fmt.Sprintf("activity-school-%04d", i)); code != 200 {
			t.Fatalf("new ticket %d=%d", i, code)
		}
	}
	latest := read("")
	if len(latest.ActivityVisits) != 12 || countVisits(0) != 14 || latest.ActivityReceipt != nil || latest.ActivityVisits[0].RequestID != "activity-school-0012" || latest.ActivityVisits[11].RequestID != "activity-school-0001" {
		t.Fatalf("recent history was not bounded/newest first: %+v", latest.ActivityVisits)
	}
	if code, old := start("", "cinema_cloud", firstRequest); code != 200 || old.ActivityReceipt == nil || old.ActivityReceipt.RequestID != firstRequest || old.ActivityReceipt.Price != 3 || old.Wallet.Coins != 84 || len(old.ActivityVisits) != 12 {
		t.Fatal("old receipt was lost outside the recent window")
	}
	wallet(0, 84)
}
