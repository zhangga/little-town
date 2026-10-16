package scheduler

import (
	"context"
	"log"
	"time"

	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
)

type Scheduler struct {
	cfg  *config.Config
	db   *gorm.DB
	subs *services.SubscriptionService
	stop context.CancelFunc
	done chan struct{}
}

type Summary struct {
	Configured bool `json:"configured"`
	Busy       bool `json:"busy"`
	Sent       int  `json:"sent"`
	Skipped    int  `json:"skipped"`
	Failed     int  `json:"failed"`
}

func New(cfg *config.Config, db *gorm.DB, subs *services.SubscriptionService) *Scheduler {
	return &Scheduler{cfg: cfg, db: db, subs: subs, done: make(chan struct{})}
}

// Start 仅用于常驻实例。云托管可缩容到零，默认由外部任务调用 RunDaily。
func (s *Scheduler) Start() {
	if !s.cfg.PushEnabled || !s.subs.Configured() {
		log.Println("进程内每日提醒未启用；可按需配置外部任务入口")
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.stop = cancel
	go func() {
		defer close(s.done)
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		lastDate := ""
		tick := func() {
			now := time.Now()
			today := now.Format("2006-01-02")
			if lastDate == today || now.Hour() < s.cfg.PushHour {
				return
			}
			summary, err := s.RunDaily(ctx)
			if err != nil {
				log.Printf("每日提醒失败: %v", err)
			} else if summary.Failed == 0 {
				lastDate = today
			}
		}
		tick()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				tick()
			}
		}
	}()
}

func (s *Scheduler) Stop() {
	if s.stop != nil {
		s.stop()
		<-s.done
	}
}

// RunDaily 可由常驻调度、HTTP 任务或一次性命令调用。
// MySQL 锁协调多副本；发送后更新时间和额度，重试时跳过近期已推送的用户。
func (s *Scheduler) RunDaily(ctx context.Context) (Summary, error) {
	summary := Summary{Configured: s.subs.Configured()}
	if !summary.Configured {
		return summary, nil
	}
	acquired, err := database.WithLock(ctx, s.db, "daily-push", 0, func() error {
		targets, err := s.subs.FindPushTargets(s.cfg.PushBatchSize, s.cfg.DailyWordCount)
		if err != nil {
			return err
		}
		for _, target := range targets {
			if err := ctx.Err(); err != nil {
				return err
			}
			result := s.subs.PushReminder(target)
			switch {
			case result.Success:
				summary.Sent++
			case result.Skipped:
				summary.Skipped++
			default:
				summary.Failed++
				log.Printf("每日提醒 user=%d 失败: %s", target.UserID, result.Reason)
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(80 * time.Millisecond):
			}
		}
		return nil
	})
	summary.Busy = !acquired && err == nil
	if err == nil {
		log.Printf("每日提醒：成功=%d 跳过=%d 失败=%d 其他副本执行中=%t", summary.Sent, summary.Skipped, summary.Failed, summary.Busy)
	}
	return summary, err
}
