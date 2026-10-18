# Free Town Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 免费拖动小镇建筑，提前展开铺满宽度的长地图，并保存每位用户的位置。

**Architecture:** 地图使用三列、至少六行的地块，行数按全部建筑图鉴预留。坐标以列、行为单位保存；旧四列像素位置在读取时归一化。首页提供自由摆放模式，拖动吸附、占用位置互换、点击选点、边缘滚动，完成后原子保存整个布局。位置更新只写位置字段，不写金币或砖块。

**Tech Stack:** 原生微信小程序 WXML/WXSS/JavaScript，Go/Gin/GORM，MySQL，Node test runner。

**Execution:** 用户已授权完成实现，直接在当前会话执行；不新建聊天，不自动提交或发布。

---

### Task 1: Layout domain and free persistence

**Files:** `backend/internal/services/town_layout.go`, `backend/internal/services/town_layout_test.go`, `backend/internal/models/models.go`, `backend/internal/handlers/building.go`, `backend/internal/handlers/building_layout.go`, `backend/internal/handlers/building_layout_integration_test.go`, `backend/internal/router/router.go`.

- [x] 定义三列、至少六行，始终为全部图鉴、小屋和额外一行预留位置。
- [x] 单元测试先覆盖旧坐标回退、保留有效位置、重叠回退和初始地图容量；运行 `go test ./internal/services -run TownLayout` 观察失败后实现归一化。
- [x] 用户模型增加 `TownHomeX`、`TownHomeY`，默认零且不暴露在用户资料中；已有建筑使用现有位置列。
- [x] 读取小镇返回 `layout`，建筑位置使用归一化结果；新建建筑占用第一块空地。
- [x] 新增登录保护的 `PUT /api/v1/buildings/layout`，请求使用完整快照：

```json
{"home":{"position_x":0,"position_y":0},"buildings":[{"id":1,"position_x":2,"position_y":4}]}
```

- [x] 在用户行锁事务内验证建筑归属、完整 ID 集合、边界及唯一地块，然后仅更新小屋和建筑位置。非法请求全部回滚；重复请求结果相同，金币和砖块均不变化。
- [x] 在独立 `littletown_test_` 数据库运行集成测试，覆盖移动、互换、重复保存、越权、遗漏、重复坐标、越界及移动后新建不覆盖建筑。

### Task 2: Full board and drag model

**Files:** `miniapp/utils/town-layout.js`, `miniapp/utils/town.js`, `miniapp/utils/town-stroll.js`, `scripts/town-layout-test.cjs`, `scripts/building-test.cjs`.

- [x] 新增纯布局函数，输出全部地块、小屋、绝对行列位置和固定地图高度；旧坐标及冲突按第一空位回退。
- [x] 用完整地块数组绘制至少 18 格，建设前后地块总数不变，图鉴增加才扩容。
- [x] 实现纯移动函数：空位移动、占位互换、原地不变，保留建筑数量和身份。
- [x] 实现触点与列行换算、范围约束和拖动样式，单元测试包括窄屏与已滚动坐标。
- [x] 散步目的地改为实际地块位置，换位后重新同步路线。

### Task 3: Layout mode and full-width presentation

**Files:** `miniapp/pages/index/index.js`, `miniapp/pages/index/index.wxml`, `miniapp/pages/index/index.wxss`, `scripts/town-life-test.cjs`.

- [x] 添加「自由摆放」设置，进入后暂停散步；提示「移动免费，不扣金币和砖块」。
- [x] 建筑和小屋均可拖动；松手吸附，目标占用则互换；也支持先点建筑再点目标地块。
- [x] 拖动靠近视口边缘自动滚动；未进入摆放模式时保留正常纵向滚动与建筑详情。
- [x] 完成后 PUT 保存，成功后退出；失败保留草稿供重试，取消恢复原布局。切后台不播放拖动动画、不丢弃未保存草稿。
- [x] 地图取消两侧外边距，所有空地一开始显示黄色底、虚线与加号；不按已建数量逐个增加空地。

### Task 4: Verification and delivery

**Files:** `docs/town-building.md`, `docs/api.md`.

- [x] 运行 `node --test scripts/town-layout-test.cjs scripts/building-test.cjs scripts/town-life-test.cjs scripts/town-stroll-test.cjs scripts/page-loading-test.cjs`。
- [x] 运行 `go test ./...`，并在专用 MySQL 测试库执行布局集成测试。
- [x] 使用本地 wcc/wcsc 编译首页、模板与样式；检查 320px、375px 的地图宽度、完整黄色空地和长地图。
- [x] 更新接口与使用说明，记录后端重启自动迁移要求和验证边界。
- [x] 检查 `git diff --check`，确认未加入扣金币或扣砖块逻辑。

## Verification results

- 36 项相关 Node 测试通过；`go test ./...` 通过。
- 专用 MySQL 测试库布局生命周期通过：零余额保存、互换、重试、非法请求不改变布局、新建避开已占位置。
- 首页和共享模板 WXML、全局和首页 WXSS 编译通过；编译后浏览器预览检查 375px、320px，18 格均存在、宽度无溢出、全部建筑名称无截断、图片全部加载。
- 本地后端已重编译并重启，`/ready` 返回 200，位置接口无登录返回 401；小屋字段自动迁移，全部现有用户金币和砖块在重启前后相同。
- 尚未进行微信真机触摸拖动验收。
