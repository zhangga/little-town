package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"os"
	"reflect"
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

func TestRestaurantMySQLLifecycle(t *testing.T) {
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
	key := fmt.Sprintf("restaurant-%d", time.Now().UnixNano())
	users := []models.User{{OpenID: key, Coins: 7, Bricks: 19}, {OpenID: key + "-other", Coins: 11, Bricks: 13}, {OpenID: key + "-race", Coins: 0}}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	building := models.Building{Name: "餐厅"}
	if err := db.Create(&building).Error; err != nil {
		t.Fatal(err)
	}
	ids := []uint{users[0].ID, users[1].ID, users[2].ID}
	t.Cleanup(func() {
		for _, model := range []interface{}{&models.RestaurantRequest{}, &models.Restaurant{}, &models.UserBuilding{}} {
			db.Where("user_id IN ?", ids).Delete(model)
		}
		db.Unscoped().Delete(&models.User{}, ids)
		db.Unscoped().Delete(&building)
	})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		index := 0
		switch c.GetHeader("X-Test-User") {
		case "other":
			index = 1
		case "race":
			index = 2
		}
		c.Set("user_id", users[index].ID)
	})
	h := NewRestaurantHandler(db)
	router.GET("/restaurant", h.Get)
	router.POST("/recipes", h.SaveRecipe)
	router.PUT("/signatures", h.SetSignatures)
	router.POST("/serve", h.Serve)
	request := func(method, path, who string, body interface{}) (int, services.RestaurantState) {
		data, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User", who)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		var state services.RestaurantState
		if err := json.Unmarshal(w.Body.Bytes(), &state); err != nil {
			t.Errorf("bad JSON: %v", err)
		}
		return w.Code, state
	}
	read := func(who string) services.RestaurantState {
		t.Helper()
		code, state := request("GET", "/restaurant", who, nil)
		if code != 200 {
			t.Fatalf("read=%d", code)
		}
		return state
	}
	parallel := func(fn func(int)) {
		var wg sync.WaitGroup
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func(i int) { defer wg.Done(); fn(i) }(i)
		}
		wg.Wait()
	}
	dish := services.BentoDish{Name: "小熊春游便当", BoxShape: "square", BoxColor: "peach", Decoration: "flower", Portions: []services.BentoPortion{{Ingredient: "rice", X: 32, Y: 32, Style: "bear"}, {Ingredient: "corn", X: 65, Y: 65, Style: "plain"}}}
	save := services.SaveRestaurantRecipeRequest{RequestID: "restaurant-save-first-001", Dish: dish}
	if code, _ := request("GET", "/restaurant", "", nil); code != 400 {
		t.Fatal("read permitted without restaurant")
	}
	if code, _ := request("POST", "/recipes", "", save); code != 400 {
		t.Fatal("write permitted without restaurant")
	}
	for _, uid := range ids {
		if err := db.Create(&models.UserBuilding{UserID: uid, BuildingID: building.ID, BuiltAt: time.Now()}).Error; err != nil {
			t.Fatal(err)
		}
	}
	initial := read("")
	if initial.Recipes == nil || initial.SignatureIDs == nil || initial.RecentServices == nil || len(initial.Residents) != 3 || initial.ServiceResult != nil || initial.SavedRecipeID != "" {
		t.Fatalf("invalid initial state: %+v", initial)
	}
	invalid := save
	invalid.Dish.Portions = append([]services.BentoPortion{}, dish.Portions...)
	invalid.Dish.Portions[0].X = 1
	if code, _ := request("POST", "/recipes", "", invalid); code != 400 {
		t.Fatal("invalid coordinates accepted")
	}
	invalid = save
	invalid.RequestID = "short"
	if code, _ := request("POST", "/recipes", "", invalid); code != 400 {
		t.Fatal("invalid request ID accepted")
	}
	serve := services.ServeRestaurantRequest{RequestID: "restaurant-free-serve-001", ResidentID: "abu", OrderID: initial.Residents[0].Order.ID, Dish: dish}
	code, served := request("POST", "/serve", "", serve)
	if code != 200 || served.ServiceResult == nil || !served.ServiceResult.Preferred || served.Residents[0].Visits != 1 || served.Residents[0].LastDishName != dish.Name {
		t.Fatalf("free serve=%d %+v", code, served)
	}
	originalResult := *served.ServiceResult
	parallel(func(_ int) {
		code, state := request("POST", "/serve", "", serve)
		if code != 200 || state.ServiceResult == nil || !reflect.DeepEqual(*state.ServiceResult, originalResult) {
			t.Errorf("duplicate serve=%d %+v", code, state)
		}
	})
	changedServe := serve
	changedServe.Dish.Name = "改过名字"
	if code, _ := request("POST", "/serve", "", changedServe); code != 400 {
		t.Fatal("changed payload replay accepted")
	}
	stale := serve
	stale.RequestID = "restaurant-stale-order-001"
	if code, _ := request("POST", "/serve", "", stale); code != 400 {
		t.Fatal("order served twice")
	}
	code, saved := request("POST", "/recipes", "", save)
	if code != 200 || saved.SavedRecipeID == "" || len(saved.Recipes) != 1 || saved.Recipes[0].ServedCount != 1 || saved.Recipes[0].FirstTaster != "阿布" || saved.Recipes[0].LastFeedback != originalResult.Feedback || saved.RecentServices[0].RecipeID != saved.SavedRecipeID {
		t.Fatalf("save lost tasting memory=%d %+v", code, saved)
	}
	recipeID := saved.SavedRecipeID
	parallel(func(_ int) {
		code, state := request("POST", "/recipes", "", save)
		if code != 200 || state.SavedRecipeID != recipeID || len(state.Recipes) != 1 {
			t.Errorf("duplicate save=%d %+v", code, state)
		}
	})
	conflictingSave := save
	conflictingSave.Dish.Name = "别的便当"
	if code, _ := request("POST", "/recipes", "", conflictingSave); code != 400 {
		t.Fatal("save replay changed payload")
	}
	menu := services.SetRestaurantSignaturesRequest{RequestID: "restaurant-menu-first-001", RecipeIDs: []string{recipeID}}
	code, published := request("PUT", "/signatures", "", menu)
	if code != 200 || len(published.SignatureIDs) != 1 || published.Residents[0].Order.Kind != "signature" || published.Residents[0].Order.RecipeID != recipeID {
		t.Fatalf("signature not ordered=%d %+v", code, published)
	}
	if published.Residents[0].Order.ID == served.Residents[0].Order.ID {
		t.Fatal("menu change left stale order valid")
	}
	changedMenu := menu
	changedMenu.RecipeIDs = []string{}
	if code, _ := request("PUT", "/signatures", "", changedMenu); code != 400 {
		t.Fatal("menu replay accepted changed payload")
	}
	duplicateMenu := menu
	duplicateMenu.RequestID = "restaurant-menu-duplicate"
	duplicateMenu.RecipeIDs = []string{recipeID, recipeID}
	if code, _ := request("PUT", "/signatures", "", duplicateMenu); code != 400 {
		t.Fatal("duplicate menu entry accepted")
	}
	crossSave := save
	crossSave.RequestID = "restaurant-cross-save-001"
	crossSave.RecipeID = recipeID
	if code, _ := request("POST", "/recipes", "other", crossSave); code != 400 {
		t.Fatal("cross-user recipe updated")
	}
	if code, _ := request("PUT", "/signatures", "other", menu); code != 400 {
		t.Fatal("cross-user recipe on menu")
	}
	crossServe := serve
	crossServe.RecipeID = recipeID
	if code, _ := request("POST", "/serve", "other", crossServe); code != 400 {
		t.Fatal("cross-user recipe served")
	}
	// Request IDs belong to an account, so another owner can independently use it.
	if code, other := request("POST", "/recipes", "other", save); code != 200 || other.SavedRecipeID == recipeID || other.Recipes[0].ServedCount != 0 {
		t.Fatal("request keys not isolated by account")
	}
	named := services.ServeRestaurantRequest{RequestID: "restaurant-signature-001", ResidentID: "abu", OrderID: published.Residents[0].Order.ID, RecipeID: recipeID, Dish: dish}
	wrong := named
	wrong.RequestID = "restaurant-wrong-dish-001"
	wrong.Dish.BoxColor = "mint"
	if code, _ := request("POST", "/serve", "", wrong); code != 400 {
		t.Fatal("wrong signature composition accepted")
	}
	code, repeated := request("POST", "/serve", "", named)
	if code != 200 || repeated.Residents[0].Visits != 2 || repeated.Recipes[0].ServedCount != 2 || repeated.Recipes[0].FirstTaster != "阿布" || repeated.Residents[0].Order.Kind != "surprise" {
		t.Fatalf("repeat=%d %+v", code, repeated)
	}
	update := save
	update.RequestID = "restaurant-update-first-001"
	update.RecipeID = recipeID
	update.Dish.Name = "小熊新版便当"
	update.Dish.BoxColor = "mint"
	// The edited draft no longer matches the stored recipe, so the client serves
	// it freely and then updates the original recipe from the thank-you card.
	editedServe := services.ServeRestaurantRequest{RequestID: "restaurant-edited-serve-001", ResidentID: "taotao", OrderID: repeated.Residents[1].Order.ID, Dish: update.Dish}
	code, editedTasting := request("POST", "/serve", "", editedServe)
	if code != 200 || editedTasting.ServiceResult == nil || editedTasting.ServiceResult.RecipeID != "" {
		t.Fatalf("edited draft serve failed: %d %+v", code, editedTasting)
	}
	code, updated := request("POST", "/recipes", "", update)
	if code != 200 || len(updated.Recipes) != 1 || updated.Recipes[0].Dish.Name != update.Dish.Name || updated.Recipes[0].ServedCount != 3 || updated.Recipes[0].FirstTaster != "阿布" || updated.Recipes[0].LastFeedback != editedTasting.ServiceResult.Feedback || updated.RecentServices[0].RecipeID != recipeID {
		t.Fatalf("update lost recipe history: %d %+v", code, updated)
	}
	// A receipt-write error rolls back the entire aggregate update.
	const callback = "test:restaurant-receipt-failure"
	if err := db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if req, ok := tx.Statement.Dest.(*models.RestaurantRequest); ok && req.RequestID == "restaurant-fail-serve-001" {
			tx.AddError(errors.New("injected receipt failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	failure := services.ServeRestaurantRequest{RequestID: "restaurant-fail-serve-001", ResidentID: "lin", OrderID: updated.Residents[2].Order.ID, Dish: dish}
	state, err := services.NewRestaurantService(db).Serve(users[0].ID, failure)
	db.Callback().Create().Remove(callback)
	if err == nil || state != nil || read("").Residents[2].Visits != 0 {
		t.Fatal("failed receipt persisted a service")
	}
	// Different requests for one resident/order race; only one can advance the visit.
	raceInitial := read("race")
	var successes atomic.Int32
	parallel(func(i int) {
		r := serve
		r.RequestID = fmt.Sprintf("restaurant-race-serve-%03d", i)
		r.OrderID = raceInitial.Residents[0].Order.ID
		code, _ := request("POST", "/serve", "race", r)
		if code == 200 {
			successes.Add(1)
		} else if code != 400 {
			t.Errorf("concurrent serve=%d", code)
		}
	})
	if successes.Load() != 1 || read("race").Residents[0].Visits != 1 {
		t.Fatal("concurrent order was served more than once")
	}
	// Recent display is bounded, but old receipts remain replayable.
	for i := 0; i < 13; i++ {
		current := read("")
		r := serve
		r.RequestID = fmt.Sprintf("restaurant-recent-serve-%03d", i)
		r.ResidentID = "lin"
		r.OrderID = current.Residents[2].Order.ID
		r.RecipeID = ""
		r.Dish = dish
		if current.Residents[2].Order.Kind == "signature" {
			r.Dish = update.Dish
			r.RecipeID = recipeID
		}
		if code, _ := request("POST", "/serve", "", r); code != 200 {
			t.Fatalf("recent service %d failed", i)
		}
	}
	latest := read("")
	if len(latest.RecentServices) != 12 || latest.RecentServices[0].RequestID != "restaurant-recent-serve-012" || latest.ServiceResult != nil || latest.SavedRecipeID != "" {
		t.Fatalf("bad bounded history: %+v", latest)
	}
	if code, replay := request("POST", "/serve", "", serve); code != 200 || replay.ServiceResult == nil || !reflect.DeepEqual(*replay.ServiceResult, originalResult) || replay.Residents[0].Visits != 2 {
		t.Fatal("old service replay lost original result or mutated state")
	}
	// Recipe capacity and menu capacity are authoritative on the server.
	for i := 0; i < 23; i++ {
		r := save
		r.RequestID = fmt.Sprintf("restaurant-fill-recipe-%03d", i)
		r.Dish.Name = fmt.Sprintf("便当%d", i)
		if code, _ := request("POST", "/recipes", "", r); code != 200 {
			t.Fatalf("fill recipe %d failed", i)
		}
	}
	overflow := save
	overflow.RequestID = "restaurant-overflow-001"
	if code, _ := request("POST", "/recipes", "", overflow); code != 400 {
		t.Fatal("25th recipe accepted")
	}
	full := read("")
	if len(full.Recipes) != 24 {
		t.Fatal("recipe capacity incorrect")
	}
	menu.RequestID = "restaurant-menu-four-001"
	menu.RecipeIDs = []string{full.Recipes[0].ID, full.Recipes[1].ID, full.Recipes[2].ID, full.Recipes[3].ID}
	if code, _ := request("PUT", "/signatures", "", menu); code != 400 {
		t.Fatal("four signature recipes accepted")
	}
	update.RequestID = "restaurant-update-full-001"
	if code, _ := request("POST", "/recipes", "", update); code != 200 {
		t.Fatal("full recipe book blocked updating a recipe")
	}
	for i := range users {
		var user models.User
		if err := db.First(&user, users[i].ID).Error; err != nil || user.Coins != users[i].Coins || user.Bricks != users[i].Bricks {
			t.Fatalf("restaurant changed wallet: %+v (%v)", user, err)
		}
	}
	if err := db.Create(&models.RestaurantRequest{UserID: users[0].ID, RequestID: save.RequestID, PayloadHash: "duplicate"}).Error; err == nil {
		t.Fatal("database accepted duplicate request key")
	}
}
