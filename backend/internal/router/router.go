package router

import (
	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/handlers"
	"github.com/zhangga/little-town/backend/internal/middleware"
	"gorm.io/gorm"
)

func SetupRouter(db *gorm.DB, cfg *config.Config) *gin.Engine {
	r := gin.Default()

	r.Use(middleware.CORS())

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "app": "little-town"})
	})

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

			// 学习
			learnHandler := handlers.NewLearnHandler(db, cfg)
			authorized.GET("/learn/daily-words", learnHandler.GetDailyWords)
			authorized.POST("/learn/submit-answer", learnHandler.SubmitAnswer)
			authorized.GET("/learn/stats", learnHandler.GetStats)

			// 建筑
			buildingHandler := handlers.NewBuildingHandler(db)
			authorized.GET("/buildings", buildingHandler.ListBuildings)
			authorized.GET("/buildings/my-town", buildingHandler.GetMyTown)
			authorized.POST("/buildings/build", buildingHandler.BuildBuilding)

			// 家长端
			parentHandler := handlers.NewParentHandler(db)
			authorized.GET("/parent/stats", parentHandler.GetChildStats)
			authorized.POST("/parent/add-word", parentHandler.AddCustomWord)
		}
	}

	return r
}
