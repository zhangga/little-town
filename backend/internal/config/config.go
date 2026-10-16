package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	// 服务器配置
	ServerPort string
	ServerHost string
	Env        string

	// 数据库配置
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	// JWT 配置
	JWTSecret      string
	JWTExpireHours int

	// 微信配置
	WechatAppID  string
	WechatSecret string

	// 订阅消息
	// SubscribeTemplateID 在公众平台「订阅消息」里申请模板后获得。
	// 留空表示未启用推送，相关接口会返回 skipped 而不是报错。
	SubscribeTemplateID string
	// SubscribePage 用户点击订阅消息后跳转的页面路径
	SubscribePage string
	// PushHour 每日推送的小时（0-23，本地时区）
	PushHour int
	// PushEnabled 是否启用定时推送
	PushEnabled bool
	// PushBatchSize 单次调度最多推送多少人，避免一次性打满接口频次
	PushBatchSize int

	// 学习配置
	ReviewIntervals  []int // 艾宾浩斯复习间隔（分钟）
	DailyWordCount   int

	// 日志
	LogDir      string
	LogKeepDays int

	// 文件上传
	UploadPath     string
	MaxUploadSize  int64
}

func Load() *Config {
	cfg := &Config{
		ServerPort: getEnv("SERVER_PORT", "8080"),
		ServerHost: getEnv("SERVER_HOST", "0.0.0.0"),
		Env:        getEnv("ENV", "development"),

		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", ""),
		DBName:     getEnv("DB_NAME", "littletown_db"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),

		JWTSecret:      getEnv("JWT_SECRET", "your-secret-key"),
		JWTExpireHours: getEnvInt("JWT_EXPIRE_HOURS", 720),

		WechatAppID:  getEnv("WECHAT_APPID", ""),
		WechatSecret: getEnv("WECHAT_SECRET", ""),

		SubscribeTemplateID: getEnv("SUBSCRIBE_TEMPLATE_ID", ""),
		SubscribePage:       getEnv("SUBSCRIBE_PAGE", "pages/learn/learn"),
		PushHour:            getEnvInt("PUSH_HOUR", 19),
		PushEnabled:         getEnvBool("PUSH_ENABLED", true),
		PushBatchSize:       getEnvInt("PUSH_BATCH_SIZE", 200),

		ReviewIntervals: parseIntSlice(getEnv("REVIEW_INTERVALS", "5,30,720,1440,2880,5760,10080,21600,43200")),
		DailyWordCount:  getEnvInt("DAILY_WORD_COUNT", 5),

		LogDir:      getEnv("LOG_DIR", "./logs"),
		LogKeepDays: getEnvInt("LOG_KEEP_DAYS", 7),

		UploadPath:    getEnv("UPLOAD_PATH", "./uploads"),
		MaxUploadSize: int64(getEnvInt("MAX_UPLOAD_SIZE", 5242880)),
	}

	return cfg
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// getEnvBool 解析布尔配置。
// 接受常见的几种写法，避免因为写了 "1"/"yes" 而静默取到默认值。
func getEnvBool(key string, defaultValue bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return defaultValue
	}
	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		// 取值无法识别时保留默认值，而不是当作 false——
		// 后者会让「配置写错了」表现成「功能悄悄关掉了」
		return defaultValue
	}
}

func parseIntSlice(s string) []int {
	parts := strings.Split(s, ",")
	result := make([]int, 0, len(parts))
	for _, part := range parts {
		if val, err := strconv.Atoi(strings.TrimSpace(part)); err == nil {
			result = append(result, val)
		}
	}
	return result
}
