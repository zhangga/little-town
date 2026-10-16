package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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
	if err := run(); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}

func run() error {
	_ = godotenv.Load()
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("configuration: %w", err)
	}
	if err := cfg.ApplyTimeZone(); err != nil {
		return err
	}

	log.SetOutput(os.Stdout)
	gin.DefaultWriter, gin.DefaultErrorWriter = os.Stdout, os.Stderr
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	if cfg.LogToFile {
		fileLogger, writer, err := logging.Setup(logging.Options{Dir: cfg.LogDir, Prefix: "app", KeepDays: cfg.LogKeepDays})
		if err != nil {
			log.Printf("日志文件初始化失败，仅输出终端: %v", err)
		} else {
			defer fileLogger.Close()
			log.SetOutput(writer)
			gin.DefaultWriter, gin.DefaultErrorWriter = writer, writer
			_, _ = fileLogger.CleanupOldFiles()
			log.Printf("日志文件：%s", fileLogger.CurrentPath())
		}
	}

	db, err := database.InitDB(cfg)
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if cfg.AutoMigrate {
		acquired, err := database.WithLock(ctx, db, "schema-and-seed", 30*time.Second, func() error { return database.AutoMigrate(db) })
		if err != nil {
			return fmt.Errorf("schema migration: %w", err)
		}
		if !acquired {
			return fmt.Errorf("timed out waiting for schema migration lock")
		}
	}

	pushScheduler := scheduler.New(cfg, db, services.NewSubscriptionService(
		db, services.NewWeChatService(cfg.WechatAppID, cfg.WechatSecret), cfg.SubscribeTemplateID, cfg.SubscribePage,
	))
	pushScheduler.Start()
	defer pushScheduler.Stop()

	addr := net.JoinHostPort(cfg.ServerHost, cfg.ServerPort)
	server := &http.Server{
		Addr: addr, Handler: router.SetupRouter(db, cfg),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 120 * time.Second, IdleTimeout: 60 * time.Second,
		BaseContext: func(net.Listener) context.Context { return ctx },
	}
	log.Printf("小小镇后端启动：环境=%s 部署=%s 时区=%s 监听=%s", cfg.Env, cfg.DeployTarget, cfg.TimeZone, addr)
	if cfg.WechatAppID != "" && cfg.WechatSecret != "" {
		log.Printf("微信登录：已配置（AppID %s）", maskAppID(cfg.WechatAppID))
	} else {
		log.Println("微信登录：开发模拟模式")
	}
	errs := make(chan error, 1)
	go func() { errs <- server.ListenAndServe() }()
	select {
	case err := <-errs:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Println("正在停止后端服务…")
		shutdownCtx, stop := context.WithTimeout(context.Background(), 20*time.Second)
		defer stop()
		if err := server.Shutdown(shutdownCtx); err != nil {
			_ = server.Close()
			return err
		}
	}
	log.Println("后端服务已停止")
	return nil
}

func maskAppID(id string) string {
	if len(id) <= 8 {
		return "****"
	}
	return id[:4] + "****" + id[len(id)-4:]
}
