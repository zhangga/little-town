package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

const (
	defaultCode2SessionEndpoint = "https://api.weixin.qq.com/sns/jscode2session"
	defaultTokenEndpoint        = "https://api.weixin.qq.com/cgi-bin/token"
	defaultSubscribeEndpoint    = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send"
)

// ErrWeChatNotConfigured 未配置 AppID/AppSecret 时返回，调用方据此走开发模式
var ErrWeChatNotConfigured = errors.New("微信 AppID/AppSecret 未配置")

// Code2SessionResult 微信 code2session 接口返回体
type Code2SessionResult struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	UnionID    string `json:"unionid"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

// accessToken 缓存
//
// access_token 有效期 7200 秒，且微信对获取频次有限制，
// 不能每次调用接口都重新获取。这里缓存到内存，提前 5 分钟过期，
// 避免使用临界失效的 token。进程重启后重新获取即可。
type tokenCache struct {
	mu      sync.RWMutex
	token   string
	expires time.Time
}

func (c *tokenCache) get() (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.token == "" || time.Now().After(c.expires) {
		return "", false
	}
	return c.token, true
}

func (c *tokenCache) set(token string, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.token = token
	// 提前 5 分钟失效，留出余量
	c.expires = time.Now().Add(ttl - 5*time.Minute)
}

// WeChatService 封装微信小程序服务端接口
type WeChatService struct {
	appID     string
	appSecret string
	endpoint  string
	tokenURL  string
	subURL    string
	client    *http.Client
	tokens    tokenCache
}

func NewWeChatService(appID, appSecret string) *WeChatService {
	return &WeChatService{
		appID:     appID,
		appSecret: appSecret,
		endpoint:  defaultCode2SessionEndpoint,
		tokenURL:  defaultTokenEndpoint,
		subURL:    defaultSubscribeEndpoint,
		// 微信接口偶发慢响应，超时短一点，避免请求堆积
		client: &http.Client{Timeout: 6 * time.Second},
	}
}

// Configured 是否具备真实调用凭证
func (s *WeChatService) Configured() bool {
	return s.appID != "" && s.appSecret != ""
}

// Code2Session 用 wx.login() 取得的 code 换取 openid 与 session_key。
// 注意：session_key 属于敏感数据，只应在服务端使用，绝不能下发给客户端。
func (s *WeChatService) Code2Session(code string) (*Code2SessionResult, error) {
	if !s.Configured() {
		return nil, ErrWeChatNotConfigured
	}
	if code == "" {
		return nil, errors.New("缺少登录凭证 code")
	}

	q := url.Values{}
	q.Set("appid", s.appID)
	q.Set("secret", s.appSecret)
	q.Set("js_code", code)
	q.Set("grant_type", "authorization_code")

	// 不打印该 URL：其中包含 appsecret
	reqURL := s.endpoint + "?" + q.Encode()

	resp, err := s.client.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("连接微信服务器失败，请检查网络: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("微信接口返回异常状态码 %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("读取微信响应失败: %w", err)
	}

	var result Code2SessionResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("解析微信响应失败: %w", err)
	}

	// 微信在出错时同样返回 HTTP 200，必须自行检查 errcode
	if result.ErrCode != 0 {
		return &result, errors.New(describeErrCode(result.ErrCode, result.ErrMsg))
	}
	if result.OpenID == "" {
		return &result, errors.New("微信未返回 openid，请确认小程序 AppID 是否正确")
	}

	return &result, nil
}

// describeErrCode 把微信错误码翻译成可直接展示给用户的说法。
// 这些文案会经接口回传给小程序弹出提示，所以要保持口语化、可操作。
func describeErrCode(code int, msg string) string {
	switch code {
	case -1:
		return "微信服务器繁忙，请稍后重试"
	case 40013:
		return "小程序 AppID 无效，请检查后端配置"
	case 40125:
		return "小程序密钥无效，请检查后端配置"
	case 40029:
		return "登录凭证已失效，请重新进入"
	case 40163:
		return "登录凭证已被使用，请重新进入"
	case 45011:
		return "操作过于频繁，请稍后再试"
	case 40226:
		return "该账号暂时无法登录"
	default:
		if msg != "" {
			return fmt.Sprintf("微信登录失败：%s", msg)
		}
		return fmt.Sprintf("微信登录失败（错误码 %d）", code)
	}
}

// ---------- access_token ----------

type accessTokenResult struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	ErrCode     int    `json:"errcode"`
	ErrMsg      string `json:"errmsg"`
}

// AccessToken 获取全局接口调用凭证，优先使用缓存。
//
// 缓存是必须的：微信对 access_token 的获取频次有限制，
// 且每次获取会让上一个失效，频繁获取会导致其他服务调用失败。
func (s *WeChatService) AccessToken() (string, error) {
	if !s.Configured() {
		return "", ErrWeChatNotConfigured
	}

	if token, ok := s.tokens.get(); ok {
		return token, nil
	}

	q := url.Values{}
	q.Set("grant_type", "client_credential")
	q.Set("appid", s.appID)
	q.Set("secret", s.appSecret)

	// 不打印该 URL：其中包含 appsecret
	reqURL := s.tokenURL + "?" + q.Encode()

	resp, err := s.client.Get(reqURL)
	if err != nil {
		return "", fmt.Errorf("获取 access_token 失败，请检查网络: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("读取 access_token 响应失败: %w", err)
	}

	var result accessTokenResult
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("解析 access_token 响应失败: %w", err)
	}

	if result.ErrCode != 0 {
		return "", errors.New(describeTokenErrCode(result.ErrCode, result.ErrMsg))
	}
	if result.AccessToken == "" {
		return "", errors.New("微信未返回 access_token")
	}

	ttl := time.Duration(result.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = 7200 * time.Second
	}
	s.tokens.set(result.AccessToken, ttl)

	return result.AccessToken, nil
}

func describeTokenErrCode(code int, msg string) string {
	switch code {
	case 40001, 40125:
		return "小程序密钥无效，无法获取 access_token，请检查 WECHAT_SECRET"
	case 40013:
		return "小程序 AppID 无效，请检查 WECHAT_APPID"
	case 40164:
		return "当前服务器 IP 不在微信白名单内，请在公众平台配置 IP 白名单"
	case 45009:
		return "接口调用频次超限，请稍后再试"
	default:
		if msg != "" {
			return fmt.Sprintf("获取 access_token 失败：%s", msg)
		}
		return fmt.Sprintf("获取 access_token 失败（错误码 %d）", code)
	}
}

// ---------- 订阅消息 ----------

// SubscribeMessageData 模板数据。
// 键名必须与公众平台申请的模板字段完全一致（如 thing1、number2、date3），
// 写错会直接报 47003 参数错误。
type SubscribeMessageData map[string]interface{}

// SubscribeMessageResult 推送结果
type SubscribeMessageResult struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

type subscribeSendBody struct {
	ToUser     string               `json:"touser"`
	TemplateID string               `json:"template_id"`
	Page       string               `json:"page,omitempty"`
	Data       SubscribeMessageData `json:"data"`
	// 小程序版本：正式版 release / 体验版 trial / 开发版 developer
	MiniprogramState string `json:"miniprogram_state,omitempty"`
	Lang             string `json:"lang,omitempty"`
}

// SendSubscribeMessage 发送一条订阅消息。
//
// 重要：订阅消息的授权是「一次性」的——用户点一次同意只能推一条，
// 推完即消耗掉。所以调用方必须在发送成功后扣减用户的可推送次数，
// 见 handlers 中的订阅记录逻辑。
func (s *WeChatService) SendSubscribeMessage(openID, templateID string, data SubscribeMessageData, page, state, lang string) error {
	if !s.Configured() {
		return ErrWeChatNotConfigured
	}
	if openID == "" {
		return errors.New("缺少用户 openid")
	}
	if templateID == "" {
		return errors.New("未配置订阅消息模板 ID")
	}

	token, err := s.AccessToken()
	if err != nil {
		return err
	}

	if state == "" {
		state = "formal" // formal/release，trial/developer
	}
	if lang == "" {
		lang = "zh_CN"
	}

	payload := subscribeSendBody{
		ToUser:           openID,
		TemplateID:       templateID,
		Page:             page,
		Data:             data,
		MiniprogramState: state,
		Lang:             lang,
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("构造订阅消息失败: %w", err)
	}

	// access_token 放在 query 而非 header
	reqURL := s.subURL + "?access_token=" + url.QueryEscape(token)

	resp, err := s.client.Post(reqURL, "application/json", bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("发送订阅消息失败，请检查网络: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("读取订阅消息响应失败: %w", err)
	}

	var result SubscribeMessageResult
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("解析订阅消息响应失败: %w", err)
	}

	if result.ErrCode != 0 {
		return &SubscribeError{Code: result.ErrCode, Message: describeSubscribeErrCode(result.ErrCode, result.ErrMsg)}
	}

	return nil
}

// SubscribeError 订阅消息推送失败，携带原始错误码便于上层判断是否可重试
type SubscribeError struct {
	Code    int
	Message string
}

func (e *SubscribeError) Error() string {
	return e.Message
}

// IsQuotaExhausted 判断是否因为用户没有可用的订阅次数而失败。
// 这种情况不该重试，应等用户下次主动订阅。
func (e *SubscribeError) IsQuotaExhausted() bool {
	return e.Code == 43101
}

func describeSubscribeErrCode(code int, msg string) string {
	switch code {
	case 40003:
		return "用户 openid 无效"
	case 40037:
		return "订阅消息模板 ID 无效，请检查配置"
	case 43101:
		// 最常见的失败：用户没订阅，或上次订阅的额度已用完
		return "用户没有可用的订阅次数（一次性授权已消耗，需用户再次订阅）"
	case 47003:
		return "模板参数不匹配，请核对字段名与格式是否符合模板要求"
	case 41030:
		return "订阅消息跳转页面不存在，请检查 page 参数"
	case 45009:
		return "接口调用频次超限，请稍后再试"
	default:
		if msg != "" {
			return fmt.Sprintf("发送订阅消息失败：%s", msg)
		}
		return fmt.Sprintf("发送订阅消息失败（错误码 %d）", code)
	}
}
