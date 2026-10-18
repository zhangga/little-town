package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func readTownLayout(db *gorm.DB, user models.User, buildings []models.UserBuilding) (services.TownLayout, error) {
	var catalogCount int64
	if err := db.Model(&models.Building{}).Count(&catalogCount).Error; err != nil {
		return services.TownLayout{}, err
	}
	return services.NormalizeTownLayout(buildings, services.TownPosition{X: user.TownHomeX, Y: user.TownHomeY}, int(catalogCount)), nil
}

type SaveTownLayoutRequest struct {
	Home      *services.TownPosition   `json:"home" binding:"required"`
	Buildings []services.TownPlacement `json:"buildings"`
}

// SaveLayout 免费保存整张布局。与建造共用用户行锁，互换位置可原子提交。
func (h *BuildingHandler) SaveLayout(c *gin.Context) {
	var request SaveTownLayoutRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提交完整的小镇布局"})
		return
	}
	userID := getCurrentUserID(c)
	var result services.TownLayout
	var invalid error
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		var owned []models.UserBuilding
		if err := tx.Where("user_id = ?", userID).Order("built_at ASC, id ASC").Find(&owned).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&models.Building{}).Count(&count).Error; err != nil {
			return err
		}
		if invalid = services.ValidateTownLayout(*request.Home, request.Buildings, owned, int(count)); invalid != nil {
			return invalid
		}
		// 仅更新位置，绝不更新金币、砖块或任何成长字段。
		if err := tx.Model(&user).Updates(map[string]interface{}{"town_home_x": request.Home.X, "town_home_y": request.Home.Y}).Error; err != nil {
			return err
		}
		for _, position := range request.Buildings {
			if err := tx.Model(&models.UserBuilding{}).Where("id = ? AND user_id = ?", position.ID, userID).
				Updates(map[string]interface{}{"position_x": position.X, "position_y": position.Y}).Error; err != nil {
				return err
			}
		}
		result = services.TownLayout{Columns: services.TownColumns, Rows: services.TownLayoutRows(int(count), len(owned)), Home: *request.Home, Buildings: request.Buildings}
		return nil
	})
	if err != nil {
		if invalid != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": invalid.Error()})
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "小镇不存在"})
		} else {
			_ = c.Error(err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "摆放位置暂未保存，请重试"})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"layout": result, "coins_spent": 0, "bricks_spent": 0})
}
