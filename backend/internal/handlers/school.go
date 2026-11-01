package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/services"
)

func (h *LearnHandler) schoolService() *services.SchoolService {
	return services.NewSchoolService(h.db, h.cfg.DailyWordCount)
}
func schoolError(c *gin.Context, err error) {
	if errors.Is(err, services.ErrSchoolExpired) {
		c.JSON(http.StatusGone, gin.H{"error": err.Error()})
		return
	}
	if errors.Is(err, services.ErrSchoolRound) || errors.Is(err, services.ErrSchoolIncomplete) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = c.Error(err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "学习奖励暂未确认，请稍后重试"})
}
func (h *LearnHandler) SchoolRewards(c *gin.Context) {
	status, err := h.schoolService().Status(getCurrentUserID(c))
	if err != nil {
		schoolError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"subjects": status})
}
func (h *LearnHandler) StartSchoolRound(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 100*1024)
	var req services.SchoolStart
	if err := c.ShouldBindJSON(&req); err != nil {
		schoolError(c, services.ErrSchoolRound)
		return
	}
	result, err := h.schoolService().Start(getCurrentUserID(c), req)
	if err != nil {
		schoolError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
func (h *LearnHandler) SchoolAnswer(c *gin.Context) {
	var req struct {
		RoundID string `json:"round_id"`
		Index   *int   `json:"index"`
		Correct *bool  `json:"correct"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Index == nil || req.Correct == nil {
		schoolError(c, services.ErrSchoolRound)
		return
	}
	result, err := h.schoolService().Answer(getCurrentUserID(c), req.RoundID, *req.Index, *req.Correct)
	if err != nil {
		schoolError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
func (h *LearnHandler) CompleteSchoolRound(c *gin.Context) {
	var req struct {
		RoundID string `json:"round_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		schoolError(c, services.ErrSchoolRound)
		return
	}
	result, err := h.schoolService().Complete(getCurrentUserID(c), req.RoundID)
	if err != nil {
		schoolError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
