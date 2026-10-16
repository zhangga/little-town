package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
)

type SubscriptionHandler struct {
	db           *gorm.DB
	cfg          *config.Config
	subscription *services.SubscriptionService
}

func NewSubscriptionHandler(db *gorm.DB, cfg *config.Config) *SubscriptionHandler {
	return &SubscriptionHandler{
		db:  db,
		cfg: cfg,
		subscription: services.NewSubscriptionService(
			db,
			services.NewWeChatService(cfg.WechatAppID, cfg.WechatSecret),
			cfg.SubscribeTemplateID,
			cfg.SubscribePage,
		),
	}
}

// GetSubscriptionInfo 查询订阅状态
//
// 前端在完成每日学习后调用，据 should_request 决定是否弹出订阅请求。
// 把判断放在后端而不是前端，是因为"该不该弹"依赖额度与上次请求时间，
// 前端无法知道这些状态。
func (h *SubscriptionHandler) GetSubscriptionInfo(c *gin.Context) {
	userID := getCurrentUserID(c)

	quota, err := h.subscription.Quota(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取订阅状态失败"})
		return
	}

	shouldRequest, err := h.subscription.ShouldRequest(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取订阅状态失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"quota":          quota,
		"should_request": shouldRequest,
		"configured":     h.subscription.Configured(),
		// 前端需要用它调 wx.requestSubscribeMessage
		"template_id": h.subscription.TemplateID(),
	})
}

type grantRequest struct {
	// Accepted 用户在 wx.requestSubscribeMessage 弹窗里的选择结果。
	// true 表示同意，false 表示拒绝（或全部选"不允许"）。
	Accepted bool `json:"accepted"`
}

// GrantSubscription 记录用户同意订阅
//
// 注意：必须在 wx.requestSubscribeMessage 的 success 回调里调用，
// 且只有用户真的选了"允许"才 should count。前端不能伪造——
// 但伪造也只能骗到额度，推送时微信侧会因无授权而返回 43101，
// 那时我们会把本地额度清零。
func (h *SubscriptionHandler) GrantSubscription(c *gin.Context) {
	userID := getCurrentUserID(c)

	var req grantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 无论同意还是拒绝，都记录"已请求过"，用于节流
	if err := h.subscription.RecordRequest(userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "记录订阅状态失败"})
		return
	}

	if !req.Accepted {
		c.JSON(http.StatusOK, gin.H{
			"message": "已记录用户未订阅",
			"quota":   0,
		})
		return
	}

	quota, err := h.subscription.Grant(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "记录订阅失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "订阅成功，明天会收到复习提醒",
		"quota":   quota,
	})
}

// SendTestReminder 手动触发一次推送（调试用）
//
// 仅供开发阶段验证模板配置是否正确。正式环境应移除或加权限控制，
// 否则任何人都能给自己刷推送。
func (h *SubscriptionHandler) SendTestReminder(c *gin.Context) {
	userID := getCurrentUserID(c)

	if h.cfg.Env == "production" {
		c.JSON(http.StatusForbidden, gin.H{"error": "生产环境已禁用调试接口"})
		return
	}

	if !h.subscription.Configured() {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"skipped": true,
			"reason":  "未配置微信凭证或订阅消息模板 ID，无法推送",
		})
		return
	}

	result := h.subscription.PushToUser(userID)

	var user models.User
	h.db.First(&user, userID)

	c.JSON(http.StatusOK, gin.H{
		"success": result.Success,
		"skipped": result.Skipped,
		"reason":  result.Reason,
		"openid":  user.OpenID,
	})
}
