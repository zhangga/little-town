package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
)

type TownLifeHandler struct{ service *services.TownLifeService }

func NewTownLifeHandler(db *gorm.DB) *TownLifeHandler {
	return &TownLifeHandler{service: services.NewTownLifeService(db)}
}
func townLifeResponse(c *gin.Context, state *services.TownLifeState, err error) {
	if err == nil {
		c.JSON(http.StatusOK, state)
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	for _, expected := range []error{services.ErrTownPet, services.ErrTownCoins, services.ErrTownEvent, services.ErrTownLocked, services.ErrTownSupply, services.ErrTownSupplyRequest, services.ErrTownFull, services.ErrTownActivity, services.ErrTownActivityRequest} {
		if errors.Is(err, expected) {
			c.JSON(http.StatusBadRequest, gin.H{"error": expected.Error()})
			return
		}
	}
	_ = c.Error(err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "小镇生活暂时没连上，请稍后重试"})
}
func (h *TownLifeHandler) Get(c *gin.Context) {
	state, err := h.service.Get(getCurrentUserID(c))
	townLifeResponse(c, state, err)
}
func (h *TownLifeHandler) PurchasePet(c *gin.Context) {
	var req struct {
		PetID string `json:"pet_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择宠物伙伴"})
		return
	}
	state, err := h.service.PurchasePet(getCurrentUserID(c), req.PetID)
	townLifeResponse(c, state, err)
}
func (h *TownLifeHandler) Resolve(c *gin.Context) {
	var req struct {
		EventID uint `json:"event_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择一件小镇事情"})
		return
	}
	state, err := h.service.Resolve(getCurrentUserID(c), req.EventID)
	townLifeResponse(c, state, err)
}

func (h *TownLifeHandler) PurchaseSupply(c *gin.Context) {
	var req struct {
		ItemID    string `json:"item_id" binding:"required"`
		RequestID string `json:"request_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择补给并重新购买"})
		return
	}
	state, err := h.service.PurchaseSupply(getCurrentUserID(c), req.ItemID, req.RequestID)
	townLifeResponse(c, state, err)
}

func (h *TownLifeHandler) StartActivity(c *gin.Context) {
	var req struct {
		ActivityID string `json:"activity_id" binding:"required"`
		RequestID  string `json:"request_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择建筑体验并重新购票"})
		return
	}
	state, err := h.service.StartActivity(getCurrentUserID(c), req.ActivityID, req.RequestID)
	townLifeResponse(c, state, err)
}
