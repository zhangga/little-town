package handlers

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
	"net/http"
)

type SubwayHandler struct{ service *services.SubwayService }

func NewSubwayHandler(db *gorm.DB) *SubwayHandler {
	return &SubwayHandler{services.NewSubwayService(db)}
}
func subwayResponse(c *gin.Context, state *services.SubwayState, err error) {
	if err == nil {
		c.JSON(http.StatusOK, state)
		return
	}
	for _, e := range []error{services.ErrSubway, services.ErrSubwayResult, services.ErrSubwayBalance, services.ErrTownLocked} {
		if errors.Is(err, e) {
			c.JSON(400, gin.H{"error": e.Error()})
			return
		}
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	_ = c.Error(err)
	c.JSON(500, gin.H{"error": "星光币商店暂时没连上，请重试"})
}
func (h *SubwayHandler) Get(c *gin.Context) {
	s, e := h.service.Get(getCurrentUserID(c))
	subwayResponse(c, s, e)
}
func (h *SubwayHandler) Start(c *gin.Context) {
	var r struct {
		RequestID string `json:"request_id" binding:"required"`
	}
	if c.ShouldBindJSON(&r) != nil {
		c.JSON(400, gin.H{"error": "出发请求不完整"})
		return
	}
	s, e := h.service.Start(getCurrentUserID(c), r.RequestID)
	subwayResponse(c, s, e)
}
func (h *SubwayHandler) Finish(c *gin.Context) {
	var r services.SubwayResult
	if c.ShouldBindJSON(&r) != nil || r.RunID == "" {
		c.JSON(400, gin.H{"error": "跑酷结果不完整"})
		return
	}
	s, e := h.service.Finish(getCurrentUserID(c), r)
	subwayResponse(c, s, e)
}
func (h *SubwayHandler) Purchase(c *gin.Context) {
	var r struct {
		ItemID    string `json:"item_id" binding:"required"`
		RequestID string `json:"request_id" binding:"required"`
	}
	if c.ShouldBindJSON(&r) != nil {
		c.JSON(400, gin.H{"error": "请选择商品"})
		return
	}
	s, e := h.service.Purchase(getCurrentUserID(c), r.ItemID, r.RequestID)
	subwayResponse(c, s, e)
}
func (h *SubwayHandler) Equip(c *gin.Context) {
	var r struct {
		ItemID string `json:"item_id" binding:"required"`
	}
	if c.ShouldBindJSON(&r) != nil {
		c.JSON(400, gin.H{"error": "请选择滑板"})
		return
	}
	s, e := h.service.Equip(getCurrentUserID(c), r.ItemID)
	subwayResponse(c, s, e)
}
