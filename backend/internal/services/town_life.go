package services

import (
	"errors"
	"math/rand/v2"
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrTownPet    = errors.New("这个宠物伙伴还没有来到小镇")
	ErrTownCoins  = errors.New("金币还不够，学几个单词再来吧")
	ErrTownEvent  = errors.New("这件小镇事情不存在，请刷新后再试")
	ErrTownLocked = errors.New("先拥有对应建筑和伙伴，才能体验这件小镇事情")
)

const townEventDailyLimit = 3
const townEventInterval = 2 * time.Hour

type TownPetView struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Icon        string `json:"icon"`
	Description string `json:"description"`
	Price       int    `json:"price"`
	Owned       bool   `json:"owned"`
}

var townPets = []TownPetView{
	{ID: "dog", Name: "小狗豆豆", Icon: "🐶", Description: "爱摇尾巴的小伙伴，会在小镇陪你散步", Price: 20},
	{ID: "cat", Name: "小猫团团", Icon: "🐱", Description: "喜欢晒太阳，也喜欢在家门口等你回来", Price: 20},
}

type townEventRule struct {
	Kind, Building, Icon, Title, Description, Action, Outcome string
	Cost                                                      int
	NeedsPet                                                  bool
}

var townEventRules = []townEventRule{
	{Kind: "resident_sick", Building: "医院", Icon: "🩺", Title: "邻居有点感冒了", Description: "阿禾今天打了几个喷嚏，想请医生来看看。", Action: "呼叫小镇医生", Outcome: "医生带来了药和温水，阿禾舒服多了，又能在门口和你打招呼啦。", Cost: 1},
	{Kind: "small_fire", Building: "消防站", Icon: "🚒", Title: "厨房冒出一阵烟", Description: "邻居做饭时发现锅边有小火苗，大家已离开厨房，等消防员来帮忙。", Action: "拨打小镇消防电话", Outcome: "消防车叮铃铃开来了！消防员扑灭了小火苗，还教大家检查灶台。", Cost: 1},
	{Kind: "pet_sick", Building: "宠物医院", Icon: "🐾", Title: "毛茸茸的伙伴不太舒服", Description: "小伙伴今天没什么精神，需要宠物医生温柔地检查一下。", Action: "呼叫宠物医生", Outcome: "宠物医生做好了检查，小伙伴休息后恢复精神，又蹦蹦跳跳地跟着你啦。", Cost: 1, NeedsPet: true},
	{Kind: "lost_bag", Building: "警察局", Icon: "🎒", Title: "谁的小书包落下了", Description: "路边长椅上有一个小书包，请小镇警员帮忙找主人吧。", Action: "联系小镇警员", Outcome: "警员找到了书包的小主人，对方开心地向你挥手说谢谢！", Cost: 1},
	{Kind: "park_walk", Building: "公园", Icon: "🌳", Title: "公园的花开了", Description: "小路两旁开出新花，邻居邀请你一起走走、听听鸟叫。", Action: "一起去散步", Outcome: "你们沿着花间小路慢慢走，发现了一只停在叶子上的小蝴蝶。"},
	{Kind: "fresh_bread", Building: "商店", Icon: "🥖", Title: "商店飘来面包香", Description: "店主刚摆好今天的面包，想请你把一份带给隔壁邻居。", Action: "帮忙送面包", Outcome: "温热的面包送到了，邻居请你坐一会儿，聊了聊今天的小镇。"},
	{Kind: "warm_meal", Building: "餐厅", Icon: "🍜", Title: "今天有热乎乎的汤", Description: "餐厅正在准备邻里聚餐，厨师想请你一起摆好小餐桌。", Action: "一起准备聚餐", Outcome: "餐桌摆好了！大家围在一起喝汤，说起今天遇到的开心事。"},
	{Kind: "reading", Building: "图书馆", Icon: "📚", Title: "故事时间到啦", Description: "图书馆窗边留了一个座位，今天的故事里有森林和星星。", Action: "听一个故事", Outcome: "故事读完了，大家把书放回原处，约好下次再来探险。"},
	{Kind: "school_day", Building: "学校", Icon: "🏫", Title: "放学铃声响起来", Description: "孩子们背着书包走出校门，想和你分享今天认识的新单词。", Action: "和大家打招呼", Outcome: "你和孩子们互相说了 hello，校门口响起一阵轻快的笑声。"},
	{Kind: "movie_night", Building: "电影院", Icon: "🎬", Title: "小镇电影夜", Description: "影院门口亮起暖暖的灯，邻居约你一起看看今晚的海报。", Action: "去影院逛逛", Outcome: "你们看完海报，聊起最喜欢的故事，小镇的夜晚也热热闹闹。"},
	{Kind: "ball_game", Building: "体育馆", Icon: "⚽", Title: "球场传来欢呼声", Description: "邻居们在球场踢球，正好缺一个帮忙传球的小伙伴。", Action: "一起传球", Outcome: "你把球稳稳传了出去，大家击掌庆祝，运动后一起喝水休息。"},
	{Kind: "pet_play", Icon: "🐾", Title: "小伙伴想和你玩", Description: "毛茸茸的小伙伴叼来一个小球，期待地看着你。", Action: "陪它玩一会儿", Outcome: "小球滚过院子，小伙伴追着跑了几圈，满足地在你身旁趴下来。", NeedsPet: true},
}

func eligibleTownRules(buildings map[string]bool, hasPet bool) []townEventRule {
	rules := make([]townEventRule, 0, len(townEventRules))
	for _, rule := range townEventRules {
		if (rule.Building == "" || buildings[rule.Building]) && (!rule.NeedsPet || hasPet) {
			rules = append(rules, rule)
		}
	}
	return rules
}

func townRule(kind string) (townEventRule, bool) {
	for _, rule := range townEventRules {
		if rule.Kind == kind {
			return rule, true
		}
	}
	return townEventRule{}, false
}

func canCreateTownEvent(latest *models.TownEvent, todayCount int64, now time.Time) bool {
	if todayCount >= townEventDailyLimit {
		return false
	}
	if latest == nil {
		return true
	}
	return latest.ResolvedAt != nil && !now.Before(latest.ResolvedAt.Add(townEventInterval))
}

type TownEventView struct {
	models.TownEvent
	Building    string `json:"building"`
	Icon        string `json:"icon"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Action      string `json:"action"`
	Outcome     string `json:"outcome"`
	Cost        int    `json:"cost"`
}

func townEventView(event models.TownEvent) TownEventView {
	rule, _ := townRule(event.Kind)
	return TownEventView{TownEvent: event, Building: rule.Building, Icon: rule.Icon, Title: rule.Title, Description: rule.Description, Action: rule.Action, Outcome: rule.Outcome, Cost: rule.Cost}
}

type TownLifeState struct {
	Needs         TownNeedsView    `json:"needs"`
	Supplies      []TownSupplyView `json:"supplies"`
	Wallet        ResidentWallet   `json:"wallet"`
	Pets          []TownPetView    `json:"pets"`
	Buildings     []string         `json:"buildings"`
	Event         *TownEventView   `json:"event"`
	Recent        []TownEventView  `json:"recent"`
	UnlockedCount int              `json:"unlocked_count"`
}

type TownLifeService struct{ db *gorm.DB }

func NewTownLifeService(db *gorm.DB) *TownLifeService { return &TownLifeService{db: db} }

type townOwnership struct {
	pets        []TownPetView
	buildings   []string
	buildingMap map[string]bool
	hasPet      bool
}

func loadTownOwnership(tx *gorm.DB, userID uint) (*townOwnership, error) {
	var owned []models.TownPet
	if err := tx.Where("user_id = ?", userID).Find(&owned).Error; err != nil {
		return nil, err
	}
	petMap := map[string]bool{}
	for _, pet := range owned {
		petMap[pet.PetID] = true
	}
	o := &townOwnership{pets: append([]TownPetView{}, townPets...), buildings: []string{}, buildingMap: map[string]bool{}}
	for i := range o.pets {
		o.pets[i].Owned = petMap[o.pets[i].ID]
		o.hasPet = o.hasPet || o.pets[i].Owned
	}
	var built []models.UserBuilding
	if err := tx.Preload("Building").Where("user_id = ?", userID).Order("id").Find(&built).Error; err != nil {
		return nil, err
	}
	for _, b := range built {
		if b.Building.ID != 0 {
			o.buildings = append(o.buildings, b.Building.Name)
			o.buildingMap[b.Building.Name] = true
		}
	}
	return o, nil
}

// 所有生活写操作与学习、建造、换装共用用户行锁。GET 也持锁，避免多设备各生成一件待办。
func (s *TownLifeService) transact(userID uint, generate bool, action func(*gorm.DB, *models.User, *townOwnership) error) (*TownLifeState, error) {
	var state *TownLifeState
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		owned, err := loadTownOwnership(tx, userID)
		if err != nil {
			return err
		}
		if action != nil {
			if err := action(tx, &user, owned); err != nil {
				return err
			}
			owned, err = loadTownOwnership(tx, userID)
			if err != nil {
				return err
			}
		}
		state, err = s.state(tx, &user, owned, generate)
		return err
	})
	return state, err
}

func (s *TownLifeService) Get(userID uint) (*TownLifeState, error) {
	return s.transact(userID, true, nil)
}
func (s *TownLifeService) PurchasePet(userID uint, petID string) (*TownLifeState, error) {
	return s.transact(userID, false, func(tx *gorm.DB, user *models.User, owned *townOwnership) error {
		for _, pet := range owned.pets {
			if pet.ID != petID {
				continue
			}
			if pet.Owned {
				return nil
			}
			if user.Coins < pet.Price {
				return ErrTownCoins
			}
			if err := tx.Create(&models.TownPet{UserID: userID, PetID: petID}).Error; err != nil {
				return err
			}
			user.Coins -= pet.Price
			return tx.Model(user).Update("coins", user.Coins).Error
		}
		return ErrTownPet
	})
}

func (s *TownLifeService) Resolve(userID, eventID uint) (*TownLifeState, error) {
	return s.transact(userID, false, func(tx *gorm.DB, user *models.User, owned *townOwnership) error {
		var event models.TownEvent
		if err := tx.Where("id = ? AND user_id = ?", eventID, userID).First(&event).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTownEvent
			}
			return err
		}
		if event.ResolvedAt != nil {
			return nil
		}
		rule, ok := townRule(event.Kind)
		if !ok {
			return ErrTownEvent
		}
		if (rule.Building != "" && !owned.buildingMap[rule.Building]) || (rule.NeedsPet && !owned.hasPet) {
			return ErrTownLocked
		}
		if user.Coins < rule.Cost {
			return ErrTownCoins
		}
		user.Coins -= rule.Cost
		if err := tx.Model(user).Update("coins", user.Coins).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&event).Update("resolved_at", now).Error
	})
}

func (s *TownLifeService) state(tx *gorm.DB, user *models.User, owned *townOwnership, generate bool) (*TownLifeState, error) {
	rules := eligibleTownRules(owned.buildingMap, owned.hasPet)
	state := &TownLifeState{Wallet: ResidentWallet{Coins: user.Coins, Bricks: user.Bricks}, Pets: owned.pets, Buildings: owned.buildings, Recent: []TownEventView{}, UnlockedCount: len(rules)}
	needs, err := loadTownNeeds(tx, user.ID, owned, time.Now())
	if err != nil {
		return nil, err
	}
	state.Needs = TownNeedsView{Food: 100, Water: 100}
	if needs != nil {
		state.Needs = TownNeedsView{Enabled: true, Food: needs.Food, Water: needs.Water}
	}
	state.Supplies = townSuppliesView(owned)
	var events []models.TownEvent
	if err := tx.Where("user_id = ?", user.ID).Order("id DESC").Limit(4).Find(&events).Error; err != nil {
		return nil, err
	}
	var latest *models.TownEvent
	if len(events) > 0 {
		latest = &events[0]
	}
	if latest != nil && latest.ResolvedAt == nil {
		view := townEventView(*latest)
		state.Event = &view
	}
	for _, event := range events {
		if event.ResolvedAt != nil && len(state.Recent) < 3 {
			state.Recent = append(state.Recent, townEventView(event))
		}
	}
	if generate && state.Event == nil && len(rules) > 0 {
		now := time.Now()
		var count int64
		if err := tx.Model(&models.TownEvent{}).Where("user_id = ? AND created_at >= ? AND created_at < ?", user.ID, DayStart(now), DayEnd(now)).Count(&count).Error; err != nil {
			return nil, err
		}
		if canCreateTownEvent(latest, count, now) {
			// 连续两次尽量不同；仅从已拥有内容的候选中选择。
			choices := make([]townEventRule, 0, len(rules))
			for _, rule := range rules {
				if latest == nil || rule.Kind != latest.Kind {
					choices = append(choices, rule)
				}
			}
			if len(choices) == 0 {
				choices = rules
			}
			event := models.TownEvent{UserID: user.ID, Kind: choices[rand.IntN(len(choices))].Kind, CreatedAt: now}
			if err := tx.Create(&event).Error; err != nil {
				return nil, err
			}
			view := townEventView(event)
			state.Event = &view
		}
	}
	return state, nil
}
