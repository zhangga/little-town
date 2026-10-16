package handlers

import (
	"errors"
	"gorm.io/gorm/clause"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

type BuildingHandler struct {
	db *gorm.DB
}

func NewBuildingHandler(db *gorm.DB) *BuildingHandler {
	return &BuildingHandler{db: db}
}

// ListBuildings 获取所有可建造的建筑列表
func (h *BuildingHandler) ListBuildings(c *gin.Context) {
	userID := getCurrentUserID(c)

	// 获取用户信息（用于判断解锁等级）
	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// 获取用户已建造的建筑 ID
	var builtIDs []uint
	h.db.Model(&models.UserBuilding{}).
		Where("user_id = ?", userID).
		Pluck("building_id", &builtIDs)

	// 获取所有建筑
	var buildings []models.Building
	if err := h.db.Order("unlock_level ASC, id ASC").Find(&buildings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get buildings"})
		return
	}

	// 标记每个建筑的状态
	type BuildingItem struct {
		models.Building
		IsBuilt  bool `json:"is_built"`
		CanBuild bool `json:"can_build"`
	}

	builtMap := make(map[uint]bool)
	for _, id := range builtIDs {
		builtMap[id] = true
	}

	items := make([]BuildingItem, 0, len(buildings))
	for _, b := range buildings {
		isBuilt := builtMap[b.ID]
		canBuild := !isBuilt && user.Bricks >= b.CostBricks

		items = append(items, BuildingItem{
			Building: b,
			IsBuilt:  isBuilt,
			CanBuild: canBuild,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"buildings": items,
		"user": gin.H{
			"bricks": user.Bricks,
			"coins":  user.Coins,
			"level":  user.Level,
		},
	})
}

// GetMyTown 获取我的小镇（已建造的建筑）
func (h *BuildingHandler) GetMyTown(c *gin.Context) {
	userID := getCurrentUserID(c)

	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var userBuildings []models.UserBuilding
	if err := h.db.
		Preload("Building").
		Where("user_id = ?", userID).
		Order("built_at ASC").
		Find(&userBuildings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get town"})
		return
	}

	// 组装返回数据
	type TownBuilding struct {
		ID          uint   `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		ImageURL    string `json:"image_url"`
		PositionX   int    `json:"position_x"`
		PositionY   int    `json:"position_y"`
		WordCount   int    `json:"word_count"`
		BuiltAt     string `json:"built_at"`
	}

	townBuildings := make([]TownBuilding, 0, len(userBuildings))
	for _, ub := range userBuildings {
		townBuildings = append(townBuildings, TownBuilding{
			ID:          ub.ID,
			Name:        ub.Building.Name,
			Description: ub.Building.Description,
			ImageURL:    ub.Building.ImageURL,
			PositionX:   ub.PositionX,
			PositionY:   ub.PositionY,
			WordCount:   ub.WordCount,
			BuiltAt:     ub.BuiltAt.Format("2006-01-02 15:04:05"),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"town_data": gin.H{
			"coins":           user.Coins,
			"bricks":          user.Bricks,
			"level":           user.Level,
			"total_buildings": len(townBuildings),
		},
		"buildings": townBuildings,
	})
}

type BuildBuildingRequest struct {
	BuildingID uint `json:"building_id" binding:"required"`
}

// BuildBuilding 建造建筑
func (h *BuildingHandler) BuildBuilding(c *gin.Context) {
	userID := getCurrentUserID(c)
	var req BuildBuildingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择建筑"})
		return
	}
	var building models.Building
	if err := h.db.First(&building, req.BuildingID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "building not found"})
		return
	}
	duplicate := errors.New("building already exists")
	insufficient := errors.New("not enough bricks")
	remaining := 0
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&models.UserBuilding{}).Where("user_id = ? AND building_id = ?", userID, req.BuildingID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return duplicate
		}
		if building.CostBricks < 0 || user.Bricks < building.CostBricks {
			return insufficient
		}
		var builtCount int64
		if err := tx.Model(&models.UserBuilding{}).Where("user_id = ?", userID).Count(&builtCount).Error; err != nil {
			return err
		}
		remaining = user.Bricks - building.CostBricks
		if err := tx.Model(&user).Update("bricks", remaining).Error; err != nil {
			return err
		}
		return tx.Create(&models.UserBuilding{UserID: userID, BuildingID: building.ID, PositionX: 60 + int(builtCount)%4*180, PositionY: 60 + int(builtCount)/4*200, BuiltAt: timeNow()}).Error
	})
	if err != nil {
		if errors.Is(err, duplicate) || errors.Is(err, insufficient) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		_ = c.Error(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "building constructed", "building": building, "remaining_bricks": remaining})
}
