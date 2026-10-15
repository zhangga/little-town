package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const defaultCode2SessionEndpoint = "https://api.weixin.qq.com/sns/jscode2session"

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

// WeChatService 封装微信小程序服务端接口
type WeChatService struct {
	appID     string
	appSecret string
	endpoint  string
	client    *http.Client
}

func NewWeChatService(appID, appSecret string) *WeChatService {
	return &WeChatService{
		appID:     appID,
		appSecret: appSecret,
		endpoint:  defaultCode2SessionEndpoint,
		// 微信接口偶发慢响应，超时短一点，避免登录请求堆积
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
