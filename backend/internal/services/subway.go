package services

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"math"
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrSubway = errors.New("跑酷记录已变化，请重新进入站台")
var ErrSubwayBalance = errors.New("星光币还不够，再跑一程吧")
var ErrSubwayResult = errors.New("这次跑酷结果未通过校验，无法结算")

const SubwayDailyCap = 1000

type SubwayItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Price       int    `json:"price"`
	Kind        string `json:"kind"`
	Color       string `json:"color"`
	Owned       bool   `json:"owned"`
	Equipped    bool   `json:"equipped"`
}

var subwayCatalog = []SubwayItem{
	{ID: "coins", Name: "小镇金币 ×10", Description: "可在小镇商场购买家具、食物和装扮", Price: 50, Kind: "exchange", Color: "#ffc545"},
	{ID: "bricks", Name: "建造砖块 ×1", Description: "兑换后直接进入小镇建造钱包", Price: 100, Kind: "exchange", Color: "#ff845e"},
	{ID: "mint", Name: "薄荷巡航", Description: "经典滑板 · 每次启动可抵挡一次碰撞", Kind: "skin", Color: "#25dfbd"},
	{ID: "sunset", Name: "落日涂鸦", Description: "橙红板面与金色尾焰 · 永久拥有", Price: 120, Kind: "skin", Color: "#ff7048"},
	{ID: "aurora", Name: "极光电流", Description: "蓝色电光板面与冰蓝尾焰 · 永久拥有", Price: 180, Kind: "skin", Color: "#49b9ff"},
}

func subwaySkinBit(id string) int {
	switch id {
	case "mint":
		return 1
	case "sunset":
		return 2
	case "aurora":
		return 4
	}
	return 0
}

type SubwayState struct {
	Tokens      int               `json:"tokens"`
	Best        int               `json:"best"`
	Equipped    string            `json:"equipped"`
	EarnedToday int               `json:"earned_today"`
	DailyCap    int               `json:"daily_cap"`
	Wallet      ResidentWallet    `json:"wallet"`
	Items       []SubwayItem      `json:"items"`
	Run         *models.SubwayRun `json:"run,omitempty"`
}
type SubwayResult struct {
	RunID    string  `json:"run_id"`
	Coins    int     `json:"coins"`
	Stars    int     `json:"stars"`
	Distance int     `json:"distance"`
	Elapsed  float64 `json:"elapsed"`
}
type SubwayService struct {
	db  *gorm.DB
	now func() time.Time
}

func NewSubwayService(db *gorm.DB) *SubwayService { return &SubwayService{db: db, now: time.Now} }
func (s *SubwayService) transact(uid uint, action func(*gorm.DB, *models.User, *models.SubwayWallet, *SubwayState) error) (*SubwayState, error) {
	out := &SubwayState{}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, uid).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&models.UserBuilding{}).Joins("JOIN buildings ON buildings.id = user_buildings.building_id").Where("user_buildings.user_id = ? AND buildings.name = ? AND buildings.deleted_at IS NULL", uid, "地铁站").Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return ErrTownLocked
		}
		wallet := models.SubwayWallet{}
		err := tx.First(&wallet, "user_id = ?", uid).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			wallet = models.SubwayWallet{UserID: uid, Skins: 1, Equipped: "mint"}
		} else if err != nil {
			return err
		}
		day := TodayString()
		if wallet.RewardDay != day {
			wallet.RewardDay = day
			wallet.RewardToday = 0
		}
		if action != nil {
			if err := action(tx, &user, &wallet, out); err != nil {
				return err
			}
		}
		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}
		out.Tokens = wallet.Tokens
		out.Best = wallet.Best
		out.Equipped = wallet.Equipped
		out.EarnedToday = wallet.RewardToday
		out.DailyCap = SubwayDailyCap
		out.Wallet = ResidentWallet{Coins: user.Coins, Bricks: user.Bricks}
		out.Items = append([]SubwayItem{}, subwayCatalog...)
		for i := range out.Items {
			item := &out.Items[i]
			item.Owned = item.Kind == "skin" && wallet.Skins&subwaySkinBit(item.ID) != 0
			item.Equipped = item.ID == wallet.Equipped
		}
		return nil
	})
	return out, err
}
func (s *SubwayService) Get(uid uint) (*SubwayState, error) { return s.transact(uid, nil) }
func (s *SubwayService) Start(uid uint, request string) (*SubwayState, error) {
	if !validSupplyRequestID(request) {
		return nil, ErrSubway
	}
	return s.transact(uid, func(tx *gorm.DB, u *models.User, w *models.SubwayWallet, out *SubwayState) error {
		var existing models.SubwayRun
		err := tx.Where("user_id = ? AND request_id = ?", uid, request).First(&existing).Error
		if err == nil {
			if existing.Status != "active" {
				return ErrSubway
			}
			out.Run = &existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		buf := make([]byte, 16)
		if _, err := rand.Read(buf); err != nil {
			return err
		}
		if err := tx.Model(&models.SubwayRun{}).Where("user_id = ? AND status = ?", uid, "active").Update("status", "abandoned").Error; err != nil {
			return err
		}
		run := models.SubwayRun{ID: hex.EncodeToString(buf), UserID: uid, RequestID: request, CreatedAt: s.now(), Status: "active"}
		out.Run = &run
		return tx.Create(&run).Error
	})
}
func validSubwayResult(r SubwayResult, age time.Duration) bool {
	return !math.IsNaN(r.Elapsed) && !math.IsInf(r.Elapsed, 0) && r.Elapsed >= 0 && r.Elapsed <= 3600 && age >= 0 && age <= 90*time.Minute && r.Elapsed <= age.Seconds()+3 && r.Distance >= 0 && r.Distance <= int(r.Elapsed*32)+4 && r.Coins >= 0 && r.Coins <= r.Distance/3 && r.Stars >= 0 && r.Stars <= r.Distance/30
}
func (s *SubwayService) Finish(uid uint, result SubwayResult) (*SubwayState, error) {
	return s.transact(uid, func(tx *gorm.DB, u *models.User, w *models.SubwayWallet, out *SubwayState) error {
		var run models.SubwayRun
		if err := tx.Where("id = ? AND user_id = ?", result.RunID, uid).First(&run).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrSubway
			}
			return err
		}
		if run.Status == "finished" {
			out.Run = &run
			return nil
		}
		if run.Status != "active" || !validSubwayResult(result, s.now().Sub(run.CreatedAt)) {
			return ErrSubwayResult
		}
		run.Coins = result.Coins
		run.Stars = result.Stars
		run.Distance = result.Distance
		run.Elapsed = result.Elapsed
		run.Status = "finished"
		run.Awarded = min(500, result.Coins+result.Stars*5, max(0, SubwayDailyCap-w.RewardToday))
		w.Tokens += run.Awarded
		w.RewardToday += run.Awarded
		w.Best = max(w.Best, result.Distance+result.Coins*5+result.Stars*50)
		out.Run = &run
		return tx.Save(&run).Error
	})
}
func (s *SubwayService) Purchase(uid uint, itemID, request string) (*SubwayState, error) {
	if !validSupplyRequestID(request) {
		return nil, ErrSubway
	}
	return s.transact(uid, func(tx *gorm.DB, u *models.User, w *models.SubwayWallet, out *SubwayState) error {
		var receipt models.SubwayPurchase
		err := tx.Where("user_id = ? AND request_id = ?", uid, request).First(&receipt).Error
		if err == nil {
			if receipt.ItemID != itemID {
				return ErrSubway
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var selected *SubwayItem
		for i := range subwayCatalog {
			if subwayCatalog[i].ID == itemID {
				selected = &subwayCatalog[i]
				break
			}
		}
		if selected == nil {
			return ErrSubway
		}
		price := selected.Price
		if selected.Kind == "skin" && w.Skins&subwaySkinBit(itemID) != 0 {
			price = 0
		}
		if w.Tokens < price {
			return ErrSubwayBalance
		}
		w.Tokens -= price
		switch itemID {
		case "coins":
			u.Coins += 10
		case "bricks":
			u.Bricks++
		default:
			w.Skins |= subwaySkinBit(itemID)
			w.Equipped = itemID
		}
		if err := tx.Model(u).Updates(map[string]interface{}{"coins": u.Coins, "bricks": u.Bricks}).Error; err != nil {
			return err
		}
		return tx.Create(&models.SubwayPurchase{UserID: uid, RequestID: request, ItemID: itemID}).Error
	})
}
func (s *SubwayService) Equip(uid uint, item string) (*SubwayState, error) {
	return s.transact(uid, func(tx *gorm.DB, u *models.User, w *models.SubwayWallet, out *SubwayState) error {
		bit := subwaySkinBit(item)
		if bit == 0 || w.Skins&bit == 0 {
			return ErrSubway
		}
		w.Equipped = item
		return nil
	})
}
