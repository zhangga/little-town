package services

import (
	"math"
	"reflect"
	"strings"
	"testing"
)

func sampleBento() BentoDish {
	return BentoDish{Name: "小熊春游便当", BoxShape: "square", BoxColor: "peach", Decoration: "none", Portions: []BentoPortion{{Ingredient: "rice", X: 32, Y: 32, Style: "bear"}, {Ingredient: "corn", X: 65, Y: 60, Style: "plain"}}}
}
func TestBentoValidation(t *testing.T) {
	valid := sampleBento()
	valid.Name = "  小熊便当  "
	valid.Portions = append(valid.Portions, BentoPortion{Ingredient: "corn", X: 15, Y: 85, Style: "plain"})
	got, err := normalizeBento(valid)
	if err != nil || got.Name != "小熊便当" || len(got.Portions) != 3 || !reflect.DeepEqual(got.Portions, valid.Portions) {
		t.Fatalf("valid dish changed: %+v %v", got, err)
	}
	cases := map[string]func(*BentoDish){
		"empty name":     func(d *BentoDish) { d.Name = "  " },
		"long name":      func(d *BentoDish) { d.Name = strings.Repeat("饭", 17) },
		"control name":   func(d *BentoDish) { d.Name = "小熊\n" },
		"invalid utf8":   func(d *BentoDish) { d.Name = string([]byte{255}) },
		"empty portions": func(d *BentoDish) { d.Portions = nil },
		"nine portions": func(d *BentoDish) {
			for len(d.Portions) < 9 {
				d.Portions = append(d.Portions, d.Portions[0])
			}
		},
		"unknown ingredient": func(d *BentoDish) { d.Portions[0].Ingredient = "icecream" },
		"bear carrot":        func(d *BentoDish) { d.Portions[0].Ingredient = "carrot" },
		"star rice":          func(d *BentoDish) { d.Portions[0].Style = "star" },
		"unknown style":      func(d *BentoDish) { d.Portions[0].Style = "dragon" },
		"unknown box":        func(d *BentoDish) { d.BoxShape = "triangle" },
		"unknown color":      func(d *BentoDish) { d.BoxColor = "red" },
		"unknown decoration": func(d *BentoDish) { d.Decoration = "glitter" },
		"nan":                func(d *BentoDish) { d.Portions[0].X = math.NaN() },
		"infinity":           func(d *BentoDish) { d.Portions[0].Y = math.Inf(1) },
		"left edge":          func(d *BentoDish) { d.Portions[0].X = 14.99 },
		"bottom edge":        func(d *BentoDish) { d.Portions[0].Y = 85.01 },
		"round corner":       func(d *BentoDish) { d.BoxShape = "round"; d.Portions[0].X = 15; d.Portions[0].Y = 15 },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			d := sampleBento()
			change(&d)
			if _, err := normalizeBento(d); err != ErrRestaurantDish {
				t.Fatalf("invalid accepted: %+v %v", d, err)
			}
		})
	}
	round := sampleBento()
	round.BoxShape = "round"
	round.Portions[0].X, round.Portions[0].Y = 15, 50
	if _, err := normalizeBento(round); err != nil {
		t.Fatal("round boundary rejected", err)
	}
}
func TestBentoCompositionIncludesAppearanceButNotName(t *testing.T) {
	a, b := sampleBento(), sampleBento()
	b.Name = "我的新名字"
	if !sameBentoComposition(a, b) {
		t.Fatal("name changed composition")
	}
	for _, change := range []func(*BentoDish){func(d *BentoDish) { d.Portions[0].X++ }, func(d *BentoDish) { d.Portions[0].Style = "plain" }, func(d *BentoDish) { d.BoxColor = "mint" }, func(d *BentoDish) { d.Decoration = "flower" }, func(d *BentoDish) { d.BoxShape = "round" }, func(d *BentoDish) { d.Portions[0], d.Portions[1] = d.Portions[1], d.Portions[0] }} {
		b = sampleBento()
		change(&b)
		if sameBentoComposition(a, b) {
			t.Fatalf("appearance mismatch accepted: %+v", b)
		}
	}
}
func TestRestaurantOrdersAreStableAndInvalidateChangedRecipes(t *testing.T) {
	s := initialRestaurantState()
	refreshRestaurantOrders(s)
	if s.Recipes == nil || s.SignatureIDs == nil || s.RecentServices == nil || len(s.Residents) != 3 || s.Residents[0].Order.ID != "abu-0" || s.Residents[0].Order.PreferredIngredient != "corn" {
		t.Fatalf("initial state: %+v", s)
	}
	s.Residents[0].Visits = 1
	refreshRestaurantOrders(s)
	surprise := s.Residents[0].Order
	if surprise.Kind != "surprise" {
		t.Fatal(surprise)
	}
	s.Recipes = []RestaurantRecipe{{ID: "recipe-one", Dish: sampleBento()}}
	s.SignatureIDs = []string{"recipe-one"}
	s.Residents[0].LastDishName = sampleBento().Name
	refreshRestaurantOrders(s)
	order := s.Residents[0].Order
	if order.Kind != "signature" || order.RecipeID != "recipe-one" || order.ID == surprise.ID || !strings.Contains(order.Text, "上次") {
		t.Fatal(order)
	}
	refreshRestaurantOrders(s)
	if order != s.Residents[0].Order {
		t.Fatal("read changed order")
	}
	s.Recipes[0].Dish.Portions[0].X++
	refreshRestaurantOrders(s)
	if order.ID == s.Residents[0].Order.ID {
		t.Fatal("changed composition left old order valid")
	}
	s.Residents[0].Visits = 2
	refreshRestaurantOrders(s)
	if s.Residents[0].Order.Kind != "surprise" {
		t.Fatal("expected surprise")
	}
	s.Residents[0].Visits = 3
	refreshRestaurantOrders(s)
	if s.Residents[0].Order.Kind != "wish" {
		t.Fatal("expected wish")
	}
	s.Recipes = append(s.Recipes, RestaurantRecipe{ID: "recipe-two", Dish: sampleBento()})
	s.SignatureIDs = append(s.SignatureIDs, "recipe-two")
	s.Residents[0].Visits = 4
	refreshRestaurantOrders(s)
	if s.Residents[0].Order.RecipeID != "recipe-two" {
		t.Fatal("signature rotation failed")
	}
}
func TestRestaurantFeedbackReflectsActualFood(t *testing.T) {
	r := initialRestaurantState().Residents[0]
	feedback, preferred := bentoFeedback(&r, sampleBento())
	if !preferred || !strings.Contains(feedback, "玉米") || !strings.Contains(feedback, "小熊") {
		t.Fatal(feedback)
	}
	d := sampleBento()
	d.Portions = []BentoPortion{{Ingredient: "egg", Style: "star", X: 50, Y: 50}}
	r.LastDishName = d.Name
	feedback, preferred = bentoFeedback(&r, d)
	if preferred || strings.Contains(feedback, "玉米") || strings.Contains(feedback, "小熊饭团") || !strings.Contains(feedback, "星星鸡蛋") || !strings.Contains(feedback, "又吃到") {
		t.Fatal(feedback)
	}
}
func TestRestaurantReplayHashesAllSemanticFields(t *testing.T) {
	base := ServeRestaurantRequest{RequestID: "restaurant-test-request", ResidentID: "abu", OrderID: "abu-0", Dish: sampleBento()}
	original, err := restaurantPayloadHash("serve", base)
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*ServeRestaurantRequest){func(r *ServeRestaurantRequest) { r.ResidentID = "lin" }, func(r *ServeRestaurantRequest) { r.OrderID = "abu-1" }, func(r *ServeRestaurantRequest) { r.RecipeID = "other" }, func(r *ServeRestaurantRequest) { r.Dish.Name = "另一道菜" }, func(r *ServeRestaurantRequest) { r.Dish.BoxColor = "mint" }, func(r *ServeRestaurantRequest) { r.Dish.Portions[0].Y++ }} {
		changed := base
		changed.Dish = sampleBento()
		change(&changed)
		hash, _ := restaurantPayloadHash("serve", changed)
		if hash == original {
			t.Fatal("changed payload has same digest")
		}
	}
	otherAction, _ := restaurantPayloadHash("save", base)
	if otherAction == original {
		t.Fatal("different actions share receipt")
	}
}

func TestRestaurantSaveAdoptsEditedDraftWithoutLosingHistory(t *testing.T) {
	dish := sampleBento()
	recipe := RestaurantRecipe{ID: "saved-recipe", Dish: dish, ServedCount: 2, FirstTaster: "阿布", LastFeedback: "旧评价"}
	different := dish
	different.Name = "名字不同的菜"
	state := initialRestaurantState()
	state.RecentServices = []RestaurantServiceResult{
		{RecipeID: "saved-recipe", Dish: dish, ResidentName: "林奶奶", Feedback: "最新评价"},
		{Dish: dish, ResidentName: "桃桃", Feedback: "修改版品尝评价"},
		{Dish: different, ResidentName: "林奶奶", Feedback: "另一道菜"},
		{RecipeID: "another-recipe", Dish: dish, ResidentName: "桃桃", Feedback: "别的食谱"},
	}
	adoptRestaurantServices(state, &recipe)
	if recipe.ServedCount != 3 || recipe.FirstTaster != "阿布" || recipe.LastFeedback != "最新评价" || state.RecentServices[1].RecipeID != recipe.ID || state.RecentServices[2].RecipeID != "" || state.RecentServices[3].RecipeID != "another-recipe" {
		t.Fatalf("incorrect adoption: %+v %+v", recipe, state.RecentServices)
	}
	adoptRestaurantServices(state, &recipe)
	if recipe.ServedCount != 3 {
		t.Fatal("saving again counted an adopted service twice")
	}
}
