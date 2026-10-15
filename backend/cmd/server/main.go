package main

import (
	"log"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/yourusername/little-town-backend/internal/config"
	"github.com/yourusername/little-town-backend/internal/database"
	"github.com/yourusername/little-town-backend/internal/router"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found, using system environment variables")
	}

	// 加载配置
	cfg := config.Load()

	// 初始化数据库
	db, err := database.InitDB(cfg)
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	// 自动迁移数据库表
	if err := database.AutoMigrate(db); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// 设置 Gin 模式
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 启动时明确告知登录模式，避免带着开发模式的假 openid 上线而不自知
	if cfg.WechatAppID != "" && cfg.WechatSecret != "" {
		log.Printf("微信登录：已配置（AppID %s）", maskAppID(cfg.WechatAppID))
	} else {
		log.Println("微信登录：未配置 ⚠️  当前为开发模式，openid 由固定种子派生")
		log.Println("         生产环境请在 .env 中填写 WECHAT_APPID 与 WECHAT_SECRET")
	}

	// 初始化路由
	r := router.SetupRouter(db, cfg)

	// 启动服务器
	addr := cfg.ServerHost + ":" + cfg.ServerPort
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

// maskAppID 只保留首尾字符，日志里不出现完整 AppID
func maskAppID(id string) string {
	if len(id) <= 8 {
		return "****"
	}
	return id[:4] + "****" + id[len(id)-4:]
}
