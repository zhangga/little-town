package models

import (
	"time"

	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	OpenID      string `gorm:"size:100;uniqueIndex;not null" json:"open_id"`
	UnionID     string `gorm:"size:100;index" json:"union_id"`
	Nickname    string `gorm:"size:100" json:"nickname"`
	Avatar      string `gorm:"type:text" json:"avatar"`
	ParentPhone string `gorm:"size:20" json:"parent_phone"`
	Grade       int    `json:"grade"` // 年级 1-6
	Coins       int    `gorm:"default:0" json:"coins"`
	Bricks      int    `gorm:"default:0" json:"bricks"`
	Level       int    `gorm:"default:1" json:"level"`

	// 每日奖励限额追踪。
	// RewardDate 记录 RewardBricks 是哪一天的，跨天时归零重新计数。
	// 不单独建流水表：需求只是"今天还能拿多少"，两个字段足够，
	// 且避免每次答题都多一次写入。
	RewardDate   string `gorm:"type:varchar(10);index" json:"-"`
	RewardBricks int    `gorm:"default:0" json:"-"`

	// 完成当日全部单词的奖励，每天只能领一次
	DailyBonusDate string `gorm:"type:varchar(10)" json:"-"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// Word 单词模型
type Word struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Word        string         `gorm:"size:100;not null" json:"word"`
	Translation string         `gorm:"size:200;not null" json:"translation"`     // 中文释义
	Grade       int            `gorm:"not null" json:"grade"`                    // 年级
	Subject     string         `gorm:"size:20;default:'english'" json:"subject"` // 学科 english/math/chinese
	ImageURL    string         `gorm:"type:text" json:"image_url"`
	AudioURL    string         `gorm:"type:text" json:"audio_url"`
	Difficulty  int            `gorm:"default:1" json:"difficulty"` // 难度 1-5
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// Building 建筑模型
type Building struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:100;not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	ImageURL    string         `gorm:"type:text" json:"image_url"`
	Subject     string         `gorm:"size:20;default:'english'" json:"subject"`
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
	TimesRight int       `gorm:"default:0" json:"times_right"`  // 累计答对次数
	TimesWrong int       `gorm:"default:0" json:"times_wrong"`  // 累计答错次数
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

// Subscription 订阅消息额度
//
// 订阅消息的授权是「一次性」的：用户点一次同意，只能推送一条。
// 因此必须持久化剩余次数，推一条扣一次，扣完就不能再推，
// 必须等用户下次主动订阅。
//
// 这个表存在的原因：如果只靠前端记「已订阅」，
// 会出现「用户以为订阅了但推不出来」和「重复推浪费额度」两种问题。
type Subscription struct {
	ID     uint `gorm:"primaryKey" json:"id"`
	UserID uint `gorm:"not null;uniqueIndex" json:"user_id"`

	// Quota 剩余可推送次数。每次用户同意订阅 +1，每次成功推送 -1。
	Quota int `gorm:"default:0" json:"quota"`

	// LastRequestAt 最近一次向用户请求订阅的时间。
	// 用于避免过于频繁地弹窗打扰用户。
	LastRequestAt *time.Time `json:"last_request_at"`

	// LastGrantedAt 最近一次用户同意订阅的时间
	LastGrantedAt *time.Time `json:"last_granted_at"`

	// LastPushedAt 最近一次成功推送的时间。
	// 用于控制推送频率——每天最多一条，避免打扰。
	LastPushedAt *time.Time `json:"last_pushed_at"`

	// TotalPushed 累计成功推送数，用于观察召回效果
	TotalPushed int `gorm:"default:0" json:"total_pushed"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
