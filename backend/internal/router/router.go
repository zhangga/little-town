package router

import (
	"context"
	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/handlers"
	"github.com/zhangga/little-town/backend/internal/middleware"
	"gorm.io/gorm"
	"net/http"
	"time"
)

func SetupRouter(db *gorm.DB, cfg *config.Config) *gin.Engine {
	r := gin.Default()
	_ = r.SetTrustedProxies(nil)

	r.Use(middleware.CORS())

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "app": "little-town"})
	})
	r.GET("/ready", func(c *gin.Context) {
		if db != nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
			defer cancel()
			if sqlDB, err := db.DB(); err == nil && sqlDB.PingContext(ctx) == nil {
				c.JSON(http.StatusOK, gin.H{"status": "ready"})
				return
			}
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not_ready"})
	})
	if cfg.JobToken != "" {
		r.POST("/internal/jobs/daily-push", handlers.DailyPushJob(db, cfg))
	}

	v1 := r.Group("/api/v1")
	{
		// 认证（无需登录）
		authHandler := handlers.NewAuthHandler(db, cfg)
		v1.POST("/auth/login", authHandler.Login)

		// 以下接口需要登录
		authorized := v1.Group("")
		authorized.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		{
			// 用户
			userHandler := handlers.NewUserHandler(db)
			authorized.GET("/user/profile", userHandler.GetProfile)
			authorized.PUT("/user/profile", userHandler.UpdateProfile)

			// 小镇长、衣橱、庭院和成长
			residentHandler := handlers.NewResidentHandler(db, cfg)
			authorized.GET("/resident", residentHandler.Get)
			authorized.PUT("/resident", residentHandler.Rename)
			authorized.POST("/resident/purchase", residentHandler.Purchase)
			authorized.POST("/resident/equip", residentHandler.Equip)
			authorized.POST("/resident/home/upgrade", residentHandler.UpgradeHome)

			lifeHandler := handlers.NewTownLifeHandler(db)
			authorized.GET("/town-life", lifeHandler.Get)
			authorized.POST("/town-life/pets/purchase", lifeHandler.PurchasePet)
			authorized.POST("/town-life/events/resolve", lifeHandler.Resolve)

			// 学习
			learnHandler := handlers.NewLearnHandler(db, cfg)
			authorized.GET("/learn/daily-words", learnHandler.GetDailyWords)
			authorized.POST("/learn/submit-answer", learnHandler.SubmitAnswer)
			authorized.POST("/learn/practice/answer", learnHandler.SubmitPracticeAnswer)
			authorized.POST("/learn/practice/complete", learnHandler.CompletePractice)
			authorized.GET("/learn/stats", learnHandler.GetStats)

			// 建筑
			buildingHandler := handlers.NewBuildingHandler(db)
			authorized.GET("/buildings", buildingHandler.ListBuildings)
			authorized.GET("/buildings/my-town", buildingHandler.GetMyTown)
			authorized.POST("/buildings/build", buildingHandler.BuildBuilding)
			authorized.PUT("/buildings/layout", buildingHandler.SaveLayout)

			// 家长端
			parentHandler := handlers.NewParentHandler(db)
			authorized.GET("/parent/stats", parentHandler.GetChildStats)
			authorized.POST("/parent/add-word", parentHandler.AddCustomWord)

			// 订阅消息
			subscriptionHandler := handlers.NewSubscriptionHandler(db, cfg)
			authorized.GET("/subscription/info", subscriptionHandler.GetSubscriptionInfo)
			authorized.POST("/subscription/grant", subscriptionHandler.GrantSubscription)
			authorized.POST("/subscription/test-push", subscriptionHandler.SendTestReminder)
		}
	}

	return r
}
