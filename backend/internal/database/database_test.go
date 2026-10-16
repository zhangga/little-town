package database

import (
	"net"
	"testing"
	"time"

	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/zhangga/little-town/backend/internal/config"
)

func TestBuildDSN(t *testing.T) {
	for _, host := range []string{"127.0.0.1", "::1"} {
		t.Run(host, func(t *testing.T) {
			cfg := &config.Config{
				DBHost: host, DBPort: "3306", DBName: "littletown_db",
				DBUser: "littletown", DBPassword: "p@ss:word/?&=字",
				DBTimeZone: "Asia/Shanghai", DBTLS: "true",
			}
			dsn, err := buildDSN(cfg)
			if err != nil {
				t.Fatal(err)
			}
			parsed, err := mysqldriver.ParseDSN(dsn)
			if err != nil {
				t.Fatal(err)
			}
			if parsed.User != cfg.DBUser || parsed.Passwd != cfg.DBPassword || parsed.DBName != cfg.DBName {
				t.Fatal("connection credentials did not survive DSN formatting")
			}
			if parsed.Net != "tcp" || parsed.Addr != net.JoinHostPort(host, "3306") {
				t.Fatal("database host/port did not survive DSN formatting")
			}
			if !parsed.ParseTime || parsed.Loc.String() != "Asia/Shanghai" || parsed.Params["time_zone"] != "'+08:00'" {
				t.Fatal("datetime parsing and session timezone must agree")
			}
			if parsed.Params["charset"] != "utf8mb4" || parsed.Collation != "utf8mb4_bin" || parsed.TLSConfig != "true" {
				t.Fatal("unicode, case sensitivity, or TLS settings were lost")
			}
			if parsed.Timeout != 5*time.Second || parsed.ReadTimeout == 0 || parsed.WriteTimeout == 0 {
				t.Fatal("database connections must have finite timeouts")
			}
		})
	}
}

func TestBuildDSNRejectsUnknownTimeZone(t *testing.T) {
	if _, err := buildDSN(&config.Config{DBTimeZone: "not/a/timezone"}); err == nil {
		t.Fatal("expected invalid timezone to fail before opening a connection")
	}
}
