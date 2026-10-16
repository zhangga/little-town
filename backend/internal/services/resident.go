package services

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrResidentName    = errors.New("名字需要 1～12 个字，请不要使用换行或特殊控制字符")
	ErrResidentItem    = errors.New("这件物品不存在")
	ErrResidentCoins   = errors.New("金币还不够，完成学习后再来看看吧")
	ErrResidentOwned   = errors.New("请先拥有这件物品")
	ErrResidentBricks  = errors.New("砖块还不够，先去完成学习任务吧")
	ErrResidentHome    = errors.New("小屋状态已变化，请刷新后再试")
	ErrResidentMaxHome = errors.New("小屋已经升到最高级啦")
)

type ResidentShopItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Kind        string `json:"kind"`
	Price       int    `json:"price"`
	Owned       bool   `json:"owned"`
	Equipped    bool   `json:"equipped"`
}

var residentCatalog = []ResidentShopItem{
	{ID: "everyday", Name: "薄荷日常装", Description: "背起小书包，认识新的单词", Kind: "outfit", Price: 0},
	{ID: "builder", Name: "小小建造师", Description: "戴上安全帽，为小镇添一块砖", Kind: "outfit", Price: 60},
	{ID: "gardener", Name: "阳光园丁", Description: "给小镇的花草一点照顾", Kind: "outfit", Price: 90},
	{ID: "explorer", Name: "森林探险家", Description: "带着好奇心，发现更大的世界", Kind: "outfit", Price: 120},
	{ID: "none", Name: "清爽庭院", Description: "留一块空地，等新的故事发生", Kind: "decoration", Price: 0},
	{ID: "flowers", Name: "缤纷花箱", Description: "让家门口开满小花", Kind: "decoration", Price: 40},
	{ID: "flag", Name: "迎风小旗", Description: "小旗飘起来，这里就是我的家", Kind: "decoration", Price: 30},
	{ID: "trees", Name: "绿荫角落", Description: "在小屋旁添一片绿意", Kind: "decoration", Price: 70},
}

var homeNames = []string{"", "初来的小屋", "暖暖的家", "花园之家"}
var homeCosts = []int{0, 0, 15, 30}

func ResidentProgress(xp int) (level, current, needed int, title string) {
	thresholds := []int{0, 30, 80, 150, 250}
	titles := []string{"见习镇长", "活力镇长", "小镇建造师", "小镇规划师", "小镇守护者"}
	index := 0
	for index+1 < len(thresholds) && xp >= thresholds[index+1] {
		index++
	}
	level, title = index+1, titles[index]
	current = max(0, xp-thresholds[index])
	if index+1 < len(thresholds) {
		needed = thresholds[index+1] - thresholds[index]
	}
	return
}

func ValidateResidentName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 12 {
		return "", ErrResidentName
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return "", ErrResidentName
		}
	}
	return name, nil
}

func residentItem(id string) (ResidentShopItem, bool) {
	for _, item := range residentCatalog {
		if item.ID == id {
			return item, true
		}
	}
	return ResidentShopItem{}, false
}

func ensureResident(tx *gorm.DB, userID uint) (*models.Resident, error) {
	resident := models.Resident{UserID: userID, Name: "小镇长", OutfitID: "everyday", DecorationID: "none", HomeLevel: 1}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&resident).Error; err != nil {
		return nil, err
	}
	if err := tx.First(&resident, "user_id = ?", userID).Error; err != nil {
		return nil, err
	}
	return &resident, nil
}

type ResidentView struct {
	models.Resident
	Level     int    `json:"level"`
	Title     string `json:"title"`
	XPCurrent int    `json:"xp_current"`
	XPNeeded  int    `json:"xp_needed"`
}
type ResidentDaily struct {
	Completed int  `json:"completed"`
	Goal      int  `json:"goal"`
	Reviews   int  `json:"reviews"`
	Done      bool `json:"done"`
	BonusXP   int  `json:"bonus_xp"`
}
type ResidentHome struct {
	Level       int    `json:"level"`
	Name        string `json:"name"`
	NextLevel   int    `json:"next_level"`
	UpgradeCost int    `json:"upgrade_cost"`
	CanUpgrade  bool   `json:"can_upgrade"`
}
type ResidentWallet struct {
	Coins  int `json:"coins"`
	Bricks int `json:"bricks"`
}
type ResidentState struct {
	Resident ResidentView       `json:"resident"`
	Wallet   ResidentWallet     `json:"wallet"`
	Daily    ResidentDaily      `json:"daily"`
	Home     ResidentHome       `json:"home"`
	Shop     []ResidentShopItem `json:"shop"`
}

type ResidentService struct {
	db        *gorm.DB
	dailyGoal int
}

func NewResidentService(db *gorm.DB, dailyGoal int) *ResidentService {
	if dailyGoal < 1 {
		dailyGoal = 5
	}
	return &ResidentService{db: db, dailyGoal: dailyGoal}
}

// 所有花费/装备/成长操作都先锁同一用户行，跨设备请求也按顺序扣款。
func (s *ResidentService) mutate(userID uint, action func(*gorm.DB, *models.User, *models.Resident) error) (*ResidentState, error) {
	var state *ResidentState
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		resident, err := ensureResident(tx, userID)
		if err != nil {
			return err
		}
		if action != nil {
			if err := action(tx, &user, resident); err != nil {
				return err
			}
		}
		state, err = s.state(tx, &user, resident)
		return err
	})
	return state, err
}

func (s *ResidentService) Get(userID uint) (*ResidentState, error) { return s.mutate(userID, nil) }
func (s *ResidentService) Rename(userID uint, name string) (*ResidentState, error) {
	name, err := ValidateResidentName(name)
	if err != nil {
		return nil, err
	}
	return s.mutate(userID, func(tx *gorm.DB, user *models.User, resident *models.Resident) error {
		resident.Name = name
		return tx.Model(resident).Update("name", name).Error
	})
}

func (s *ResidentService) Purchase(userID uint, id string) (*ResidentState, error) {
	item, ok := residentItem(id)
	if !ok {
		return nil, ErrResidentItem
	}
	return s.mutate(userID, func(tx *gorm.DB, user *models.User, resident *models.Resident) error {
		var owned int64
		if err := tx.Model(&models.ResidentItem{}).Where("user_id = ? AND item_id = ?", userID, id).Count(&owned).Error; err != nil {
			return err
		}
		if item.Price > 0 && owned == 0 {
			if user.Coins < item.Price {
				return ErrResidentCoins
			}
			if err := tx.Create(&models.ResidentItem{UserID: userID, ItemID: id}).Error; err != nil {
				return err
			}
			user.Coins -= item.Price
			if err := tx.Model(user).Update("coins", user.Coins).Error; err != nil {
				return err
			}
		}
		return equipResident(tx, resident, item)
	})
}

func equipResident(tx *gorm.DB, resident *models.Resident, item ResidentShopItem) error {
	if item.Kind == "outfit" {
		resident.OutfitID = item.ID
		return tx.Model(resident).Update("outfit_id", item.ID).Error
	}
	resident.DecorationID = item.ID
	return tx.Model(resident).Update("decoration_id", item.ID).Error
}

func (s *ResidentService) Equip(userID uint, id string) (*ResidentState, error) {
	item, ok := residentItem(id)
	if !ok {
		return nil, ErrResidentItem
	}
	return s.mutate(userID, func(tx *gorm.DB, user *models.User, resident *models.Resident) error {
		if item.Price > 0 {
			var owned int64
			if err := tx.Model(&models.ResidentItem{}).Where("user_id = ? AND item_id = ?", userID, id).Count(&owned).Error; err != nil {
				return err
			}
			if owned == 0 {
				return ErrResidentOwned
			}
		}
		return equipResident(tx, resident, item)
	})
}

func (s *ResidentService) UpgradeHome(userID uint, expectedLevel int) (*ResidentState, error) {
	return s.mutate(userID, func(tx *gorm.DB, user *models.User, resident *models.Resident) error {
		if resident.HomeLevel != expectedLevel {
			return ErrResidentHome
		}
		if resident.HomeLevel >= 3 {
			return ErrResidentMaxHome
		}
		cost := homeCosts[resident.HomeLevel+1]
		if user.Bricks < cost {
			return ErrResidentBricks
		}
		user.Bricks -= cost
		if err := tx.Model(user).Update("bricks", user.Bricks).Error; err != nil {
			return err
		}
		resident.HomeLevel++
		return tx.Model(resident).Update("home_level", resident.HomeLevel).Error
	})
}

func (s *ResidentService) state(tx *gorm.DB, user *models.User, resident *models.Resident) (*ResidentState, error) {
	var owned []models.ResidentItem
	if err := tx.Where("user_id = ?", user.ID).Find(&owned).Error; err != nil {
		return nil, err
	}
	ownedMap := map[string]bool{}
	for _, item := range owned {
		ownedMap[item.ItemID] = true
	}
	shop := make([]ResidentShopItem, len(residentCatalog))
	copy(shop, residentCatalog)
	for i := range shop {
		shop[i].Owned = shop[i].Price == 0 || ownedMap[shop[i].ID]
		shop[i].Equipped = shop[i].ID == resident.OutfitID || shop[i].ID == resident.DecorationID
	}
	var total, reviews int64
	today := tx.Model(&models.ResidentStudy{}).Where("user_id = ? AND day = ?", user.ID, TodayString())
	if err := today.Count(&total).Error; err != nil {
		return nil, err
	}
	if err := today.Where("is_review = ?", true).Count(&reviews).Error; err != nil {
		return nil, err
	}
	completed := min(int(total), s.dailyGoal)
	// 老版本当天已经领过完成奖励的用户，升级后仍显示今天已完成。
	if user.DailyBonusDate == TodayString() {
		completed = s.dailyGoal
	}
	level, current, needed, title := ResidentProgress(resident.Experience)
	home := ResidentHome{Level: resident.HomeLevel, Name: homeNames[resident.HomeLevel]}
	if home.Level < 3 {
		home.NextLevel = home.Level + 1
		home.UpgradeCost = homeCosts[home.NextLevel]
		home.CanUpgrade = user.Bricks >= home.UpgradeCost
	}
	return &ResidentState{
		Resident: ResidentView{Resident: *resident, Level: level, Title: title, XPCurrent: current, XPNeeded: needed},
		Wallet:   ResidentWallet{Coins: user.Coins, Bricks: user.Bricks},
		Daily:    ResidentDaily{Completed: completed, Goal: s.dailyGoal, Reviews: int(reviews), Done: completed >= s.dailyGoal, BonusXP: 10},
		Home:     home, Shop: shop,
	}, nil
}

type ResidentLearning struct {
	XPEarned       int
	Experience     int
	Level          int
	RewardEligible bool
	FirstToday     bool
	DayComplete    bool
}

// RecordLearning 在提交答案的事务内调用；调用方必须先锁 User 行。
func (s *ResidentService) RecordLearning(tx *gorm.DB, userID, wordID uint, correct, isReview bool) (*ResidentLearning, error) {
	resident, err := ensureResident(tx, userID)
	if err != nil {
		return nil, err
	}
	day := TodayString()
	var activity models.ResidentStudy
	err = tx.Where("user_id = ? AND day = ? AND word_id = ?", userID, day, wordID).First(&activity).Error
	first := errors.Is(err, gorm.ErrRecordNotFound)
	if err != nil && !first {
		return nil, err
	}
	eligible := correct && (first || !activity.Rewarded)
	if first {
		activity = models.ResidentStudy{UserID: userID, Day: day, WordID: wordID, IsReview: isReview, Rewarded: correct}
		if err := tx.Create(&activity).Error; err != nil {
			return nil, err
		}
	} else if eligible {
		if err := tx.Model(&activity).Update("rewarded", true).Error; err != nil {
			return nil, err
		}
	}
	var total int64
	if err := tx.Model(&models.ResidentStudy{}).Where("user_id = ? AND day = ?", userID, day).Count(&total).Error; err != nil {
		return nil, err
	}
	xp := 0
	if first && total <= int64(s.dailyGoal) {
		xp = 5
	}
	complete := total >= int64(s.dailyGoal)
	if complete && resident.XPBonusDate != day {
		xp += 10
		resident.XPBonusDate = day
	}
	resident.Experience += xp
	if err := tx.Model(resident).Updates(map[string]interface{}{"experience": resident.Experience, "xp_bonus_date": resident.XPBonusDate}).Error; err != nil {
		return nil, err
	}
	level, _, _, _ := ResidentProgress(resident.Experience)
	return &ResidentLearning{XPEarned: xp, Experience: resident.Experience, Level: level, RewardEligible: eligible, FirstToday: first, DayComplete: complete}, nil
}
