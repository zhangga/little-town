package handlers

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
	"net/http"
)

type ResidentHandler struct{ service *services.ResidentService }

func NewResidentHandler(db *gorm.DB, cfg *config.Config) *ResidentHandler {
	return &ResidentHandler{service: services.NewResidentService(db, cfg.DailyWordCount)}
}
func residentResponse(c *gin.Context, state *services.ResidentState, err error) {
	if err == nil {
		c.JSON(http.StatusOK, state)
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	for _, expected := range []error{services.ErrResidentName, services.ErrResidentItem, services.ErrResidentCoins, services.ErrResidentOwned, services.ErrResidentBricks, services.ErrResidentHome, services.ErrResidentMaxHome} {
		if errors.Is(err, expected) {
			c.JSON(http.StatusBadRequest, gin.H{"error": expected.Error()})
			return
		}
	}
	_ = c.Error(err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "小镇暂时没能保存，请稍后重试"})
}
func (h *ResidentHandler) Get(c *gin.Context) {
	state, err := h.service.Get(getCurrentUserID(c))
	residentResponse(c, state, err)
}
func (h *ResidentHandler) Rename(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入角色名字"})
		return
	}
	state, err := h.service.Rename(getCurrentUserID(c), req.Name)
	residentResponse(c, state, err)
}
func (h *ResidentHandler) Purchase(c *gin.Context) {
	var req struct {
		ItemID string `json:"item_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择一件物品"})
		return
	}
	state, err := h.service.Purchase(getCurrentUserID(c), req.ItemID)
	residentResponse(c, state, err)
}
func (h *ResidentHandler) Equip(c *gin.Context) {
	var req struct {
		ItemID string `json:"item_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择一件物品"})
		return
	}
	state, err := h.service.Equip(getCurrentUserID(c), req.ItemID)
	residentResponse(c, state, err)
}
func (h *ResidentHandler) UpgradeHome(c *gin.Context) {
	var req struct {
		ExpectedLevel int `json:"expected_level" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请刷新小屋后再试"})
		return
	}
	state, err := h.service.UpgradeHome(getCurrentUserID(c), req.ExpectedLevel)
	residentResponse(c, state, err)
}
