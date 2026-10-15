package models

import (
	"time"
	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	OpenID      string         `gorm:"uniqueIndex;not null" json:"open_id"`
	UnionID     string         `gorm:"index" json:"union_id"`
	Nickname    string         `json:"nickname"`
	Avatar      string         `json:"avatar"`
	ParentPhone string         `json:"parent_phone"`
	Grade       int            `json:"grade"` // 年级 1-6
	Coins       int            `gorm:"default:0" json:"coins"`
	Bricks      int            `gorm:"default:0" json:"bricks"`
	Level       int            `gorm:"default:1" json:"level"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// Word 单词模型
type Word struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Word        string         `gorm:"not null" json:"word"`
	Translation string         `gorm:"not null" json:"translation"` // 中文释义
	Grade       int            `gorm:"not null" json:"grade"`       // 年级
	Subject     string         `gorm:"default:'english'" json:"subject"` // 学科 english/math/chinese
	ImageURL    string         `json:"image_url"`
	AudioURL    string         `json:"audio_url"`
	Difficulty  int            `gorm:"default:1" json:"difficulty"` // 难度 1-5
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// Building 建筑模型
type Building struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"not null" json:"name"`
	Description string         `json:"description"`
	ImageURL    string         `json:"image_url"`
	Subject     string         `gorm:"default:'english'" json:"subject"`
	CostBricks  int            `gorm:"default:10" json:"cost_bricks"` // 建造成本
	UnlockLevel int            `gorm:"default:1" json:"unlock_level"` // 解锁等级
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// UserBuilding 用户建筑（已建造）
type UserBuilding struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"not null;index" json:"user_id"`
	BuildingID uint      `gorm:"not null" json:"building_id"`
	PositionX  int       `gorm:"default:0" json:"position_x"` // 地图位置 X
	PositionY  int       `gorm:"default:0" json:"position_y"` // 地图位置 Y
	WordCount  int       `gorm:"default:0" json:"word_count"` // 通过该建筑学习的单词数
	BuiltAt    time.Time `json:"built_at"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`

	Building Building `gorm:"foreignKey:BuildingID" json:"building,omitempty"`
}

// LearningRecord 学习记录
type LearningRecord struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"not null;index" json:"user_id"`
	WordID     uint      `gorm:"not null;index" json:"word_id"`
	IsCorrect  bool      `json:"is_correct"`
	TimesRight int       `gorm:"default:0" json:"times_right"` // 累计答对次数
	TimesWrong int       `gorm:"default:0" json:"times_wrong"` // 累计答错次数
	Mastered   bool      `gorm:"default:false" json:"mastered"` // 是否已掌握
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`

	Word Word `gorm:"foreignKey:WordID" json:"word,omitempty"`
}

// ReviewSchedule 复习计划（艾宾浩斯）
type ReviewSchedule struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"not null;index" json:"user_id"`
	WordID         uint      `gorm:"not null" json:"word_id"`
	ReviewLevel    int       `gorm:"default:0" json:"review_level"` // 复习级别 0-4
	NextReviewAt   time.Time `gorm:"index" json:"next_review_at"`
	LastReviewedAt time.Time `json:"last_reviewed_at"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`

	Word Word `gorm:"foreignKey:WordID" json:"word,omitempty"`
}
