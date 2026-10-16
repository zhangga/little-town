package database

import (
	"fmt"

	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func buildDSN(cfg *config.Config) string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DBHost,
		cfg.DBPort,
		cfg.DBUser,
		cfg.DBPassword,
		cfg.DBName,
		cfg.DBSSLMode,
	)
}

// InitDB 初始化数据库连接，SQL 日志全开（服务运行时的默认行为）
func InitDB(cfg *config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(buildDSN(cfg)), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	return db, nil
}

// InitDBSilent 初始化数据库连接，但只记录 Error 级别日志。
//
// 供导入等批处理脚本使用：一次导入要执行上百条 INSERT，
// 全量 SQL 日志会把真正的进度信息淹没，出问题时反而不好排查。
// 错误仍然会被记录，所以不会掩盖失败。
func InitDBSilent(cfg *config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(buildDSN(cfg)), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Error),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.User{},
		&models.Word{},
		&models.Building{},
		&models.UserBuilding{},
		&models.LearningRecord{},
		&models.ReviewSchedule{},
		&models.Subscription{},
	)
}
