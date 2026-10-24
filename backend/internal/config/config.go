package config

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

const DefaultDailyWordCount = 10

type Config struct {
	ServerPort   string
	ServerHost   string
	Env          string
	DeployTarget string
	TimeZone     string
	AutoMigrate  bool

	DBHost               string
	DBPort               string
	DBUser               string
	DBPassword           string
	DBName               string
	DBTLS                string
	DBTimeZone           string
	DBMaxOpen            int
	DBMaxIdle            int
	DBConnMaxLifetimeSec int

	JWTSecret      string
	JWTExpireHours int
	WechatAppID    string
	WechatSecret   string

	SubscribeTemplateID string
	SubscribePage       string
	PushHour            int
	PushEnabled         bool // 进程内调度；云托管默认关闭，由外部任务触发。
	PushBatchSize       int
	JobToken            string

	ReviewIntervals []int
	DailyWordCount  int
	LogToFile       bool
	LogDir          string
	LogKeepDays     int
	UploadPath      string
	MaxUploadSize   int64
}

func Load() *Config {
	target := getEnv("DEPLOY_TARGET", "local")
	env := getEnv("ENV", "development")
	defaultPort, defaultDB := "8080", "littletown_db"
	if target == "cloudrun" {
		defaultPort = "80"
		// 用户当前的官方 Go 模板已在此库中创建计数器；新增业务表不会修改计数器。
		defaultDB = "golang_demo"
	}
	host, port := "127.0.0.1", "3306"
	if address := os.Getenv("MYSQL_ADDRESS"); address != "" && os.Getenv("DB_HOST") == "" {
		if h, p, err := net.SplitHostPort(address); err == nil {
			host, port = h, p
		} else {
			host = address
		}
	}
	zone := getEnv("APP_TIMEZONE", "Asia/Shanghai")
	return &Config{
		ServerPort: getEnv("SERVER_PORT", getEnv("PORT", defaultPort)),
		ServerHost: getEnv("SERVER_HOST", "0.0.0.0"),
		Env:        env, DeployTarget: target, TimeZone: zone,
		AutoMigrate: getEnvBool("AUTO_MIGRATE", true),

		DBHost:               getEnv("DB_HOST", host),
		DBPort:               getEnv("DB_PORT", port),
		DBUser:               getEnv("DB_USER", getEnv("MYSQL_USERNAME", "littletown")),
		DBPassword:           getEnv("DB_PASSWORD", getEnv("MYSQL_PASSWORD", "")),
		DBName:               getEnv("DB_NAME", getEnv("MYSQL_DATABASE", defaultDB)),
		DBTLS:                getEnv("DB_TLS", "false"),
		DBTimeZone:           getEnv("DB_TIMEZONE", zone),
		DBMaxOpen:            getEnvInt("DB_MAX_OPEN", 10),
		DBMaxIdle:            getEnvInt("DB_MAX_IDLE", 5),
		DBConnMaxLifetimeSec: getEnvInt("DB_CONN_MAX_LIFETIME", 300),

		JWTSecret:      getEnv("JWT_SECRET", "your-secret-key"),
		JWTExpireHours: getEnvInt("JWT_EXPIRE_HOURS", 720),
		WechatAppID:    getEnv("WECHAT_APPID", ""),
		WechatSecret:   getEnv("WECHAT_SECRET", ""),

		SubscribeTemplateID: getEnv("SUBSCRIBE_TEMPLATE_ID", ""),
		SubscribePage:       getEnv("SUBSCRIBE_PAGE", "pages/learn/learn"),
		PushHour:            getEnvInt("PUSH_HOUR", 19),
		PushEnabled:         getEnvBool("PUSH_ENABLED", target != "cloudrun"),
		PushBatchSize:       getEnvInt("PUSH_BATCH_SIZE", 200),
		JobToken:            getEnv("JOB_TOKEN", ""),

		ReviewIntervals: parseIntSlice(getEnv("REVIEW_INTERVALS", "5,30,720,1440,2880,5760,10080,21600,43200")),
		DailyWordCount:  getEnvInt("DAILY_WORD_COUNT", DefaultDailyWordCount),
		LogToFile:       getEnvBool("LOG_TO_FILE", env != "production"),
		LogDir:          getEnv("LOG_DIR", "./logs"),
		LogKeepDays:     getEnvInt("LOG_KEEP_DAYS", 7),
		UploadPath:      getEnv("UPLOAD_PATH", "./uploads"),
		MaxUploadSize:   int64(getEnvInt("MAX_UPLOAD_SIZE", 5242880)),
	}
}

func (c *Config) Validate() error {
	if c.DeployTarget != "local" && c.DeployTarget != "cloudrun" && c.DeployTarget != "server" {
		return fmt.Errorf("DEPLOY_TARGET must be local, cloudrun or server")
	}
	if c.Env != "development" && c.Env != "production" {
		return fmt.Errorf("ENV must be development or production")
	}
	for name, value := range map[string]string{"SERVER_PORT": c.ServerPort, "DB_PORT": c.DBPort} {
		port, err := strconv.Atoi(value)
		if err != nil || port < 1 || port > 65535 {
			return fmt.Errorf("%s must be a valid TCP port", name)
		}
	}
	for name, value := range map[string]string{"APP_TIMEZONE": c.TimeZone, "DB_TIMEZONE": c.DBTimeZone} {
		if _, err := time.LoadLocation(value); err != nil {
			return fmt.Errorf("invalid %s: %w", name, err)
		}
	}
	if c.DBMaxOpen < 2 || c.DBMaxIdle < 0 || c.DBMaxIdle > c.DBMaxOpen || c.DBConnMaxLifetimeSec < 1 {
		return fmt.Errorf("invalid database pool: DB_MAX_OPEN >= 2, 0 <= DB_MAX_IDLE <= DB_MAX_OPEN, DB_CONN_MAX_LIFETIME > 0")
	}
	if c.PushHour < 0 || c.PushHour > 23 || c.PushBatchSize < 1 {
		return fmt.Errorf("invalid PUSH_HOUR or PUSH_BATCH_SIZE")
	}
	if c.JobToken != "" && (len(c.JobToken) < 32 || placeholder(c.JobToken)) {
		return fmt.Errorf("JOB_TOKEN must be a random secret of at least 32 characters")
	}
	if c.Env == "production" {
		if len(c.JWTSecret) < 32 || placeholder(c.JWTSecret) {
			return fmt.Errorf("production requires a random JWT_SECRET of at least 32 characters")
		}
		if c.WechatAppID == "" || c.WechatSecret == "" || placeholder(c.WechatAppID) || placeholder(c.WechatSecret) {
			return fmt.Errorf("production requires WECHAT_APPID and WECHAT_SECRET; mock login is development-only")
		}
		if c.DBPassword == "" || placeholder(c.DBPassword) {
			return fmt.Errorf("production requires DB_PASSWORD or MYSQL_PASSWORD")
		}
	}
	return nil
}

func (c *Config) ApplyTimeZone() error {
	location, err := time.LoadLocation(c.TimeZone)
	if err != nil {
		return err
	}
	time.Local = location
	return nil
}

func placeholder(value string) bool {
	return strings.HasPrefix(value, "your_") || strings.HasPrefix(value, "your-") || strings.HasPrefix(value, "change_") || strings.HasPrefix(value, "replace_")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return defaultValue
	}
}

func parseIntSlice(s string) []int {
	var result []int
	for _, part := range strings.Split(s, ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(part)); err == nil {
			result = append(result, n)
		}
	}
	return result
}
