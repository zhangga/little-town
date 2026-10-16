package services

import "time"

// DayStart 返回本地时区当天零点。
//
// 不能用 time.Now().Truncate(24 * time.Hour)：那是按 UTC 截断的，
// 在 UTC+8 会得到本地早上 8 点而不是零点。后果是「今日学习」的统计窗口
// 从早上 8 点开始——凌晨学的单词不算数，早上 8 点前的打开会被归到昨天，
// 连续打卡天数还会在 8 点前后跳变。
func DayStart(t time.Time) time.Time {
	y, m, d := t.Local().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Local().Location())
}

// DayStartOffset 返回本地时区「今天 + offset 天」的零点。
// offset 为负表示往前推。
func DayStartOffset(t time.Time, offset int) time.Time {
	return DayStart(t).AddDate(0, 0, offset)
}

// DayEnd 返回本地时区当天 23:59:59.999…（即次日零点）
func DayEnd(t time.Time) time.Time {
	return DayStart(t).AddDate(0, 0, 1)
}

// TodayString 返回本地日期字符串（YYYY-MM-DD），用于跨天判断的存储与比较
func TodayString() string {
	return time.Now().Format("2006-01-02")
}
