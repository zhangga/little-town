package scheduler

import (
	"context"
	"log"
	"time"

	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/services"
)

// Scheduler 每小时检查一次是否需要执行每日推送
type Scheduler struct {
	cfg  *config.Config
	subs *services.SubscriptionService
	stop context.CancelFunc
	done chan struct{}
}

func New(cfg *config.Config, subs *services.SubscriptionService) *Scheduler {
	return &Scheduler{
		cfg:  cfg,
		subs: subs,
		done: make(chan struct{}),
	}
}

// Start 启动调度循环
//
// 实现方式是「按分钟检查，每天只执行一次」，而不是精确的定时任务。
// 这样做的好处：
//   - 服务半夜重启、或当天错过了时间点，只要还在当天就能补上
//   - 不需要引入 cron 依赖
//   - 重复执行由 PushTargets 的「距上次推送 ≥ 20 小时」条件兜住，
//     不会给同一个人重复推送
//
// 代价是实际推送时间可能有几分钟偏差，对「每日提醒」这个场景无所谓。
func (s *Scheduler) Start() {
	if !s.cfg.PushEnabled {
		log.Println("订阅消息推送：已禁用（PUSH_ENABLED=false）")
		return
	}
	if !s.subs.Configured() {
		log.Println("订阅消息推送：未配置（需要 WECHAT_SECRET 与 SUBSCRIBE_TEMPLATE_ID）")
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.stop = cancel

	log.Printf("订阅消息推送：已启用，每天 %02d:00 前后发送复习提醒", s.cfg.PushHour)

	go func() {
		defer close(s.done)

		// 每分钟检查一次，判断是否到了推送时间
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()

		// 记录今天是否已经跑过，避免同一小时内重复执行
		lastRunDate := ""

		// 启动时立即检查一次，覆盖「服务在推送时间之后才启动」的情况
		s.tick(&lastRunDate)

		for {
			select {
			case <-ctx.Done():
				log.Println("订阅消息推送：已停止")
				return
			case <-ticker.C:
				s.tick(&lastRunDate)
			}
		}
	}()
}

// Stop 停止调度
func (s *Scheduler) Stop() {
	if s.stop != nil {
		s.stop()
		<-s.done
	}
}

// tick 判断当前是否该执行推送
func (s *Scheduler) tick(lastRunDate *string) {
	now := time.Now()
	today := now.Format("2006-01-02")

	// 今天已经跑过
	if *lastRunDate == today {
		return
	}

	// 还没到推送时间
	if now.Hour() < s.cfg.PushHour {
		return
	}

	*lastRunDate = today
	s.runDailyPush()
}

// runDailyPush 执行一次每日推送
func (s *Scheduler) runDailyPush() {
	start := time.Now()

	targets, err := s.subs.FindPushTargets(s.cfg.PushBatchSize, s.cfg.DailyWordCount)
	if err != nil {
		log.Printf("订阅消息推送：查询待推用户失败: %v", err)
		return
	}

	if len(targets) == 0 {
		log.Println("订阅消息推送：今天没有需要提醒的用户")
		return
	}

	var sent, skipped, failed int
	for _, t := range targets {
		result := s.subs.PushReminder(t)
		switch {
		case result.Success:
			sent++
		case result.Skipped:
			skipped++
		default:
			failed++
			log.Printf("订阅消息推送：user=%d 失败: %s", t.UserID, result.Reason)
		}

		// 轻微间隔，避免瞬间打满微信接口的调用频次
		time.Sleep(80 * time.Millisecond)
	}

	log.Printf("订阅消息推送完成：成功 %d，跳过 %d，失败 %d，耗时 %s",
		sent, skipped, failed, time.Since(start).Round(time.Millisecond))
}
