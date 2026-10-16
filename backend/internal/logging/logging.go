package logging

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// dailyWriter 把写入的内容追加到「按天命名」的文件中。
//
// 设计要点：
//   1. 文件句柄常驻，不在每次写入时开关文件——访问日志写入频繁，
//      反复 open/close 是没必要的系统开销。
//   2. 写入时检查日期是否跨天，跨天则切到新文件。因此一个长期运行的
//      进程也会自然按天切分，不需要依赖重启。
//   3. 文件写入失败（磁盘满、权限问题）不应该让服务挂掉，
//      降级为只输出到终端，并记录一次错误。
type dailyWriter struct {
	mu       sync.Mutex
	dir      string
	prefix   string
	file     *os.File
	curDate  string
	failedAt time.Time // 上次写入失败的时间，用于避免错误日志刷屏
	failErr  error
}

func newDailyWriter(dir, prefix string) (*dailyWriter, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("创建日志目录 %s 失败: %w", dir, err)
	}
	w := &dailyWriter{dir: dir, prefix: prefix}
	if err := w.rotate(time.Now()); err != nil {
		return nil, err
	}
	return w, nil
}

// rotate 关闭当前文件并打开 date 对应的新文件。调用方需持有锁。
func (w *dailyWriter) rotate(t time.Time) error {
	date := t.Format("2006-01-02")
	if w.file != nil && w.curDate == date {
		return nil
	}

	if w.file != nil {
		_ = w.file.Close()
		w.file = nil
	}

	path := filepath.Join(w.dir, fmt.Sprintf("%s-%s.log", w.prefix, date))
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("打开日志文件 %s 失败: %w", path, err)
	}

	w.file = f
	w.curDate = date
	return nil
}

func (w *dailyWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// 跨天则切换文件
	if err := w.rotate(time.Now()); err != nil {
		w.noteFailure(err)
		// 报告写入成功，让上层的 log 包不中断输出；
		// 真实错误已记录在 failErr 中，由 StartupSummary 呈现
		return len(p), nil
	}

	if w.file == nil {
		return len(p), nil
	}

	n, err := w.file.Write(p)
	if err != nil {
		// 磁盘写满等情况：先截断文件指针再重试会掩盖问题，这里直接记录
		w.noteFailure(err)
	}

	// 此处不调用 Sync：每条日志都 fsync 会让写入慢几个数量级。
	// 进程被 kill 时最多丢失内核缓冲区中尚未落盘的内容，
	// 对开发日志而言这个风险可以接受。
	return n, err
}

func (w *dailyWriter) noteFailure(err error) {
	// 同一类错误一分钟内只记一次，避免日志刷屏
	if time.Since(w.failedAt) > time.Minute {
		w.failedAt = time.Now()
		w.failErr = err
	}
}

// LastError 返回最近一次写入错误（若在一分钟内）
func (w *dailyWriter) LastError() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.failErr != nil && time.Since(w.failedAt) <= time.Minute {
		return w.failErr
	}
	return nil
}

func (w *dailyWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file != nil {
		err := w.file.Close()
		w.file = nil
		return err
	}
	return nil
}

// CurrentPath 返回当前正在写入的文件路径
func (w *dailyWriter) CurrentPath() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.curDate == "" {
		return ""
	}
	return filepath.Join(w.dir, fmt.Sprintf("%s-%s.log", w.prefix, w.curDate))
}

// Logger 把标准输出与日志文件组合在一起
type Logger struct {
	fileWriter *dailyWriter
	dir        string
	keepDays   int
}

// Options 日志配置
type Options struct {
	Dir      string // 日志目录
	Prefix   string // 文件名前缀，如 app → app-2026-10-15.log
	KeepDays int    // 保留天数，0 或负数表示不清理
}

// Setup 初始化全局日志输出。
//
// 返回的 writer 已同时写入终端和文件，调用方应把它交给标准库
// log 包的 SetOutput，以及 gin.DefaultWriter，这样程序日志和
// 访问日志都会落盘。
func Setup(opts Options) (*Logger, io.Writer, error) {
	if opts.Dir == "" {
		opts.Dir = "./logs"
	}
	if opts.Prefix == "" {
		opts.Prefix = "app"
	}

	dw, err := newDailyWriter(opts.Dir, opts.Prefix)
	if err != nil {
		return nil, nil, err
	}

	l := &Logger{
		fileWriter: dw,
		dir:        opts.Dir,
		keepDays:   opts.KeepDays,
	}

	// 终端与文件同时输出：开发时看终端，排查历史问题时翻文件
	writer := io.MultiWriter(os.Stdout, dw)
	return l, writer, nil
}

// CleanupOldFiles 删除超过保留期的日志文件。启动时调用一次即可。
// 返回删除的文件数，方便启动日志中体现。
func (l *Logger) CleanupOldFiles() (int, error) {
	if l.keepDays <= 0 {
		return 0, nil
	}

	entries, err := os.ReadDir(l.dir)
	if err != nil {
		return 0, err
	}

	// cutoff 截断到当天零点再比较。
	// 不截断的话，cutoff 会带着当前时分秒（例如 16:30），
	// 而文件日期解析出来是当天 00:00 —— 于是「正好 keepDays 天前」的文件
	// 会被误判为过期，实际保留期比配置少一天。
	now := time.Now()
	cutoff := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).
		AddDate(0, 0, -l.keepDays)

	removed := 0
	var firstErr error

	// 按文件名排序，便于稳定输出
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		if !strings.HasPrefix(name, l.fileWriter.prefix+"-") || !strings.HasSuffix(name, ".log") {
			continue
		}

		// 从文件名解析日期：app-2026-10-15.log
		datePart := strings.TrimSuffix(strings.TrimPrefix(name, l.fileWriter.prefix+"-"), ".log")
		fileDate, err := time.Parse("2006-01-02", datePart)
		if err != nil {
			// 不是本程序生成的文件名，跳过而不是删除
			continue
		}

		if fileDate.Before(cutoff) {
			if err := os.Remove(filepath.Join(l.dir, name)); err != nil {
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
			removed++
		}
	}

	return removed, firstErr
}

// CurrentPath 当前日志文件路径
func (l *Logger) CurrentPath() string {
	return l.fileWriter.CurrentPath()
}

// LastError 最近一次写入错误
func (l *Logger) LastError() error {
	return l.fileWriter.LastError()
}

// Close 关闭底层文件
func (l *Logger) Close() error {
	return l.fileWriter.Close()
}
