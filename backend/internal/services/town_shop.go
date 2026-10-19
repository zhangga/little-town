package services

import (
	"errors"
	"regexp"
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

var (
	ErrTownSupply        = errors.New("请选择店里出售的补给")
	ErrTownSupplyRequest = errors.New("这次购买信息已变化，请重新选择")
	ErrTownFull          = errors.New("现在已经补充好啦，等需要时再来吧")
	supplyRequestPattern = regexp.MustCompile(`^[A-Za-z0-9-]{16,80}$`)
)

type TownNeedsView struct {
	Enabled bool `json:"enabled"`
	Food    int  `json:"food"`
	Water   int  `json:"water"`
}

type TownSupplyView struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	Building  string `json:"building"`
	Price     int    `json:"price"`
	Food      int    `json:"food"`
	Water     int    `json:"water"`
	Available bool   `json:"available"`
}

var townSupplies = []TownSupplyView{
	{ID: "bread", Name: "新鲜面包", Icon: "🥖", Building: "商店", Price: 2, Food: 40},
	{ID: "water", Name: "清凉饮用水", Icon: "💧", Building: "商店", Price: 1, Water: 50},
	{ID: "meal", Name: "热乎乎的套餐", Icon: "🍲", Building: "餐厅", Price: 3, Food: 60, Water: 30},
}

func validSupplyRequestID(id string) bool { return supplyRequestPattern.MatchString(id) }

func advanceTownNeeds(needs *models.TownNeeds, now time.Time) {
	minutes := int(now.Sub(needs.CheckedAt) / time.Minute)
	if minutes <= 0 {
		return
	}
	needs.Food = max(20, needs.Food-minutes)
	needs.Water = max(20, needs.Water-minutes*2)
	needs.CheckedAt = needs.CheckedAt.Add(time.Duration(minutes) * time.Minute)
}

func loadTownNeeds(tx *gorm.DB, userID uint, owned *townOwnership, now time.Time) (*models.TownNeeds, error) {
	if !owned.buildingMap["商店"] && !owned.buildingMap["餐厅"] {
		return nil, nil
	}
	var needs models.TownNeeds
	err := tx.First(&needs, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		needs = models.TownNeeds{UserID: userID, Food: 70, Water: 70, CheckedAt: now}
		return &needs, tx.Create(&needs).Error
	}
	if err != nil {
		return nil, err
	}
	before := needs.CheckedAt
	advanceTownNeeds(&needs, now)
	if !needs.CheckedAt.Equal(before) {
		err = tx.Save(&needs).Error
	}
	return &needs, err
}

func townSuppliesView(owned *townOwnership) []TownSupplyView {
	items := append([]TownSupplyView{}, townSupplies...)
	for i := range items {
		items[i].Available = owned.buildingMap[items[i].Building]
	}
	return items
}

func (s *TownLifeService) PurchaseSupply(userID uint, itemID, requestID string) (*TownLifeState, error) {
	if !validSupplyRequestID(requestID) {
		return nil, ErrTownSupplyRequest
	}
	return s.transact(userID, false, func(tx *gorm.DB, user *models.User, owned *townOwnership) error {
		var previous models.TownSupplyPurchase
		err := tx.Where("user_id = ? AND request_id = ?", userID, requestID).First(&previous).Error
		if err == nil {
			if previous.ItemID != itemID {
				return ErrTownSupplyRequest
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var item *TownSupplyView
		for i := range townSupplies {
			if townSupplies[i].ID == itemID {
				item = &townSupplies[i]
				break
			}
		}
		if item == nil {
			return ErrTownSupply
		}
		if !owned.buildingMap[item.Building] {
			return ErrTownLocked
		}
		needs, err := loadTownNeeds(tx, userID, owned, time.Now())
		if err != nil {
			return err
		}
		if (item.Food == 0 || needs.Food >= 100) && (item.Water == 0 || needs.Water >= 100) {
			return ErrTownFull
		}
		if user.Coins < item.Price {
			return ErrTownCoins
		}
		needs.Food = min(100, needs.Food+item.Food)
		needs.Water = min(100, needs.Water+item.Water)
		if err := tx.Save(needs).Error; err != nil {
			return err
		}
		user.Coins -= item.Price
		if err := tx.Model(user).Update("coins", user.Coins).Error; err != nil {
			return err
		}
		return tx.Create(&models.TownSupplyPurchase{UserID: userID, RequestID: requestID, ItemID: itemID}).Error
	})
}
