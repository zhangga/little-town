package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/database"
	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

// 每行打印多少个单词。单词本身长度不齐，用固定宽度对齐才好看。
const wordsPerRow = 4

var verbose = flag.Bool("v", false, "显示 SQL 日志（排查导入问题时使用）")

func main() {
	flag.Parse()

	if err := godotenv.Load(); err != nil {
		fmt.Fprintln(os.Stderr, "提示：未找到 .env 文件，将使用系统环境变量")
	}

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		fatal("配置无效", err)
	}
	if err := cfg.ApplyTimeZone(); err != nil {
		fatal("时区配置无效", err)
	}

	// 默认静音 SQL 日志：一次导入要跑上百条 INSERT，
	// 全量日志会把进度信息淹掉
	var (
		db  *gorm.DB
		err error
	)
	if *verbose {
		db, err = database.InitDB(cfg)
	} else {
		db, err = database.InitDBSilent(cfg)
	}
	if err != nil {
		fatal("连接数据库失败", err)
	}
	acquired, err := database.WithLock(context.Background(), db, "schema-and-seed", 30*time.Second, func() error {
		return importAll(db, cfg)
	})
	if err != nil {
		fatal("数据导入失败", err)
	}
	if !acquired {
		fatal("等待数据导入锁超时", fmt.Errorf("another instance is initializing data"))
	}
}

func importAll(db *gorm.DB, cfg *config.Config) error {
	if err := database.AutoMigrate(db); err != nil {
		fatal("初始化数据库表失败", err)
	}

	fmt.Println()
	fmt.Println("小小镇 · 数据导入")
	fmt.Printf("数据库 %s:%s/%s\n", cfg.DBHost, cfg.DBPort, cfg.DBName)

	wordStats, err := importWords(db, "data/words/grade-1-3.json")
	if err != nil {
		fatal("导入单词失败", err)
	}

	buildingStats, err := importBuildings(db, "data/buildings.json")
	if err != nil {
		fatal("导入建筑失败", err)
	}

	// 汇总：只在非零时显示，避免一堆 "更新 0"
	summary := func(label string, total, added, updated, skipped int) {
		line := fmt.Sprintf("%s %d", label, total)
		if added > 0 {
			line += fmt.Sprintf("   新增 %d", added)
		}
		if updated > 0 {
			line += fmt.Sprintf("   更新 %d", updated)
		}
		if skipped > 0 {
			line += fmt.Sprintf("   未变 %d", skipped)
		}
		fmt.Println(line)
	}

	fmt.Println()
	fmt.Println(strings.Repeat("─", 46))

	summary("单词", wordStats.Total, wordStats.Added, wordStats.Updated, wordStats.Skipped)
	summary("建筑", buildingStats.Total, buildingStats.Added, buildingStats.Updated, buildingStats.Skipped)

	if wordStats.Errors+buildingStats.Errors > 0 {
		fmt.Printf("失败 %d 条（详见上方 ✗ 标记）\n", wordStats.Errors+buildingStats.Errors)
	}

	fmt.Println(strings.Repeat("─", 46))

	changed := wordStats.Added + wordStats.Updated + buildingStats.Added + buildingStats.Updated
	if changed > 0 {
		fmt.Println("导入完成。可以启动后端了：go run cmd/server/main.go")
	} else {
		fmt.Println("数据已是最新，没有任何改动。")
	}
	fmt.Println()
	if wordStats.Errors+buildingStats.Errors > 0 {
		return fmt.Errorf("some seed records failed to import")
	}
	return nil
}

// Stats 导入统计
type Stats struct {
	Total   int
	Added   int
	Updated int
	Skipped int
	Errors  int
}

func importWords(db *gorm.DB, path string) (Stats, error) {
	var stats Stats

	raw, err := os.ReadFile(path)
	if err != nil {
		return stats, fmt.Errorf("读取 %s: %w", path, err)
	}

	var words []models.Word
	if err := json.Unmarshal(raw, &words); err != nil {
		return stats, fmt.Errorf("解析 %s: %w", path, err)
	}
	stats.Total = len(words)

	// 列宽按实际最长词条计算，而不是写死。
	// 否则遇到 "ice cream" 这类长词条会撑破列宽，整行错位。
	wordWidth, transWidth := 0, 0
	for _, w := range words {
		if n := displayWidth(w.Word); n > wordWidth {
			wordWidth = n
		}
		if n := displayWidth(w.Translation); n > transWidth {
			transWidth = n
		}
	}
	wordWidth += 2 // 留出间隙
	transWidth += 2

	fmt.Println()
	fmt.Printf("单词库 %s（%d 个）\n", path, len(words))

	// 按年级分组展示
	byGrade := map[int][]models.Word{}
	var grades []int
	for _, w := range words {
		if _, seen := byGrade[w.Grade]; !seen {
			grades = append(grades, w.Grade)
		}
		byGrade[w.Grade] = append(byGrade[w.Grade], w)
	}
	// 年级升序
	for i := 0; i < len(grades); i++ {
		for j := i + 1; j < len(grades); j++ {
			if grades[j] < grades[i] {
				grades[i], grades[j] = grades[j], grades[i]
			}
		}
	}

	for _, grade := range grades {
		fmt.Printf("\n  %d 年级\n", grade)

		cells := make([]string, 0, len(byGrade[grade]))
		for _, w := range byGrade[grade] {
			result, err := upsertWord(db, w)

			// 生成单元格，如 "apple     苹果   ✓ "
			// 末尾统一补一个空格做列间距：padRight 只保证最小宽度，
			// 像 "ice cream" 这种刚好占满的词条后面会没有间隔
			mark := "✓"
			switch result {
			case resultAdded:
				stats.Added++
			case resultUpdated:
				stats.Updated++
				mark = "↑"
			case resultSkipped:
				stats.Skipped++
				mark = "·" // 已存在，用更轻的符号，避免误以为又插了一次
			case resultFailed:
				stats.Errors++
				mark = "✗"
			}

			cells = append(cells, fmt.Sprintf("%s %s %s ",
				padRight(w.Word, wordWidth), padRight(w.Translation, transWidth), mark))

			if err != nil {
				// 单条失败不中断整批，最后汇总里会体现
				fmt.Printf("      %s\n", err.Error())
			}
		}

		printGrid(cells, wordsPerRow)
	}

	return stats, nil
}

func importBuildings(db *gorm.DB, path string) (Stats, error) {
	var stats Stats

	raw, err := os.ReadFile(path)
	if err != nil {
		return stats, fmt.Errorf("读取 %s: %w", path, err)
	}

	var buildings []models.Building
	if err := json.Unmarshal(raw, &buildings); err != nil {
		return stats, fmt.Errorf("解析 %s: %w", path, err)
	}
	stats.Total = len(buildings)

	// 建筑名同样按最长者对齐
	nameWidth := 0
	for _, b := range buildings {
		if n := displayWidth(b.Name); n > nameWidth {
			nameWidth = n
		}
	}
	nameWidth += 2

	fmt.Println()
	fmt.Printf("建筑 %s（%d 种）\n", path, len(buildings))
	fmt.Println()

	for _, b := range buildings {
		result, err := upsertBuilding(db, b)
		mark := "✓"
		switch result {
		case resultAdded:
			stats.Added++
		case resultUpdated:
			stats.Updated++
			mark = "↑" // 已有记录，但价格/等级等内容被更新
		case resultSkipped:
			stats.Skipped++
			mark = "·"
		case resultFailed:
			stats.Errors++
			mark = "✗"
		}

		// 建筑信息比单词多，一行一个更清楚
		fmt.Printf("  %s  %s  需要 %2d 块砖  Lv.%d 解锁\n",
			mark, padRight(b.Name, nameWidth), b.CostBricks, b.UnlockLevel)

		if err != nil {
			fmt.Printf("      %s\n", err.Error())
		}
	}

	return stats, nil
}

type upsertResult int

const (
	resultAdded upsertResult = iota
	resultSkipped
	resultUpdated
	resultFailed
)

func upsertWord(db *gorm.DB, w models.Word) (upsertResult, error) {
	var existing models.Word
	err := db.Where("word = ? AND grade = ?", w.Word, w.Grade).First(&existing).Error

	if err == nil {
		return resultSkipped, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return resultFailed, fmt.Errorf("查询 %s 失败: %w", w.Word, err)
	}

	if err := db.Create(&w).Error; err != nil {
		return resultFailed, fmt.Errorf("写入 %s 失败: %w", w.Word, err)
	}
	return resultAdded, nil
}

func upsertBuilding(db *gorm.DB, b models.Building) (upsertResult, error) {
	var existing models.Building
	err := db.Where("name = ?", b.Name).First(&existing).Error

	if err == nil {
		// 已存在时同步可变的展示与定价字段。
		// 建筑价格是需要迭代平衡的数值，如果这里直接跳过，
		// 改了 buildings.json 却看不到任何效果，会很难排查。
		changed := existing.CostBricks != b.CostBricks ||
			existing.UnlockLevel != b.UnlockLevel ||
			existing.Description != b.Description ||
			existing.ImageURL != b.ImageURL

		if !changed {
			return resultSkipped, nil
		}

		existing.CostBricks = b.CostBricks
		existing.UnlockLevel = b.UnlockLevel
		existing.Description = b.Description
		existing.ImageURL = b.ImageURL
		if err := db.Save(&existing).Error; err != nil {
			return resultFailed, fmt.Errorf("更新 %s 失败: %w", b.Name, err)
		}
		return resultUpdated, nil
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return resultFailed, fmt.Errorf("查询 %s 失败: %w", b.Name, err)
	}

	if err := db.Create(&b).Error; err != nil {
		return resultFailed, fmt.Errorf("写入 %s 失败: %w", b.Name, err)
	}
	return resultAdded, nil
}

// displayWidth 返回字符串在等宽终端里的显示宽度。
// 中文、emoji 等占 2 列，其余占 1 列，否则中英混排时列会歪。
// 这是一个近似实现：足够应付单词表里的字符，不处理组合字符等复杂情况。
func displayWidth(s string) int {
	w := 0
	for _, r := range s {
		if r > 0x2000 {
			w += 2
		} else {
			w++
		}
	}
	return w
}

// padRight 按显示宽度右侧补空格
func padRight(s string, width int) string {
	w := displayWidth(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

// printGrid 按每行 n 列打印
func printGrid(cells []string, n int) {
	for i, c := range cells {
		if i%n == 0 {
			fmt.Print("    ")
		}
		fmt.Print(c)
		if i%n == n-1 || i == len(cells)-1 {
			fmt.Println()
		}
	}
}

func fatal(msg string, err error) {
	fmt.Fprintf(os.Stderr, "\n✗ %s: %v\n\n", msg, err)
	os.Exit(1)
}
