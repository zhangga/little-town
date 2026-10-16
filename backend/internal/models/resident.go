package models

import "time"

// Resident 是游戏化身，与微信头像和账号昵称分开保存。
type Resident struct {
	UserID       uint      `gorm:"primaryKey;autoIncrement:false" json:"-"`
	Name         string    `gorm:"size:48;not null" json:"name"`
	Experience   int       `gorm:"default:0" json:"experience"`
	OutfitID     string    `gorm:"size:32;not null" json:"outfit_id"`
	DecorationID string    `gorm:"size:32;not null" json:"decoration_id"`
	HomeLevel    int       `gorm:"default:1" json:"home_level"`
	XPBonusDate  string    `gorm:"size:10" json:"-"`
	CreatedAt    time.Time `json:"-"`
	UpdatedAt    time.Time `json:"-"`
}

type ResidentItem struct {
	UserID    uint   `gorm:"primaryKey;autoIncrement:false"`
	ItemID    string `gorm:"primaryKey;size:32"`
	CreatedAt time.Time
}

// ResidentStudy 用同一用户、日期、单词的唯一键记录当天学习，兼容新词和复习。
type ResidentStudy struct {
	UserID    uint   `gorm:"primaryKey;autoIncrement:false"`
	Day       string `gorm:"primaryKey;size:10"`
	WordID    uint   `gorm:"primaryKey;autoIncrement:false"`
	IsReview  bool
	Rewarded  bool
	CreatedAt time.Time
	UpdatedAt time.Time
}
