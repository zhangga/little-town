package models

import "time"

// TownPet 的复合主键让同一伙伴永久拥有且只能购买一次。
type TownPet struct {
	UserID    uint   `gorm:"primaryKey;autoIncrement:false"`
	PetID     string `gorm:"primaryKey;size:32"`
	CreatedAt time.Time
}

// TownEvent 保存待办和结局；重进小程序或重复呼叫不会重新扣款。
type TownEvent struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	UserID     uint       `gorm:"not null;index:idx_town_event_user,priority:1" json:"-"`
	Kind       string     `gorm:"size:32;not null" json:"kind"`
	ResolvedAt *time.Time `json:"resolved_at"`
	CreatedAt  time.Time  `gorm:"index:idx_town_event_user,priority:2" json:"created_at"`
}

// TownNeeds 只在有补给建筑后启用；CheckedAt 保留不足一分钟的时间。
type TownNeeds struct {
	UserID    uint      `gorm:"primaryKey;autoIncrement:false"`
	Food      int       `gorm:"not null"`
	Water     int       `gorm:"not null"`
	CheckedAt time.Time `gorm:"not null"`
}

// 同一账号同一请求只能消费一次，允许主动购买多份补给。
type TownSupplyPurchase struct {
	UserID    uint   `gorm:"primaryKey;autoIncrement:false"`
	RequestID string `gorm:"primaryKey;size:80"`
	ItemID    string `gorm:"size:32;not null"`
	CreatedAt time.Time
}

// TownActivityVisit 是已付费入场凭据；保存购买时的内容和价格，重试只返回原凭据。
type TownActivityVisit struct {
	ID         uint   `gorm:"primaryKey"`
	UserID     uint   `gorm:"not null;uniqueIndex:idx_town_activity_request,priority:1;index"`
	RequestID  string `gorm:"size:80;not null;uniqueIndex:idx_town_activity_request,priority:2"`
	ActivityID string `gorm:"size:32;not null"`
	Name       string `gorm:"size:80;not null"`
	Building   string `gorm:"size:40;not null"`
	Icon       string `gorm:"size:16;not null"`
	Price      int    `gorm:"not null"`
	CreatedAt  time.Time
}
