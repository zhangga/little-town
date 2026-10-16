package database

import (
	"context"
	"crypto/sha256"
	"database/sql/driver"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// WithLock 使用独立连接持有 MySQL 命名锁，协调所有副本的建表/导入或每日任务。
// wait=0 时拿不到锁立即返回 false；连接断开后 MySQL 自动释放锁。
func WithLock(ctx context.Context, db *gorm.DB, name string, wait time.Duration, run func() error) (bool, error) {
	sqlDB, err := db.DB()
	if err != nil {
		return false, err
	}
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return false, err
	}
	defer conn.Close()
	var dbName string
	if err := conn.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&dbName); err != nil {
		return false, err
	}
	sum := sha256.Sum256([]byte(dbName + ":" + name))
	key := fmt.Sprintf("little-town:%x", sum[:16])
	deadline := time.Now().Add(wait)
	for {
		var acquired int
		if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK(?, 0)", key).Scan(&acquired); err != nil {
			return false, err
		}
		if acquired == 1 {
			break
		}
		if wait <= 0 || time.Now().After(deadline) {
			return false, nil
		}
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
	defer func() {
		releaseCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if _, err := conn.ExecContext(releaseCtx, "SELECT RELEASE_LOCK(?)", key); err != nil {
			// 不把可能仍持锁的连接放回连接池。
			_ = conn.Raw(func(interface{}) error { return driver.ErrBadConn })
		}
	}()
	return true, run()
}
