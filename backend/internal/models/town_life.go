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
