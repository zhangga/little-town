package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/models"
	"github.com/zhangga/little-town/backend/internal/services"
	"gorm.io/gorm"
)

// devPrefix 是开发模式下用于指定独立账号的 code 前缀。
// 见 devOpenID 的说明。
const devPrefix = "dev:"

// sessionKeyCache 暂存 session_key，供后续解密敏感数据（如手机号）使用。
// 进程内缓存，重启即失效——当前没有依赖它的功能，够用。
// session_key 属敏感数据，绝不能写入 API 响应。
type sessionKeyCache struct {
	mu    sync.RWMutex
	items map[uint]string
}

var sessionKeys = &sessionKeyCache{items: make(map[uint]string)}

func (c *sessionKeyCache) Set(userID uint, key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[userID] = key
}

func (c *sessionKeyCache) Get(userID uint) string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.items[userID]
}

// AuthHandler 认证相关
type AuthHandler struct {
	db     *gorm.DB
	cfg    *config.Config
	wechat *services.WeChatService
}

func NewAuthHandler(db *gorm.DB, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		db:     db,
		cfg:    cfg,
		wechat: services.NewWeChatService(cfg.WechatAppID, cfg.WechatSecret),
	}
}

type LoginRequest struct {
	Code     string `json:"code" binding:"required"` // wx.login() 取得的 code
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
	Grade    int    `json:"grade"`
}

// Login 微信登录
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	openID, sessionKey, err := h.resolveOpenID(req.Code)
	if err != nil {
		// 微信错误码对应的文案已经过翻译，可直接展示
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	result := h.db.Where("open_id = ?", openID).First(&user)

	if result.Error == gorm.ErrRecordNotFound {
		grade := req.Grade
		if grade < 1 || grade > 6 {
			grade = 1
		}

		user = models.User{
			OpenID:   openID,
			Nickname: req.Nickname,
			Avatar:   req.Avatar,
			Grade:    grade,
			Level:    1,
		}
		if err := h.db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建账号失败，请重试"})
			return
		}
	} else if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库暂时不可用"})
		return
	} else {
		// 老用户：仅在传了新值时更新，避免空值覆盖已有资料
		if req.Nickname != "" {
			user.Nickname = req.Nickname
		}
		if req.Avatar != "" {
			user.Avatar = req.Avatar
		}
		if req.Grade >= 1 && req.Grade <= 6 {
			user.Grade = req.Grade
		}
		if err := h.db.Save(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存资料失败，请重试"})
			return
		}
	}

	if sessionKey != "" {
		sessionKeys.Set(user.ID, sessionKey)
	}

	signed, err := h.signToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "签发登录凭证失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": signed,
		"user":  user,
	})
}

// resolveOpenID 取 openid：优先调用微信 code2session。
// 开发模式下（未配置 AppID/AppSecret）回落到由 code 派生的稳定假 openid，
// 保证同一台设备反复登录时命中同一账号，不会每次建新用户。
func (h *AuthHandler) resolveOpenID(code string) (openID string, sessionKey string, err error) {
	result, err := h.wechat.Code2Session(code)
	if err == nil {
		return result.OpenID, result.SessionKey, nil
	}

	if err == services.ErrWeChatNotConfigured {
		log.Println("[dev] 未配置 WECHAT_APPID/WECHAT_SECRET，使用开发模式登录（openid 由固定种子派生）")
		return devOpenID(code), "", nil
	}

	return "", "", err
}

// devOpenID 生成开发模式下的 openid。
//
// 默认使用固定种子，目的是让同一台设备反复登录命中同一账号：
// wx.login() 每次返回的 code 都不同，若直接拿 code 拼 openid，
// 每次登录都会建新账号，之前盖的小镇会全部消失。
//
// 但固定种子也意味着所有登录都落在同一个账号上，无法并行测试多用户。
// 因此约定：code 以 "dev:" 开头时，取冒号后的内容作为隔离键，
// 这样可以显式构造互不干扰的开发账号，例如 "dev:user-a"、"dev:user-b"。
// 该约定只在未配置 AppSecret 的开发模式下生效。
func devOpenID(code string) string {
	const devSeed = "little-town-dev-user"

	seed := devSeed
	if strings.HasPrefix(code, devPrefix) {
		seed = code[len(devPrefix):]
		if seed == "" {
			seed = devSeed
		}
	}

	sum := sha256.Sum256([]byte(seed))
	return "dev_" + hex.EncodeToString(sum[:8])
}

// signToken 签发 JWT，claims 结构与 AuthMiddleware 的解析保持一致
func (h *AuthHandler) signToken(user *models.User) (string, error) {
	expireHours := h.cfg.JWTExpireHours
	if expireHours <= 0 {
		expireHours = 720
	}

	claims := jwt.MapClaims{
		"user_id": user.ID,
		"open_id": user.OpenID,
		"exp":     time.Now().Add(time.Duration(expireHours) * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.cfg.JWTSecret))
}
