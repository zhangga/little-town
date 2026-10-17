# 自由复习整轮奖励 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 自由复习每完成一轮获得 4 砖块、12 金币，每个自然日最多奖励 3 轮。

**Architecture:** 后端为题组签发绑定用户、日期和单词的票据；逐题保存本轮进度，整轮结束后在用户行锁事务中结算。新表持久化已完成和已奖励状态；每日限额独立于正常学习奖励，不修改复习计划或成长。当天已领奖的到期词不再重复下发普通任务，仍可进入自由复习。前端完成配对后结算，失败后可用同一票据手动重试，不自动重复发奖。

**Tech Stack:** Go / Gin / GORM / MySQL 8.4 / JWT v5；原生微信小程序 JavaScript / WXML；Node test runner。

---

### Task 1: 后端整轮记录和奖励

**Files:** Create `backend/internal/models/practice.go`, `backend/internal/services/practice.go`, `backend/internal/services/practice_test.go`, `backend/internal/handlers/practice.go`; modify `backend/internal/database/database.go`, `backend/internal/router/router.go`, `backend/internal/handlers/learn.go`.

- [x] 先编写票据隔离、未完成拒绝、重复单词不增加进度、并发结算只发一次、每日第 4 轮不发奖、隔日额度重置的回归测试。
- [x] 执行 `cd backend && go test ./internal/services -run TestPractice -count=1`，确认新服务不存在时测试失败。
- [x] 实现签名题组票据、进度记录、整轮结算与每日状态；金额只由服务端常量决定：4 / 12 / 3。
- [x] 新增 `POST /learn/practice/answer` 和 `POST /learn/practice/complete`。`GET /learn/daily-words` 在自由复习时返回票据与奖励状态。所有写入先锁用户行，与现有消费接口串行。
- [x] 在独立 `littletown_test_` 数据库运行真实 MySQL 回归，不使用应用数据库。

### Task 2: 小程序流程

**Files:** Modify `miniapp/pages/learn/learn.js`, `miniapp/pages/learn/learn.wxml`, `scripts/learning-test.cjs`.

- [x] 测试自由复习逐题保存但不发单题奖励，完成配对后才结算，重复结束不提交第二次。
- [x] 测试结算超时后保留同一票据、手动查询结算结果、离开页面后的回调不覆盖下一轮状态。
- [x] 显示每轮奖励、每日剩余轮数、结算中、奖励已到账、额度用完；钱包使用服务端余额。
- [x] 执行 `node --test scripts/learning-test.cjs scripts/building-test.cjs scripts/resident-test.cjs`，验证原学习和消费流程。

### Task 3: 交付验证

**Files:** Modify `docs/learning-modes.md`, `docs/resident-growth.md`, `docs/api.md`.

- [x] 更新奖励规则、接口参数及升级说明：需重启后端自动创建新表，并重新编译小程序。
- [x] 执行 `go test -p 1 ./...` 和 JavaScript 回归；检查差异和页面模板编译。
- [x] 在独立 MySQL 上通过 Gin HTTP 集成测试确认接口、鉴权、错误参数和重放行为；保留用户当前数据库及调试进程。
- [x] 给出用户验证步骤和测试结果，不发布云端或上传小程序。
