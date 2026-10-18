package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
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

func TestTownLayoutMySQLLifecycle(t *testing.T) {
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
	key := fmt.Sprintf("layout-%d", time.Now().UnixNano())
	users := []models.User{{OpenID: key}, {OpenID: key + "-other"}}
	catalog := []models.Building{{Name: key + "-school", CostBricks: 5}, {Name: key + "-clinic", CostBricks: 5}, {Name: key + "-park", CostBricks: 5}}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&catalog).Error; err != nil {
		t.Fatal(err)
	}
	owned := []models.UserBuilding{
		{UserID: users[0].ID, BuildingID: catalog[0].ID, PositionX: 60, PositionY: 60, BuiltAt: time.Now()},
		{UserID: users[0].ID, BuildingID: catalog[1].ID, PositionX: 240, PositionY: 60, BuiltAt: time.Now()},
		{UserID: users[1].ID, BuildingID: catalog[0].ID, BuiltAt: time.Now()},
	}
	if err := db.Create(&owned).Error; err != nil {
		t.Fatal(err)
	}
	ids := []uint{users[0].ID, users[1].ID}
	t.Cleanup(func() {
		db.Where("user_id IN ?", ids).Delete(&models.UserBuilding{})
		db.Unscoped().Delete(&models.User{}, ids)
		for _, building := range catalog {
			db.Unscoped().Delete(&building)
		}
	})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", users[0].ID) })
	handler := NewBuildingHandler(db)
	router.GET("/town", handler.GetMyTown)
	router.PUT("/layout", handler.SaveLayout)
	router.POST("/build", handler.BuildBuilding)
	type response struct {
		Layout      services.TownLayout `json:"layout"`
		CoinsSpent  int                 `json:"coins_spent"`
		BricksSpent int                 `json:"bricks_spent"`
	}
	request := func(method, path string, body interface{}, want int) response {
		t.Helper()
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != want {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, w.Code, want, w.Body.String())
		}
		var result response
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	wallet := func(bricks int) {
		t.Helper()
		var user models.User
		if err := db.First(&user, users[0].ID).Error; err != nil || user.Coins != 0 || user.Bricks != bricks {
			t.Fatalf("moving changed wallet: coins=%d bricks=%d, want 0/%d (%v)", user.Coins, user.Bricks, bricks, err)
		}
	}
	initial := request("GET", "/town", nil, 200).Layout
	if initial.Columns != 3 || initial.Rows < 6 || initial.Buildings[0].X != 1 || initial.Buildings[1].X != 2 {
		t.Fatalf("legacy layout did not normalize: %+v", initial)
	}
	// Both wallets start at zero: no resources are required to move or swap.
	body := SaveTownLayoutRequest{Home: &services.TownPosition{X: 0, Y: 2}, Buildings: []services.TownPlacement{
		{ID: owned[0].ID, TownPosition: services.TownPosition{X: 2, Y: 5}},
		{ID: owned[1].ID, TownPosition: services.TownPosition{X: 1, Y: 4}},
	}}
	for i := 0; i < 2; i++ {
		result := request("PUT", "/layout", body, 200)
		if result.CoinsSpent != 0 || result.BricksSpent != 0 {
			t.Fatal("layout returned a charge")
		}
		wallet(0)
	}
	body.Buildings[0].TownPosition, body.Buildings[1].TownPosition = body.Buildings[1].TownPosition, body.Buildings[0].TownPosition
	request("PUT", "/layout", body, 200)
	saved := request("GET", "/town", nil, 200).Layout
	if !reflect.DeepEqual(saved.Home, *body.Home) || !reflect.DeepEqual(saved.Buildings, body.Buildings) || saved.Rows != initial.Rows {
		t.Fatal("saved layout or upfront capacity changed")
	}
	for _, mutation := range []func(*SaveTownLayoutRequest){
		func(r *SaveTownLayoutRequest) { r.Home = nil },
		func(r *SaveTownLayoutRequest) { r.Home.X = -1 },
		func(r *SaveTownLayoutRequest) { r.Buildings = r.Buildings[:1] },
		func(r *SaveTownLayoutRequest) { r.Buildings[0].ID = owned[2].ID },
		func(r *SaveTownLayoutRequest) { r.Buildings[1].ID = r.Buildings[0].ID },
		func(r *SaveTownLayoutRequest) { r.Buildings[0].TownPosition = *r.Home },
		func(r *SaveTownLayoutRequest) { r.Buildings[1].TownPosition = r.Buildings[0].TownPosition },
		func(r *SaveTownLayoutRequest) { r.Buildings[0].X = 3 },
		func(r *SaveTownLayoutRequest) { r.Buildings[0].Y = saved.Rows },
	} {
		data, _ := json.Marshal(body)
		var invalid SaveTownLayoutRequest
		_ = json.Unmarshal(data, &invalid)
		mutation(&invalid)
		request("PUT", "/layout", invalid, 400)
		if got := request("GET", "/town", nil, 200).Layout; !reflect.DeepEqual(got, saved) {
			t.Fatalf("invalid layout partially changed saved state: %+v", got)
		}
		wallet(0)
	}
	// Construction still has its normal price, but must use a vacant cell after moving.
	if err := db.Model(&users[0]).Update("bricks", 9).Error; err != nil {
		t.Fatal(err)
	}
	request("POST", "/build", gin.H{"building_id": catalog[2].ID}, 200)
	wallet(4)
	afterBuild := request("GET", "/town", nil, 200).Layout
	if len(afterBuild.Buildings) != 3 || afterBuild.Rows != saved.Rows || afterBuild.Buildings[2].TownPosition != saved.FirstEmpty() {
		t.Fatalf("construction did not use the existing vacant map: %+v", afterBuild)
	}
	request("PUT", "/layout", body, 400) // A stale snapshot cannot discard the new building.
	wallet(4)
	var other models.UserBuilding
	if err := db.First(&other, owned[2].ID).Error; err != nil || other.PositionX != 0 || other.PositionY != 0 {
		t.Fatal("another user's building changed")
	}
}
