package models

import "time"

// SubwayWallet is independent of the town wallet until an explicit exchange.
type SubwayWallet struct {
	UserID      uint   `gorm:"primaryKey" json:"-"`
	Tokens      int    `json:"tokens"`
	Best        int    `json:"best"`
	Skins       int    `json:"-"`
	Equipped    string `gorm:"size:20" json:"equipped"`
	RewardDay   string `gorm:"size:10" json:"-"`
	RewardToday int    `json:"earned_today"`
}
type SubwayRun struct {
	ID        string    `gorm:"size:40;primaryKey" json:"run_id"`
	UserID    uint      `gorm:"index;uniqueIndex:subway_start" json:"-"`
	RequestID string    `gorm:"size:80;uniqueIndex:subway_start" json:"-"`
	CreatedAt time.Time `json:"-"`
	Status    string    `gorm:"size:20;index" json:"status"`
	Coins     int       `json:"coins"`
	Stars     int       `json:"stars"`
	Distance  int       `json:"distance"`
	Elapsed   float64   `json:"elapsed"`
	Awarded   int       `json:"awarded"`
}
type SubwayPurchase struct {
	ID        uint   `gorm:"primaryKey"`
	UserID    uint   `gorm:"uniqueIndex:subway_purchase"`
	RequestID string `gorm:"size:80;uniqueIndex:subway_purchase"`
	ItemID    string `gorm:"size:30"`
	CreatedAt time.Time
}
