package models

import "time"

// Restaurant stores bounded recipes, menus and resident memories as one aggregate.
// All access is serialized with the owner's user-row lock.
type Restaurant struct {
	UserID    uint   `gorm:"primaryKey;autoIncrement:false"`
	StateJSON string `gorm:"type:longtext;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// RestaurantRequest retains mutation receipts beyond the bounded recent-service list.
// The semantic payload digest prevents a retry key from being reused for another action.
type RestaurantRequest struct {
	UserID        uint   `gorm:"primaryKey;autoIncrement:false"`
	RequestID     string `gorm:"primaryKey;size:80"`
	PayloadHash   string `gorm:"size:64;not null"`
	SavedRecipeID string `gorm:"size:40;not null"`
	ServiceJSON   string `gorm:"type:text;not null"`
	CreatedAt     time.Time
}
