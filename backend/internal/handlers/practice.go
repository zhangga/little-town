package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/services"
)

func (h *LearnHandler) practiceService() *services.PracticeService {
	return services.NewPracticeService(h.db, h.cfg.JWTSecret)
}

func practiceError(c *gin.Context, err error) {
	if errors.Is(err, services.ErrPracticeTicket) || errors.Is(err, services.ErrPracticeIncomplete) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = c.Error(err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "复习成果暂未保存，请稍后重试"})
}

func (h *LearnHandler) SubmitPracticeAnswer(c *gin.Context) {
	var req struct {
		Token  string `json:"practice_token" binding:"required"`
		WordID uint   `json:"word_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "本轮复习信息不完整，请重新开始"})
		return
	}
	if err := h.practiceService().Answer(getCurrentUserID(c), req.Token, req.WordID); err != nil {
		practiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"saved": true})
}

func (h *LearnHandler) CompletePractice(c *gin.Context) {
	var req struct {
		Token string `json:"practice_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "本轮复习信息不完整，请重新开始"})
		return
	}
	result, err := h.practiceService().Complete(getCurrentUserID(c), req.Token)
	if err != nil {
		practiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
