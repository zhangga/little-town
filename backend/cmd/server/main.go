package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/logging"
	"github.com/zhangga/little-town/backend/internal/router"
	"github.com/zhangga/little-town/backend/internal/scheduler"
	"github.com/zhangga/little-town/backend/internal/services"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found, using system environment variables")
	}

	// 加载配置
	cfg := config.Load()

	// 初始化日志落盘。
	// 失败不阻断启动——开发时更常见的是目录权限问题，
	// 此时降级为只输出终端，比直接退出更有用。
	logger, writer, err := logging.Setup(logging.Options{
		Dir:      cfg.LogDir,
		Prefix:   "app",
		KeepDays: cfg.LogKeepDays,
	})
	if err != nil {
		log.Printf("警告：日志文件初始化失败，仅输出到终端: %v", err)
	} else {
		defer logger.Close()

		log.SetOutput(writer)
		// 让 Gin 的访问日志与错误日志也写进同一个文件
		gin.DefaultWriter = writer
		gin.DefaultErrorWriter = writer
	}

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

	// 启动信息
	log.Println("========== 小小镇后端启动 ==========")

	if logger != nil {
		if removed, err := logger.CleanupOldFiles(); err == nil && removed > 0 {
			log.Printf("已清理 %d 个过期日志文件（保留 %d 天）", removed, cfg.LogKeepDays)
		}
		log.Printf("日志文件：%s", logger.CurrentPath())
	}

	log.Printf("运行环境：%s", cfg.Env)

	// 明确告知登录模式，避免带着开发模式的假 openid 上线而不自知
	if cfg.WechatAppID != "" && cfg.WechatSecret != "" {
		log.Printf("微信登录：已配置（AppID %s）", maskAppID(cfg.WechatAppID))
	} else {
		log.Println("微信登录：未配置 ⚠️  当前为开发模式，openid 由固定种子派生")
		log.Println("         生产环境请在 .env 中填写 WECHAT_APPID 与 WECHAT_SECRET")
	}

	// 初始化路由
	r := router.SetupRouter(db, cfg)

	// 启动订阅消息推送调度
	pushScheduler := scheduler.New(cfg, services.NewSubscriptionService(
		db,
		services.NewWeChatService(cfg.WechatAppID, cfg.WechatSecret),
		cfg.SubscribeTemplateID,
		cfg.SubscribePage,
	))
	pushScheduler.Start()
	defer pushScheduler.Stop()

	// 启动服务器
	addr := cfg.ServerHost + ":" + cfg.ServerPort
	log.Printf("监听地址：%s", addr)
	log.Println("=====================================")

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
