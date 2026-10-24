package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
)

type RestaurantHandler struct{ service *services.RestaurantService }

func NewRestaurantHandler(db *gorm.DB) *RestaurantHandler {
	return &RestaurantHandler{service: services.NewRestaurantService(db)}
}
func restaurantResponse(c *gin.Context, state *services.RestaurantState, err error) {
	if err == nil {
		c.JSON(http.StatusOK, state)
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	for _, expected := range []error{services.ErrRestaurantLocked, services.ErrRestaurantDish, services.ErrRestaurantRecipe, services.ErrRestaurantLimit, services.ErrRestaurantMenu, services.ErrRestaurantOrder, services.ErrRestaurantComposition, services.ErrRestaurantRequest} {
		if errors.Is(err, expected) {
			c.JSON(http.StatusBadRequest, gin.H{"error": expected.Error()})
			return
		}
	}
	_ = c.Error(err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "餐厅暂时没连上，请稍后重试"})
}
func (h *RestaurantHandler) Get(c *gin.Context) {
	state, err := h.service.Get(getCurrentUserID(c))
	restaurantResponse(c, state, err)
}
func (h *RestaurantHandler) SaveRecipe(c *gin.Context) {
	var req services.SaveRestaurantRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请检查便当和食谱信息"})
		return
	}
	state, err := h.service.SaveRecipe(getCurrentUserID(c), req)
	restaurantResponse(c, state, err)
}
func (h *RestaurantHandler) SetSignatures(c *gin.Context) {
	var req services.SetRestaurantSignaturesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择招牌菜"})
		return
	}
	state, err := h.service.SetSignatures(getCurrentUserID(c), req)
	restaurantResponse(c, state, err)
}
func (h *RestaurantHandler) Serve(c *gin.Context) {
	var req services.ServeRestaurantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择居民和要端出的便当"})
		return
	}
	state, err := h.service.Serve(getCurrentUserID(c), req)
	restaurantResponse(c, state, err)
}
