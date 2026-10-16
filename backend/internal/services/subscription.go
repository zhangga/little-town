package services

import (
	"errors"
	"log"
	"strconv"
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

// 推送策略相关常量
const (
	// MinPushInterval 同一用户两次推送的最小间隔。
	// 设为 20 小时而不是 24，是为了容忍调度器的执行抖动——
	// 用 24 小时的话，某天任务晚跑几分钟，第二天的推送就会被跳过。
	MinPushInterval = 20 * time.Hour

	// RequestInterval 向用户请求订阅的最小间隔。
	// 每次学完都弹窗会很烦，但间隔太长又会拿不到额度，取 12 小时。
	RequestInterval = 12 * time.Hour
)

// SubscriptionService 管理订阅消息额度与推送
type SubscriptionService struct {
	db     *gorm.DB
	wechat *WeChatService
	// 订阅消息模板 ID，留空表示未配置，推送会被跳过
	templateID string
	// 跳转页面
	page string
}

func NewSubscriptionService(db *gorm.DB, wechat *WeChatService, templateID, page string) *SubscriptionService {
	if page == "" {
		page = "pages/learn/learn"
	}
	return &SubscriptionService{
		db:         db,
		wechat:     wechat,
		templateID: templateID,
		page:       page,
	}
}

// Configured 是否具备推送条件
func (s *SubscriptionService) Configured() bool {
	return s.wechat.Configured() && s.templateID != ""
}

// getOrCreate 取得订阅记录，不存在则创建
func (s *SubscriptionService) getOrCreate(userID uint) (*models.Subscription, error) {
	var sub models.Subscription
	err := s.db.Where("user_id = ?", userID).First(&sub).Error

	if err == nil {
		return &sub, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	sub = models.Subscription{UserID: userID}
	if err := s.db.Create(&sub).Error; err != nil {
		return nil, err
	}
	return &sub, nil
}

// RecordRequest 记录一次「向用户请求订阅」的动作。
// 用于节流，避免频繁弹窗。
func (s *SubscriptionService) RecordRequest(userID uint) error {
	sub, err := s.getOrCreate(userID)
	if err != nil {
		return err
	}
	sub.LastRequestAt = time.Now()
	return s.db.Save(sub).Error
}

// ShouldRequest 判断现在是否适合向用户请求订阅。
//
// 返回 false 的两种情况：
//   - 刚请求过（间隔不足），再弹会打扰
//   - 已有待用额度，没必要再要
func (s *SubscriptionService) ShouldRequest(userID uint) (bool, error) {
	sub, err := s.getOrCreate(userID)
	if err != nil {
		return false, err
	}

	if sub.Quota > 0 {
		return false, nil
	}
	if !sub.LastRequestAt.IsZero() && time.Since(sub.LastRequestAt) < RequestInterval {
		return false, nil
	}
	return true, nil
}

// Grant 记录用户同意了一次订阅，额度 +1。
// acceptanceCount 是 wx.requestSubscribeMessage 成功返回的模板数量，
// 但无论用户接受几个模板，我们只推一种消息，所以固定 +1。
func (s *SubscriptionService) Grant(userID uint) (int, error) {
	sub, err := s.getOrCreate(userID)
	if err != nil {
		return 0, err
	}

	sub.Quota++
	sub.LastGrantedAt = time.Now()
	// 用户刚同意过，把请求时间也更新，避免紧接着又弹一次
	sub.LastRequestAt = time.Now()

	if err := s.db.Save(sub).Error; err != nil {
		return 0, err
	}
	return sub.Quota, nil
}

// Quota 返回剩余可推送次数
func (s *SubscriptionService) Quota(userID uint) (int, error) {
	sub, err := s.getOrCreate(userID)
	if err != nil {
		return 0, err
	}
	return sub.Quota, nil
}

// WeChatService 暴露给 handler 使用（如需要直接发送）
func (s *SubscriptionService) WeChatService() *WeChatService {
	return s.wechat
}

// Page 返回订阅消息点击后跳转的页面
func (s *SubscriptionService) Page() string {
	return s.page
}

// TemplateID 返回模板 ID
func (s *SubscriptionService) TemplateID() string {
	return s.templateID
}

// ---------- 推送 ----------

// PushTarget 一个待推送的用户
type PushTarget struct {
	UserID      uint
	OpenID      string
	Nickname    string
	DueCount    int // 待复习单词数
	DailyGoal   int
	LearnedToday int
}

// FindPushTargets 找出今天应该推送的用户。
//
// 筛选条件（四条同时满足）：
//  1. 有剩余推送额度
//  2. 距离上次推送超过 MinPushInterval
//  3. 今天有到期的复习任务 —— 没有任务就没必要提醒
//  4. 今天还没学习 —— 已经学过的人不需要催
//
// 第 3、4 条是关键：给"今天已经学完"或"今天没任务"的人推消息，
// 是纯骚扰，会加速用户关闭订阅。
func (s *SubscriptionService) FindPushTargets(limit int, dailyGoal int) ([]PushTarget, error) {
	now := time.Now()
	dayStart := DayStart(now)
	dayEnd := DayEnd(now)

	// 子查询：今天有到期复习任务的用户
	dueUsers := s.db.Model(&models.ReviewSchedule{}).
		Select("DISTINCT user_id").
		Where("next_review_at >= ? AND next_review_at < ?", dayStart, dayEnd)

	// 子查询：今天已经学习过的用户
	learnedUsers := s.db.Model(&models.LearningRecord{}).
		Select("DISTINCT user_id").
		Where("created_at >= ?", dayStart)

	var targets []PushTarget

	err := s.db.Model(&models.Subscription{}).
		Select("subscriptions.user_id, users.open_id, users.nickname").
		Joins("JOIN users ON users.id = subscriptions.user_id").
		Where("subscriptions.quota > 0").
		Where("users.deleted_at IS NULL").
		// 距上次推送足够久
		Where("subscriptions.last_pushed_at IS NULL OR subscriptions.last_pushed_at < ?",
			now.Add(-MinPushInterval)).
		Where("subscriptions.user_id IN (?)", dueUsers).
		Where("subscriptions.user_id NOT IN (?)", learnedUsers).
		Limit(limit).
		Scan(&targets).Error

	if err != nil {
		return nil, err
	}

	// 补充每人的待复习数量，用于消息内容
	for i := range targets {
		var count int64
		s.db.Model(&models.ReviewSchedule{}).
			Where("user_id = ? AND next_review_at >= ? AND next_review_at < ?",
				targets[i].UserID, dayStart, dayEnd).
			Count(&count)
		targets[i].DueCount = int(count)
		targets[i].DailyGoal = dailyGoal

		var learned int64
		s.db.Model(&models.LearningRecord{}).
			Where("user_id = ? AND created_at >= ?", targets[i].UserID, dayStart).
			Distinct("word_id").
			Count(&learned)
		targets[i].LearnedToday = int(learned)
	}

	return targets, nil
}

// PushResult 单个用户的推送结果
type PushResult struct {
	UserID  uint
	Success bool
	Skipped bool
	Reason  string
}

// PushReminder 向指定用户推送复习提醒，并扣减额度。
//
// 关于扣减时机：只在微信返回成功时才扣。
// 失败不扣，否则网络抖动会白白吃掉用户的订阅额度。
func (s *SubscriptionService) PushReminder(target PushTarget) PushResult {
	result := PushResult{UserID: target.UserID}

	if !s.Configured() {
		result.Skipped = true
		result.Reason = "未配置订阅消息模板或微信凭证"
		return result
	}

	if target.OpenID == "" {
		result.Skipped = true
		result.Reason = "用户缺少 openid"
		return result
	}

	// 模板字段必须与公众平台申请的模板一致。
	// 这里按「待复习数量 + 昵称 + 提示」的常见模板结构组织，
	// 实际使用时请对照你的模板字段名调整。
	data := SubscribeMessageData{
		"thing1":  truncate("小小镇有 "+strconv.Itoa(target.DueCount)+" 个单词等着复习", 20),
		"number2": target.DueCount,
		"thing3":  truncate("今天还没去小镇看看，学习一下就能拿砖块", 20),
	}

	err := s.wechat.SendSubscribeMessage(target.OpenID, s.templateID, data, s.page, "", "")
	if err != nil {
		var subErr *SubscribeError
		if errors.As(err, &subErr) && subErr.IsQuotaExhausted() {
			// 用户实际已无额度（我们记录的和微信侧不一致）。
			// 把本地额度清零，避免反复尝试推送。
			s.db.Model(&models.Subscription{}).
				Where("user_id = ?", target.UserID).
				Update("quota", 0)

			result.Skipped = true
			result.Reason = "用户没有可用订阅次数，已清零本地额度"
			return result
		}

		result.Reason = err.Error()
		return result
	}

	// 推送成功，扣减额度
	sub, err := s.getOrCreate(target.UserID)
	if err == nil {
		if sub.Quota > 0 {
			sub.Quota--
		}
		sub.LastPushedAt = time.Now()
		sub.TotalPushed++
		if err := s.db.Save(sub).Error; err != nil {
			log.Printf("警告：推送成功但额度扣减失败 user=%d: %v", target.UserID, err)
		}
	}

	result.Success = true
	return result
}

// PushToUser 手动推送（调试用，不受推送间隔限制）
func (s *SubscriptionService) PushToUser(userID uint) PushResult {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return PushResult{UserID: userID, Reason: "用户不存在"}
	}

	var dueCount int64
	now := time.Now()
	s.db.Model(&models.ReviewSchedule{}).
		Where("user_id = ? AND next_review_at >= ? AND next_review_at < ?", userID, DayStart(now), DayEnd(now)).
		Count(&dueCount)

	return s.PushReminder(PushTarget{
		UserID:   userID,
		OpenID:   user.OpenID,
		Nickname: user.Nickname,
		DueCount: int(dueCount),
	})
}

// ---------- 小工具 ----------

// truncate 按「字符数」截断，不是字节数。
// 订阅消息模板对 thing 类型字段有长度限制（通常 20 个字符），
// 直接用 len() 判断会把中文算成 3 字节而误截。
func truncate(s string, maxChars int) string {
	runes := []rune(s)
	if len(runes) <= maxChars {
		return s
	}
	return string(runes[:maxChars])
}
