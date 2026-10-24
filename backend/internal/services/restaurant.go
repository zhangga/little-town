package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrRestaurantLocked      = errors.New("先建好餐厅，就能来做便当啦")
	ErrRestaurantDish        = errors.New("请给便当取个名字，放入 1 至 8 份食材，并把食材放在盒子里面")
	ErrRestaurantRecipe      = errors.New("这道食谱不存在，请刷新食谱本")
	ErrRestaurantLimit       = errors.New("食谱本最多保存 24 道菜，可以更新已有食谱")
	ErrRestaurantMenu        = errors.New("请从自己的食谱里选择最多 3 道不同的招牌菜")
	ErrRestaurantOrder       = errors.New("这份订单已经变化，请刷新后重新选择居民")
	ErrRestaurantComposition = errors.New("请按招牌菜的食谱准备这份便当")
	ErrRestaurantRequest     = errors.New("这次操作的信息已变化，请刷新后重试")
)

type BentoPortion struct {
	Ingredient string  `json:"ingredient"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Style      string  `json:"style"`
}
type BentoDish struct {
	Name       string         `json:"name"`
	BoxShape   string         `json:"box_shape"`
	BoxColor   string         `json:"box_color"`
	Decoration string         `json:"decoration"`
	Portions   []BentoPortion `json:"portions"`
}
type RestaurantRecipe struct {
	ID           string    `json:"id"`
	Dish         BentoDish `json:"dish"`
	ServedCount  int       `json:"served_count"`
	FirstTaster  string    `json:"first_taster"`
	LastFeedback string    `json:"last_feedback"`
}
type RestaurantOrder struct {
	ID                  string `json:"id"`
	Kind                string `json:"kind"`
	Text                string `json:"text"`
	PreferredIngredient string `json:"preferred_ingredient"`
	RecipeID            string `json:"recipe_id"`
}
type RestaurantResident struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Icon         string          `json:"icon"`
	Preference   string          `json:"preference"`
	Visits       int             `json:"visits"`
	LastDishName string          `json:"last_dish_name"`
	LastFeedback string          `json:"last_feedback"`
	Order        RestaurantOrder `json:"order"`
}
type RestaurantServiceResult struct {
	RequestID    string    `json:"request_id"`
	ResidentID   string    `json:"resident_id"`
	ResidentName string    `json:"resident_name"`
	Dish         BentoDish `json:"dish"`
	RecipeID     string    `json:"recipe_id"`
	Feedback     string    `json:"feedback"`
	Preferred    bool      `json:"preferred"`
}
type RestaurantState struct {
	Recipes        []RestaurantRecipe        `json:"recipes"`
	SignatureIDs   []string                  `json:"signature_ids"`
	Residents      []RestaurantResident      `json:"residents"`
	RecentServices []RestaurantServiceResult `json:"recent_services"`
	SavedRecipeID  string                    `json:"saved_recipe_id,omitempty"`
	ServiceResult  *RestaurantServiceResult  `json:"service_result,omitempty"`
}
type SaveRestaurantRecipeRequest struct {
	RequestID string    `json:"request_id"`
	RecipeID  string    `json:"recipe_id"`
	Dish      BentoDish `json:"dish"`
}
type SetRestaurantSignaturesRequest struct {
	RequestID string   `json:"request_id"`
	RecipeIDs []string `json:"recipe_ids"`
}
type ServeRestaurantRequest struct {
	RequestID  string    `json:"request_id"`
	ResidentID string    `json:"resident_id"`
	OrderID    string    `json:"order_id"`
	RecipeID   string    `json:"recipe_id"`
	Dish       BentoDish `json:"dish"`
}
type RestaurantService struct{ db *gorm.DB }

func NewRestaurantService(db *gorm.DB) *RestaurantService { return &RestaurantService{db: db} }

func normalizeBento(dish BentoDish) (BentoDish, error) {
	// Check before trimming so an embedded or leading newline cannot silently disappear.
	for _, r := range dish.Name {
		if unicode.IsControl(r) {
			return BentoDish{}, ErrRestaurantDish
		}
	}
	dish.Name = strings.TrimSpace(dish.Name)
	if !utf8.ValidString(dish.Name) || utf8.RuneCountInString(dish.Name) < 1 || utf8.RuneCountInString(dish.Name) > 16 || len(dish.Portions) < 1 || len(dish.Portions) > 8 {
		return BentoDish{}, ErrRestaurantDish
	}
	if dish.BoxShape != "square" && dish.BoxShape != "round" {
		return BentoDish{}, ErrRestaurantDish
	}
	if dish.BoxColor != "peach" && dish.BoxColor != "mint" && dish.BoxColor != "sunshine" {
		return BentoDish{}, ErrRestaurantDish
	}
	if dish.Decoration != "none" && dish.Decoration != "sesame" && dish.Decoration != "flower" && dish.Decoration != "star" {
		return BentoDish{}, ErrRestaurantDish
	}
	for _, p := range dish.Portions {
		switch p.Ingredient {
		case "rice", "egg", "broccoli", "corn", "carrot", "strawberry":
		default:
			return BentoDish{}, ErrRestaurantDish
		}
		if p.Style != "plain" && !(p.Style == "bear" && p.Ingredient == "rice") && !(p.Style == "star" && p.Ingredient == "egg") {
			return BentoDish{}, ErrRestaurantDish
		}
		if math.IsNaN(p.X) || math.IsNaN(p.Y) || math.IsInf(p.X, 0) || math.IsInf(p.Y, 0) || p.X < 15 || p.X > 85 || p.Y < 15 || p.Y > 85 {
			return BentoDish{}, ErrRestaurantDish
		}
		if dish.BoxShape == "round" && math.Hypot(p.X-50, p.Y-50) > 35+1e-9 {
			return BentoDish{}, ErrRestaurantDish
		}
	}
	return dish, nil
}

func sameBentoComposition(a, b BentoDish) bool {
	a.Name, b.Name = "", ""
	return reflect.DeepEqual(a, b)
}
func initialRestaurantState() *RestaurantState {
	return &RestaurantState{Recipes: []RestaurantRecipe{}, SignatureIDs: []string{}, RecentServices: []RestaurantServiceResult{}, Residents: []RestaurantResident{
		{ID: "abu", Name: "阿布", Icon: "👦", Preference: "corn"},
		{ID: "taotao", Name: "桃桃", Icon: "👧", Preference: "strawberry"},
		{ID: "lin", Name: "林奶奶", Icon: "👵", Preference: "broccoli"},
	}}
}
func restaurantRecipe(state *RestaurantState, id string) *RestaurantRecipe {
	for i := range state.Recipes {
		if state.Recipes[i].ID == id {
			return &state.Recipes[i]
		}
	}
	return nil
}
func refreshRestaurantOrders(state *RestaurantState) {
	for i := range state.Residents {
		r := &state.Residents[i]
		o := RestaurantOrder{ID: fmt.Sprintf("%s-%d", r.ID, r.Visits), Kind: "wish", PreferredIngredient: r.Preference}
		switch r.Preference {
		case "corn":
			o.Text = "我喜欢玉米，今天想吃一份玉米便当。"
		case "strawberry":
			o.Text = "要是便当里有草莓就好啦，你来搭配其他食物吧。"
		default:
			o.Text = "我喜欢西兰花，今天也请你帮我做份便当吧。"
		}
		if r.Visits%3 != 0 {
			o.Kind, o.Text = "surprise", "今天你当主厨，我想尝尝你的新作品！"
			o.ID += "-surprise"
			if r.Visits%3 == 1 && len(state.SignatureIDs) > 0 {
				recipe := restaurantRecipe(state, state.SignatureIDs[(r.Visits/3)%len(state.SignatureIDs)])
				if recipe != nil {
					o.Kind, o.RecipeID = "signature", recipe.ID
					o.Text = "想尝尝店里的招牌菜「" + recipe.Dish.Name + "」，请按菜单上的样子做一份吧！"
					if r.LastDishName == recipe.Dish.Name {
						o.Text = "上次的「" + recipe.Dish.Name + "」真好吃，我还想再吃一次！"
					}
					data, _ := json.Marshal(recipe.Dish)
					sum := sha256.Sum256(append([]byte(recipe.ID), data...))
					o.ID = fmt.Sprintf("%s-%d-%x", r.ID, r.Visits, sum[:8])
				}
			}
		}
		r.Order = o
	}
}

func restaurantPayloadHash(kind string, payload interface{}) (string, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(append([]byte(kind+":"), data...))
	return hex.EncodeToString(sum[:]), nil
}

// transact shares the user-row lock with building and wallet services. State and
// receipt commit together; a retry returns current state plus its original result.
func (s *RestaurantService) transact(userID uint, requestID, kind string, payload interface{}, action func(*RestaurantState) error) (*RestaurantState, error) {
	var state *RestaurantState
	var payloadHash string
	if action != nil {
		if !validActivityRequestID(requestID) {
			return nil, ErrRestaurantRequest
		}
		var err error
		payloadHash, err = restaurantPayloadHash(kind, payload)
		if err != nil {
			return nil, ErrRestaurantRequest
		}
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&models.UserBuilding{}).Joins("JOIN buildings ON buildings.id = user_buildings.building_id AND buildings.deleted_at IS NULL").Where("user_buildings.user_id = ? AND buildings.name = ?", userID, "餐厅").Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return ErrRestaurantLocked
		}
		row := models.Restaurant{UserID: userID}
		err := tx.First(&row, "user_id = ?", userID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state = initialRestaurantState()
		} else if err != nil {
			return err
		} else {
			state = &RestaurantState{}
			if err := json.Unmarshal([]byte(row.StateJSON), state); err != nil {
				return err
			}
		}
		refreshRestaurantOrders(state)
		if action == nil {
			return nil
		}
		var prior models.RestaurantRequest
		err = tx.First(&prior, "user_id = ? AND request_id = ?", userID, requestID).Error
		if err == nil {
			if prior.PayloadHash != payloadHash {
				return ErrRestaurantRequest
			}
			state.SavedRecipeID = prior.SavedRecipeID
			if prior.ServiceJSON != "" {
				state.ServiceResult = &RestaurantServiceResult{}
				if err := json.Unmarshal([]byte(prior.ServiceJSON), state.ServiceResult); err != nil {
					return err
				}
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := action(state); err != nil {
			return err
		}
		refreshRestaurantOrders(state)
		receipt := models.RestaurantRequest{UserID: userID, RequestID: requestID, PayloadHash: payloadHash, SavedRecipeID: state.SavedRecipeID}
		if state.ServiceResult != nil {
			data, err := json.Marshal(state.ServiceResult)
			if err != nil {
				return err
			}
			receipt.ServiceJSON = string(data)
		}
		// Per-write results are not persisted as part of GET state.
		stored := *state
		stored.SavedRecipeID, stored.ServiceResult = "", nil
		data, err := json.Marshal(stored)
		if err != nil {
			return err
		}
		row.StateJSON = string(data)
		if err := tx.Save(&row).Error; err != nil {
			return err
		}
		return tx.Create(&receipt).Error
	})
	if err != nil {
		return nil, err
	}
	return state, nil
}
func (s *RestaurantService) Get(userID uint) (*RestaurantState, error) {
	return s.transact(userID, "", "", nil, nil)
}
func (s *RestaurantService) SaveRecipe(userID uint, req SaveRestaurantRecipeRequest) (*RestaurantState, error) {
	var err error
	req.Dish, err = normalizeBento(req.Dish)
	if err != nil {
		return nil, err
	}
	return s.transact(userID, req.RequestID, "save", req, func(state *RestaurantState) error {
		recipe := restaurantRecipe(state, req.RecipeID)
		if req.RecipeID != "" && recipe == nil {
			return ErrRestaurantRecipe
		}
		if recipe == nil {
			if len(state.Recipes) >= 24 {
				return ErrRestaurantLimit
			}
			id := make([]byte, 16)
			if _, err := rand.Read(id); err != nil {
				return err
			}
			created := RestaurantRecipe{ID: hex.EncodeToString(id), Dish: req.Dish}
			state.Recipes = append(state.Recipes, created)
			recipe = &state.Recipes[len(state.Recipes)-1]
		} else {
			recipe.Dish = req.Dish
		}
		adoptRestaurantServices(state, recipe)
		state.SavedRecipeID = recipe.ID
		return nil
	})
}

// Both a new dish and an edited draft may be served before being saved. Adopt
// only matching unattributed services, so updating or retrying cannot double-count.
func adoptRestaurantServices(state *RestaurantState, recipe *RestaurantRecipe) {
	for i := len(state.RecentServices) - 1; i >= 0; i-- {
		memory := &state.RecentServices[i]
		if memory.RecipeID == "" && reflect.DeepEqual(memory.Dish, recipe.Dish) {
			recipe.ServedCount++
			if recipe.FirstTaster == "" {
				recipe.FirstTaster = memory.ResidentName
			}
			memory.RecipeID = recipe.ID
		}
		// Keep the newest feedback even if an older free tasting was just adopted.
		if memory.RecipeID == recipe.ID {
			recipe.LastFeedback = memory.Feedback
		}
	}
}

func (s *RestaurantService) SetSignatures(userID uint, req SetRestaurantSignaturesRequest) (*RestaurantState, error) {
	if req.RecipeIDs == nil {
		req.RecipeIDs = []string{}
	}
	return s.transact(userID, req.RequestID, "menu", req, func(state *RestaurantState) error {
		if len(req.RecipeIDs) > 3 {
			return ErrRestaurantMenu
		}
		seen := map[string]bool{}
		for _, id := range req.RecipeIDs {
			if seen[id] || restaurantRecipe(state, id) == nil {
				return ErrRestaurantMenu
			}
			seen[id] = true
		}
		state.SignatureIDs = append([]string{}, req.RecipeIDs...)
		return nil
	})
}
func bentoFeedback(resident *RestaurantResident, dish BentoDish) (string, bool) {
	preferred, bear, star := false, false, false
	for _, p := range dish.Portions {
		preferred = preferred || p.Ingredient == resident.Preference
		bear = bear || p.Style == "bear"
		star = star || p.Style == "star"
	}
	feedback := "谢谢你为我做便当，我很喜欢这份心意！"
	if preferred {
		food := map[string]string{"corn": "玉米", "strawberry": "草莓", "broccoli": "西兰花"}[resident.Preference]
		feedback = "你还记得我喜欢" + food + "！"
	}
	if bear {
		feedback += "小熊饭团真可爱。"
	} else if star {
		feedback += "星星鸡蛋真好看。"
	} else if dish.Decoration == "flower" {
		feedback += "小花装饰真好看。"
	}
	if resident.LastDishName == dish.Name {
		feedback += "又吃到你做的「" + dish.Name + "」啦！"
	}
	return feedback, preferred
}
func (s *RestaurantService) Serve(userID uint, req ServeRestaurantRequest) (*RestaurantState, error) {
	var err error
	req.Dish, err = normalizeBento(req.Dish)
	if err != nil {
		return nil, err
	}
	return s.transact(userID, req.RequestID, "serve", req, func(state *RestaurantState) error {
		var resident *RestaurantResident
		for i := range state.Residents {
			if state.Residents[i].ID == req.ResidentID {
				resident = &state.Residents[i]
				break
			}
		}
		if resident == nil || resident.Order.ID != req.OrderID {
			return ErrRestaurantOrder
		}
		recipe := restaurantRecipe(state, req.RecipeID)
		if req.RecipeID != "" && recipe == nil {
			return ErrRestaurantRecipe
		}
		if recipe != nil && !sameBentoComposition(recipe.Dish, req.Dish) {
			return ErrRestaurantComposition
		}
		if resident.Order.Kind == "signature" {
			expected := restaurantRecipe(state, resident.Order.RecipeID)
			if expected == nil || !sameBentoComposition(expected.Dish, req.Dish) || (recipe != nil && recipe.ID != expected.ID) {
				return ErrRestaurantComposition
			}
			recipe = expected
		}
		feedback, preferred := bentoFeedback(resident, req.Dish)
		result := RestaurantServiceResult{RequestID: req.RequestID, ResidentID: resident.ID, ResidentName: resident.Name, Dish: req.Dish, Feedback: feedback, Preferred: preferred}
		if recipe != nil {
			result.RecipeID = recipe.ID
			recipe.ServedCount++
			if recipe.FirstTaster == "" {
				recipe.FirstTaster = resident.Name
			}
			recipe.LastFeedback = feedback
		}
		resident.Visits++
		resident.LastDishName, resident.LastFeedback = req.Dish.Name, feedback
		state.RecentServices = append([]RestaurantServiceResult{result}, state.RecentServices...)
		if len(state.RecentServices) > 12 {
			state.RecentServices = state.RecentServices[:12]
		}
		state.ServiceResult = &result
		return nil
	})
}
