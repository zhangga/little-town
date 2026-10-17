package models

import "time"

// PracticeRound 只记录自由复习进度和整轮奖励，不参与间隔复习或成长计数。
type PracticeRound struct {
	ID            string `gorm:"primaryKey;size:32"`
	UserID        uint   `gorm:"not null;index:idx_practice_day,priority:1"`
	Day           string `gorm:"size:10;not null;index:idx_practice_day,priority:2"`
	AnsweredWords string `gorm:"type:text;not null"`
	Completed     bool
	Rewarded      bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
