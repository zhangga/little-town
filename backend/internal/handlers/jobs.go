package handlers

import (
	"context"
	"crypto/subtle"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/scheduler"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
)

func DailyPushJob(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	runner := scheduler.New(cfg, db, services.NewSubscriptionService(db, services.NewWeChatService(cfg.WechatAppID, cfg.WechatSecret), cfg.SubscribeTemplateID, cfg.SubscribePage))
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token := strings.TrimPrefix(header, "Bearer ")
		if !strings.HasPrefix(header, "Bearer ") || cfg.JobToken == "" || subtle.ConstantTimeCompare([]byte(token), []byte(cfg.JobToken)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "任务凭证无效"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer cancel()
		summary, err := runner.RunDaily(ctx)
		if err != nil || summary.Failed > 0 {
			log.Printf("外部每日任务失败: %v，失败条数=%d", err, summary.Failed)
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "任务未全部完成，请稍后检查或重试", "result": summary})
			return
		}
		c.JSON(http.StatusOK, summary)
	}
}
