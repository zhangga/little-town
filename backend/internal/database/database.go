package database

import (
	"fmt"
	"net"
	"time"
	_ "time/tzdata"

	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func buildDSN(cfg *config.Config) (string, error) {
	location, err := time.LoadLocation(cfg.DBTimeZone)
	if err != nil {
		return "", fmt.Errorf("invalid DB_TIMEZONE %q: %w", cfg.DBTimeZone, err)
	}

	dsn := mysqldriver.NewConfig()
	dsn.User = cfg.DBUser
	dsn.Passwd = cfg.DBPassword
	dsn.Net = "tcp"
	dsn.Addr = net.JoinHostPort(cfg.DBHost, cfg.DBPort)
	dsn.DBName = cfg.DBName
	dsn.ParseTime = true
	dsn.Loc = location
	dsn.TLSConfig = cfg.DBTLS
	dsn.Collation = "utf8mb4_bin"
	dsn.Timeout = 5 * time.Second
	dsn.ReadTimeout = 10 * time.Second
	dsn.WriteTimeout = 10 * time.Second
	// 使用数字偏移，兼容未安装时区表的云数据库；读写和 DATE() 统计使用同一时区。
	dsn.Params = map[string]string{
		"charset":   "utf8mb4",
		"time_zone": "'" + time.Now().In(location).Format("-07:00") + "'",
	}
	return dsn.FormatDSN(), nil
}

// InitDB 初始化数据库连接；开发记录 SQL，生产仅记录慢查询与错误。
func InitDB(cfg *config.Config) (*gorm.DB, error) {
	level := logger.Info
	if cfg.Env == "production" {
		level = logger.Warn
	}
	return open(cfg, level)
}

// InitDBSilent 初始化数据库连接，但只记录 Error 级别日志。
//
// 供导入等批处理脚本使用：一次导入要执行上百条 INSERT，
// 全量 SQL 日志会把真正的进度信息淹没，出问题时反而不好排查。
// 错误仍然会被记录，所以不会掩盖失败。
func InitDBSilent(cfg *config.Config) (*gorm.DB, error) {
	return open(cfg, logger.Error)
}

func open(cfg *config.Config, level logger.LogLevel) (*gorm.DB, error) {
	dsn, err := buildDSN(cfg)
	if err != nil {
		return nil, err
	}
	precision := 6 // 保留学习记录和复习计划的微秒时间精度。
	db, err := gorm.Open(mysql.New(mysql.Config{DSN: dsn, DefaultDatetimePrecision: &precision}), &gorm.Config{
		Logger: logger.Default.LogMode(level),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(cfg.DBMaxOpen)
	sqlDB.SetMaxIdleConns(cfg.DBMaxIdle)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.DBConnMaxLifetimeSec) * time.Second)
	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin").AutoMigrate(
		&models.User{},
		&models.Word{},
		&models.Building{},
		&models.UserBuilding{},
		&models.LearningRecord{},
		&models.ReviewSchedule{},
		&models.Subscription{},
		&models.Resident{},
		&models.ResidentItem{},
		&models.ResidentStudy{},
		&models.PracticeRound{},
		&models.TownPet{},
		&models.TownEvent{},
	)
}
