package models

import "time"

// SchoolRound is a server receipt. Its random client ID makes a lost start response retryable.
type SchoolRound struct {
	ID        string `gorm:"primaryKey;size:32"`
	UserID    uint   `gorm:"not null;index:idx_school_round_day,priority:1"`
	Day       string `gorm:"size:10;not null;index:idx_school_round_day,priority:2"`
	Subject   string `gorm:"size:10;not null;index:idx_school_round_day,priority:3"`
	Kind      string `gorm:"size:10;not null"`
	Questions string `gorm:"type:text;not null"`
	Answers   string `gorm:"type:text;not null"`
	Completed bool
	Rewarded  bool
	Bricks    int
	Coins     int
	CreatedAt time.Time
	UpdatedAt time.Time
}

// SchoolStudy deduplicates daily questions, including the same English word in different activities.
type SchoolStudy struct {
	UserID      uint   `gorm:"primaryKey;autoIncrement:false"`
	Day         string `gorm:"primaryKey;size:10"`
	Subject     string `gorm:"primaryKey;size:10"`
	QuestionKey string `gorm:"primaryKey;size:64"`
	WordID      uint   `gorm:"index"`
	Rewarded    bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// English keeps using User.RewardBricks / DailyBonusDate for compatibility with the original classroom.
type SchoolDaily struct {
	UserID       uint   `gorm:"primaryKey;autoIncrement:false"`
	Day          string `gorm:"primaryKey;size:10"`
	Subject      string `gorm:"primaryKey;size:10"`
	Bricks       int
	BonusClaimed bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
