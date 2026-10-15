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

	// 学习配置
	ReviewIntervals  []int // 艾宾浩斯复习间隔（分钟）
	DailyWordCount   int

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

		ReviewIntervals: parseIntSlice(getEnv("REVIEW_INTERVALS", "1,10,60,1440,10080")),
		DailyWordCount:  getEnvInt("DAILY_WORD_COUNT", 5),

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
