package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/scheduler"
	"github.com/zhangga/little-town/backend/internal/services"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatal(err)
	}
	if err := cfg.ApplyTimeZone(); err != nil {
		log.Fatal(err)
	}
	db, err := database.InitDBSilent(cfg)
	if err != nil {
		log.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal(err)
	}
	defer sqlDB.Close()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	runner := scheduler.New(cfg, db, services.NewSubscriptionService(db, services.NewWeChatService(cfg.WechatAppID, cfg.WechatSecret), cfg.SubscribeTemplateID, cfg.SubscribePage))
	result, err := runner.RunDaily(ctx)
	if err != nil {
		log.Fatal(err)
	}
	_ = json.NewEncoder(os.Stdout).Encode(result)
	if result.Failed > 0 {
		os.Exit(1)
	}
}
