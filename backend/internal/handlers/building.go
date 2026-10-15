package handlers

import (
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
		IsBuilt    bool `json:"is_built"`
		CanBuild   bool `json:"can_build"`
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
			"coins":         user.Coins,
			"bricks":        user.Bricks,
			"level":         user.Level,
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 获取建筑信息
	var building models.Building
	if err := h.db.First(&building, req.BuildingID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "building not found"})
		return
	}

	// 检查是否已建造
	var existing models.UserBuilding
	if err := h.db.Where("user_id = ? AND building_id = ?", userID, req.BuildingID).First(&existing).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "building already exists"})
		return
	}

	// 获取用户信息
	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// 检查砖块是否足够
	if user.Bricks < building.CostBricks {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":         "not enough bricks",
			"required":      building.CostBricks,
			"current":       user.Bricks,
		})
		return
	}

	// 计算建筑位置（简单布局：按已建造数量依次排列）
	var builtCount int64
	h.db.Model(&models.UserBuilding{}).Where("user_id = ?", userID).Count(&builtCount)

	// 网格布局：4 列
	col := int(builtCount) % 4
	row := int(builtCount) / 4
	posX := 60 + col*180
	posY := 60 + row*200

	// 扣减砖块，创建建筑记录
	tx := h.db.Begin()

	user.Bricks -= building.CostBricks
	if err := tx.Save(&user).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to deduct bricks"})
		return
	}

	userBuilding := models.UserBuilding{
		UserID:     userID,
		BuildingID: building.ID,
		PositionX:  posX,
		PositionY:  posY,
		BuiltAt:    timeNow(),
	}
	if err := tx.Create(&userBuilding).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build"})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{
		"message":      "building constructed",
		"building":     building,
		"remaining_bricks": user.Bricks,
	})
}
