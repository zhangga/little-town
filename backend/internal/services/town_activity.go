package services

import (
	"errors"
	"regexp"
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

var (
	ErrTownActivity        = errors.New("这项建筑体验暂时不存在，请刷新后再试")
	ErrTownActivityRequest = errors.New("这次购票信息已变化，请重新选择体验")
	activityRequestPattern = regexp.MustCompile(`^[A-Za-z0-9-]{16,80}$`)
)

type TownActivityView struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Building     string `json:"building"`
	Icon         string `json:"icon"`
	Description  string `json:"description"`
	Price        int    `json:"price"`
	Available    bool   `json:"available"`
	LockedReason string `json:"locked_reason"`
}

type townActivityRule struct {
	TownActivityView
	NeedsPet bool
}

var townActivities = []townActivityRule{
	{TownActivityView: TownActivityView{ID: "cinema_cloud", Name: "云朵快递员", Building: "电影院", Icon: "☁️", Description: "灯光暗下来啦！看小兔驾驶云朵车，给干渴的花园送来一场雨。", Price: 3}},
	{TownActivityView: TownActivityView{ID: "cinema_space", Name: "月亮的晚安灯", Building: "电影院", Icon: "🚀", Description: "跟小熊乘上纸火箭，去找一颗迷路的小星星。", Price: 3}},
	{TownActivityView: TownActivityView{ID: "school_words", Name: "动物单词课堂", Building: "学校", Icon: "🔤", Description: "看单词卡，把英文单词和可爱的小动物配成一对。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "school_numbers", Name: "水果数学课", Building: "学校", Icon: "🔢", Description: "数水果、帮同桌分点心，完成三道生活里的小算题。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "library_forest", Name: "森林里的借书卡", Building: "图书馆", Icon: "🌲", Description: "一边读故事，一边寻找画面里的线索，帮小狐狸办好借书卡。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "library_ocean", Name: "小海龟找朋友", Building: "图书馆", Icon: "🐳", Description: "翻开蓝色故事书，沿着海底线索，找到小海龟的朋友。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "shop_basket", Name: "周末采购清单", Building: "商店", Icon: "🧺", Description: "看着购物清单，找齐野餐需要的三件商品，装进自己的小篮子。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "shop_sort", Name: "小小理货员", Building: "商店", Icon: "🛒", Description: "新货到店啦！把水果、文具和清洁用品放回正确的货架。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "restaurant_soup", Name: "主厨的彩虹汤", Building: "餐厅", Icon: "🍲", Description: "在小游戏厨房里，按主厨的食谱选食材，做出一碗彩虹蔬菜汤。", Price: 2}},
	{TownActivityView: TownActivityView{ID: "restaurant_bento", Name: "我的缤纷便当", Building: "餐厅", Icon: "🍱", Description: "按订单给便当盒填满四个格子，主食、蔬菜和水果都要有。", Price: 2}},
	{TownActivityView: TownActivityView{ID: "park_garden", Name: "花园浇水日", Building: "公园", Icon: "🌷", Description: "观察花园里的小标牌，只给标着“口渴”的花朵浇水。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "park_birds", Name: "树梢观察家", Building: "公园", Icon: "🐦", Description: "安静观察公园，在树梢和草地的小伙伴里找到三种鸟。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "stadium_hoops", Name: "三球投篮挑战", Building: "体育馆", Icon: "🏀", Description: "观察每回合篮筐亮起的位置，选准方向，把三个篮球送进篮筐。", Price: 2}},
	{TownActivityView: TownActivityView{ID: "stadium_goal", Name: "小镇点球练习", Building: "体育馆", Icon: "⚽", Description: "看球门里的星星标记，选择射门方向，完成三次定点练习。", Price: 2}},
	{TownActivityView: TownActivityView{ID: "hospital_checkup", Name: "玩偶体检日", Building: "医院", Icon: "🩺", Description: "在玩偶体验区帮医生整理体检道具，给紧张的小熊送上鼓励。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "hospital_bandage", Name: "玩偶贴纸工坊", Building: "医院", Icon: "🩹", Description: "给布偶的游戏护理贴挑选图案，再配一条柔软的小毯子。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "vet_checkup", Name: "毛茸茸体检室", Building: "宠物医院", Icon: "🐾", Description: "扮演宠物医生的小助手，核对预约、准备道具，陪伴游戏里的小动物。", Price: 1}, NeedsPet: true},
	{TownActivityView: TownActivityView{ID: "vet_groom", Name: "宠物造型工作室", Building: "宠物医院", Icon: "🪮", Description: "为游戏里的毛绒小狗选梳子、毛巾和蝴蝶结，拍一张造型纪念照。", Price: 1}, NeedsPet: true},
	{TownActivityView: TownActivityView{ID: "fire_drill", Name: "安全小课堂", Building: "消防站", Icon: "🧯", Description: "阅读消防安全故事，练习远离危险、及时求助和听从疏散指引。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "fire_rescue", Name: "消防队模拟出勤", Building: "消防站", Icon: "🚒", Description: "在模拟指挥台为专业消防员配齐出勤图卡，跟随故事完成一次救援。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "police_lost", Name: "失物招领小侦探", Building: "警察局", Icon: "🎒", Description: "根据居民提供的颜色和图案线索，帮警员找回三件丢失的物品。", Price: 1}},
	{TownActivityView: TownActivityView{ID: "police_traffic", Name: "交通灯小课堂", Building: "警察局", Icon: "🚦", Description: "跟警员观察红绿灯和人行横道，完成三道出行安全小题。", Price: 1}},
}

func townActivity(id string) (townActivityRule, bool) {
	for _, activity := range townActivities {
		if activity.ID == id {
			return activity, true
		}
	}
	return townActivityRule{}, false
}

func townActivityLockedReason(activity townActivityRule, owned *townOwnership) string {
	if !owned.buildingMap[activity.Building] {
		return "先建好" + activity.Building + "，就能来体验啦"
	}
	if activity.NeedsPet && !owned.hasPet {
		return "先领养一位宠物伙伴，再一起来体验吧"
	}
	return ""
}

func townActivitiesView(owned *townOwnership) []TownActivityView {
	items := make([]TownActivityView, 0, len(townActivities))
	for _, activity := range townActivities {
		view := activity.TownActivityView
		view.LockedReason = townActivityLockedReason(activity, owned)
		view.Available = view.LockedReason == ""
		items = append(items, view)
	}
	return items
}

// Receipt 表示成功购买的入场凭据，不代表完成玩法，也不发放奖励。
type TownActivityReceipt struct {
	ActivityID string    `json:"activity_id"`
	RequestID  string    `json:"request_id"`
	Name       string    `json:"name"`
	Building   string    `json:"building"`
	Icon       string    `json:"icon"`
	Price      int       `json:"price"`
	CreatedAt  time.Time `json:"created_at"`
}

func townActivityReceipt(visit models.TownActivityVisit) TownActivityReceipt {
	return TownActivityReceipt{ActivityID: visit.ActivityID, RequestID: visit.RequestID, Name: visit.Name, Building: visit.Building, Icon: visit.Icon, Price: visit.Price, CreatedAt: visit.CreatedAt}
}

func validActivityRequestID(id string) bool { return activityRequestPattern.MatchString(id) }

func (s *TownLifeService) StartActivity(userID uint, activityID, requestID string) (*TownLifeState, error) {
	if !validActivityRequestID(requestID) {
		return nil, ErrTownActivityRequest
	}
	var receipt TownActivityReceipt
	state, err := s.transact(userID, false, func(tx *gorm.DB, user *models.User, owned *townOwnership) error {
		var previous models.TownActivityVisit
		err := tx.Where("user_id = ? AND request_id = ?", userID, requestID).First(&previous).Error
		if err == nil {
			if previous.ActivityID != activityID {
				return ErrTownActivityRequest
			}
			receipt = townActivityReceipt(previous)
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		activity, ok := townActivity(activityID)
		if !ok {
			return ErrTownActivity
		}
		if townActivityLockedReason(activity, owned) != "" {
			return ErrTownLocked
		}
		if user.Coins < activity.Price {
			return ErrTownCoins
		}
		user.Coins -= activity.Price
		if err := tx.Model(user).Update("coins", user.Coins).Error; err != nil {
			return err
		}
		visit := models.TownActivityVisit{UserID: userID, RequestID: requestID, ActivityID: activity.ID, Name: activity.Name, Building: activity.Building, Icon: activity.Icon, Price: activity.Price}
		if err := tx.Create(&visit).Error; err != nil {
			return err
		}
		receipt = townActivityReceipt(visit)
		return nil
	})
	if err != nil {
		return nil, err
	}
	state.ActivityReceipt = &receipt
	return state, nil
}
