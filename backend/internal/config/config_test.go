package config

import (
	"strings"
	"testing"
	"time"
)

func cleanEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{"ENV", "DEPLOY_TARGET", "SERVER_PORT", "PORT", "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME", "MYSQL_ADDRESS", "MYSQL_USERNAME", "MYSQL_PASSWORD", "MYSQL_DATABASE", "DB_TLS", "DB_TIMEZONE", "APP_TIMEZONE", "DB_MAX_OPEN", "DB_MAX_IDLE", "DB_CONN_MAX_LIFETIME", "JWT_SECRET", "WECHAT_APPID", "WECHAT_SECRET", "LOG_TO_FILE", "PUSH_ENABLED", "JOB_TOKEN", "AUTO_MIGRATE", "DAILY_WORD_COUNT"} {
		t.Setenv(key, "")
	}
}

func TestLocalDefaults(t *testing.T) {
	cleanEnv(t)
	cfg := Load()
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	if cfg.ServerPort != "8080" || cfg.DBPort != "3306" || cfg.DBName != "littletown_db" || !cfg.LogToFile || !cfg.PushEnabled {
		t.Fatalf("local defaults changed: port=%s db=%s logs=%t push=%t", cfg.ServerPort, cfg.DBName, cfg.LogToFile, cfg.PushEnabled)
	}
	if cfg.DailyWordCount != 10 {
		t.Fatalf("default learning round must contain ten words: %d", cfg.DailyWordCount)
	}
}

func TestCloudRunVariablesAndOverrides(t *testing.T) {
	cleanEnv(t)
	t.Setenv("DEPLOY_TARGET", "cloudrun")
	t.Setenv("ENV", "production")
	t.Setenv("MYSQL_ADDRESS", "10.0.1.2:3307")
	t.Setenv("MYSQL_USERNAME", "cloud-user")
	t.Setenv("MYSQL_PASSWORD", "cloud-password")
	t.Setenv("JWT_SECRET", strings.Repeat("j", 40))
	t.Setenv("WECHAT_APPID", "wxbd8f4a305320e623")
	t.Setenv("WECHAT_SECRET", strings.Repeat("w", 32))
	cfg := Load()
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	if cfg.ServerPort != "80" || cfg.DBHost != "10.0.1.2" || cfg.DBPort != "3307" || cfg.DBUser != "cloud-user" || cfg.DBPassword != "cloud-password" || cfg.DBName != "golang_demo" || cfg.PushEnabled || cfg.LogToFile {
		t.Fatal("cloud aliases, template database, or cloud runtime defaults are wrong")
	}
	t.Setenv("MYSQL_DATABASE", "existing-cloud-db")
	t.Setenv("PORT", "9000")
	if cfg = Load(); cfg.DBName != "existing-cloud-db" || cfg.ServerPort != "9000" {
		t.Fatal("platform variables were ignored")
	}
	t.Setenv("DB_HOST", "custom-mysql")
	t.Setenv("DB_PORT", "3308")
	t.Setenv("DB_NAME", "custom-db")
	t.Setenv("SERVER_PORT", "8080")
	if cfg = Load(); cfg.DBHost != "custom-mysql" || cfg.DBPort != "3308" || cfg.DBName != "custom-db" || cfg.ServerPort != "8080" {
		t.Fatal("explicit DB_* / SERVER_PORT should take precedence")
	}
}

func TestProductionRejectsMissingCredentials(t *testing.T) {
	cleanEnv(t)
	t.Setenv("ENV", "production")
	if err := Load().Validate(); err == nil {
		t.Fatal("production accepted the default JWT secret")
	}
	t.Setenv("JWT_SECRET", strings.Repeat("j", 40))
	if err := Load().Validate(); err == nil {
		t.Fatal("production accepted mock login")
	}
	t.Setenv("WECHAT_APPID", "wxbd8f4a305320e623")
	t.Setenv("WECHAT_SECRET", strings.Repeat("w", 32))
	if err := Load().Validate(); err == nil {
		t.Fatal("production accepted missing database password")
	}
	t.Setenv("DB_PASSWORD", "real-db-password")
	if err := Load().Validate(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("JWT_SECRET", "replace_with_a_random_secret_at_least_32_characters")
	if err := Load().Validate(); err == nil {
		t.Fatal("production accepted a template placeholder")
	}
}

func TestTimeZoneAndInvalidRuntimeSettings(t *testing.T) {
	cleanEnv(t)
	old := time.Local
	t.Cleanup(func() { time.Local = old })
	if err := Load().ApplyTimeZone(); err != nil {
		t.Fatal(err)
	}
	if time.Local.String() != "Asia/Shanghai" {
		t.Fatal("business clock must not follow container UTC")
	}
	for _, setting := range [][2]string{{"SERVER_PORT", "bad"}, {"APP_TIMEZONE", "unknown/zone"}, {"DB_MAX_OPEN", "1"}, {"DEPLOY_TARGET", "unknown"}, {"JOB_TOKEN", "short"}} {
		t.Run(setting[0], func(t *testing.T) {
			t.Setenv(setting[0], setting[1])
			if err := Load().Validate(); err == nil {
				t.Fatal("invalid runtime configuration was accepted")
			}
		})
	}
}
