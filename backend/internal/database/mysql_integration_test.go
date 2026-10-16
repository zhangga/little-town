package database_test

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/scheduler"
	"github.com/zhangga/little-town/backend/internal/services"
)

// MYSQL_TEST_DB must name a dedicated, already created database. Never use application data.
func TestMySQLSchemaAndSubscription(t *testing.T) {
	testDB := os.Getenv("MYSQL_TEST_DB")
	if testDB == "" {
		t.Skip("set MYSQL_TEST_DB to run against a real MySQL instance")
	}
	if !strings.HasPrefix(testDB, "littletown_test_") {
		t.Fatal("MYSQL_TEST_DB must start with littletown_test_")
	}
	cfg := config.Load()
	cfg.DBName = testDB
	db, err := database.InitDBSilent(cfg)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	for i := 0; i < 2; i++ {
		if err := database.AutoMigrate(db); err != nil {
			t.Fatalf("schema migration %d: %v", i+1, err)
		}
	}

	key := fmt.Sprintf("mysql-%d-", time.Now().UnixNano())
	user := models.User{OpenID: key + "Case", Nickname: "小镇🦊", Grade: 1}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	other := models.User{OpenID: key + "case", Nickname: "大小写隔离", Grade: 1}
	if err := db.Create(&other).Error; err != nil {
		t.Fatalf("case-sensitive OpenIDs must remain distinct: %v", err)
	}
	t.Cleanup(func() {
		db.Where("user_id IN ?", []uint{user.ID, other.ID}).Delete(&models.Subscription{})
		db.Unscoped().Delete(&models.User{}, []uint{user.ID, other.ID})
	})
	var stored models.User
	if err := db.Where("open_id = ?", user.OpenID).First(&stored).Error; err != nil || stored.ID != user.ID || stored.Nickname != user.Nickname {
		t.Fatalf("unicode and case-sensitive lookup failed: %v", err)
	}

	subs := services.NewSubscriptionService(db, nil, "", "")
	shouldRequest, err := subs.ShouldRequest(user.ID)
	if err != nil || !shouldRequest {
		t.Fatalf("fresh subscription must work under strict SQL mode: %v", err)
	}
	var sub models.Subscription
	if err := db.Where("user_id = ?", user.ID).First(&sub).Error; err != nil {
		t.Fatal(err)
	}
	if sub.LastRequestAt != nil || sub.LastGrantedAt != nil || sub.LastPushedAt != nil {
		t.Fatal("timestamps for events that have not happened must be SQL NULL")
	}
	if err := subs.RecordRequest(user.ID); err != nil {
		t.Fatal(err)
	}
	if quota, err := subs.Grant(user.ID); err != nil || quota != 1 {
		t.Fatalf("grant subscription: quota=%d error=%v", quota, err)
	}
	if err := db.Where("user_id = ?", user.ID).First(&sub).Error; err != nil {
		t.Fatal(err)
	}
	if sub.LastRequestAt == nil || sub.LastGrantedAt == nil || sub.LastPushedAt != nil {
		t.Fatal("saving a grant must preserve NULL for an unsent notification")
	}
	if shouldRequest, err := subs.ShouldRequest(user.ID); err != nil || shouldRequest {
		t.Fatalf("subscription cooldown/remaining quota was lost: %v", err)
	}

	var sessionZone string
	if err := db.Raw("SELECT @@session.time_zone").Scan(&sessionZone).Error; err != nil || sessionZone != "+08:00" {
		t.Fatalf("unexpected session timezone %q: %v", sessionZone, err)
	}
	location, _ := time.LoadLocation("Asia/Shanghai")
	// 00:30 上海时间在 UTC 中仍是前一天，日期统计必须按上海时间计算。
	at := time.Date(2026, 10, 16, 0, 30, 0, 123456000, location)
	if err := db.Model(&sub).Update("last_granted_at", at.UTC()).Error; err != nil {
		t.Fatal(err)
	}
	var date string
	if err := db.Raw("SELECT DATE_FORMAT(last_granted_at, '%Y-%m-%d') FROM subscriptions WHERE id = ?", sub.ID).Scan(&date).Error; err != nil || date != "2026-10-16" {
		t.Fatalf("date shifted across timezone boundary: %q, %v", date, err)
	}
	if err := db.First(&sub, sub.ID).Error; err != nil || !sub.LastGrantedAt.Equal(at) {
		t.Fatalf("timestamp lost its instant or microsecond precision: %v", err)
	}
	// 直接验证发奖模块的每日限额，接口层另验证同一词的重复提交不会发奖。
	rewards := services.NewRewardService(db)
	var reward *services.RewardResult
	for i := 0; i < services.DailyBrickCap+2; i++ {
		reward, err = rewards.GrantForAnswer(user.ID, true)
		if err != nil {
			t.Fatal(err)
		}
	}
	if !reward.Capped || reward.BricksEarned != 0 || reward.TotalBricks != services.DailyBrickCap || reward.BricksToday != services.DailyBrickCap {
		t.Fatalf("daily brick cap did not hold: %+v", reward)
	}
	for i := 0; i < 2; i++ {
		acquired, err := database.WithLock(context.Background(), db, "integration-lock", 0, func() error {
			other, err := database.WithLock(context.Background(), db, "integration-lock", 0, func() error { t.Error("a second worker entered a held lock"); return nil })
			if other || err != nil {
				t.Fatalf("contended lock: acquired=%t error=%v", other, err)
			}
			return nil
		})
		if !acquired || err != nil {
			t.Fatalf("lock acquisition/release failed: %v", err)
		}
	}
	pushCfg := *cfg
	pushCfg.WechatAppID, pushCfg.WechatSecret, pushCfg.SubscribeTemplateID = "test", "test", "test"
	runner := scheduler.New(&pushCfg, db, services.NewSubscriptionService(db, services.NewWeChatService("test", "test"), "test", ""))
	_, err = database.WithLock(context.Background(), db, "daily-push", 0, func() error {
		result, err := runner.RunDaily(context.Background())
		if err != nil || !result.Busy || result.Sent != 0 {
			t.Fatalf("parallel daily job must skip: %+v, %v", result, err)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
