# 商店补给与流动居民 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.
>
> 本次按用户已授权的修改直接在当前会话实施，保留工作区已有的自由摆放、村民素材与角色区分修改。

**Goal:** 点击建筑使用服务，以金币购买并吃喝补给；居民从镇外进入，逛街后离开，由不同身份的新居民接替。

**Architecture:** 金币、饱食度和水分由后端同一用户行锁事务持久化；补给消费带幂等请求标识。页面展示服务端价格和状态，使用现有消费互斥及超时只读回逻辑。访客作为散步模块内的临时演员，从地图外沿草地通道进入并退出，不生成消费请求。

**Tech Stack:** Go / GORM / MySQL，微信小程序 JS / WXML / WXSS，Node 原生测试与微信编译器。

---

### Task 1: 补给与需求

**Files:**
- Create: `backend/internal/services/town_shop.go`, `backend/internal/services/town_shop_test.go`
- Modify: `backend/internal/models/town_life.go`, `backend/internal/database/database.go`, `backend/internal/services/town_life.go`, `backend/internal/handlers/town_life.go`, `backend/internal/router/router.go`
- Test: `backend/internal/handlers/town_shop_integration_test.go`

- [x] 定义并测试需求规则：拥有商店或餐厅才启用；初始 70/70；每分钟饱食度 -1、水分 -2；最低 20、最高 100；使用整分钟保留零头，时钟倒退不递减。
- [x] 持久化 `TownNeeds{UserID, Food, Water, CheckedAt}` 和 `TownSupplyPurchase{UserID, RequestID, ItemID, CreatedAt}`；注册迁移。
- [x] 商品配置固定为服务端数据：`bread / 商店 / 2 金币 / 食物 +40`、`water / 商店 / 1 金币 / 水分 +50`、`meal / 餐厅 / 3 金币 / 食物 +60、水分 +30`。
- [x] `GET /town-life` 返回 `needs` 和 `supplies`；`POST /town-life/supplies/purchase` 接收 `item_id`、`request_id`，在用户行锁事务内检查建筑、余额、重复请求、是否需要补充，然后扣金币、恢复需求并记录购买。相同请求不重复消费，不同商品复用同一请求拒绝。
- [x] 运行 `cd backend && go test -p 1 ./...`，并在独立 `littletown_test_*` MySQL 库验证并发重复购买、断线重读、持久化、账号隔离、未建商店和零余额拒绝。

### Task 2: 点击建筑使用功能

**Files:**
- Create: `miniapp/utils/town-shop.js`, `scripts/town-shop-test.cjs`
- Modify: `miniapp/pages/index/index.js`, `miniapp/pages/index/index.wxml`, `miniapp/pages/index/index.wxss`, `miniapp/utils/town-life.js`, `scripts/town-life-test.cjs`

- [x] 新增饱食、水分条与补给入口；页面可见时每分钟读取需求，隐藏和卸载时取消计时器，编辑布局和消费期间跳过刷新。
- [x] 点击商店/餐厅打开商品面板：大图标、明确价格、恢复数量、当前金币；按钮显示「买来吃/喝」，购买立即消费，满值时不买，余额不足前往学习。
- [x] 医院、消防站、宠物医院、警察局等打开建筑时显示与它对应的待办和服务按钮；学校、图书馆提供学习入口；其余建筑可从入口前往实际散步活动。
- [x] 每次主动购买产生独立请求标识；连续点击互斥，网络结果不明只读最新状态，禁止后台自动扣费。
- [x] 前端回归覆盖进入建筑不扣款、购买改变需求和余额、满值/不足不提交、并发点击、超时读回、页面隐藏和布局编辑。

### Task 3: 居民往来

**Files:**
- Modify: `miniapp/utils/town-stroll.js`, `scripts/town-stroll-test.cjs`

- [x] 保留现有老年人、成年人、孩子图集；普通村民改成拥有唯一访问身份的临时访客，小镇长和宠物仍为常住演员。
- [x] 四个访客名额分时从左右边缘以外入镇；沿建筑间草地行走，完成若干站后出镇。离场身份从演员列表移除，短暂停顿后换不同类型和名字的新访客。
- [x] 钱包/需求刷新不重置路线，购买宠物不让已离开的访客重现；换布局重新规划，隐藏/卸载清理全部定时器。
- [x] 假时钟推进多轮进出，验证方向、边缘起止、人数上限、身份不复用、小镇长宠物保留和资源不变。

### Task 4: 验证与说明

- [x] 运行 `node --test scripts/*test.cjs` 和 `cd backend && go test -p 1 ./...`。
- [x] 用微信开发者工具的 `wcc`/`wcsc` 编译页面及模板。
- [x] 在 375px、320px 浏览器预览检查商店、扣币反馈、需求条与居民进出，保存 `output/town-shop-preview.png`。
- [x] 更新 `docs/town-life.md` 的规则、接口、迁移和验证证据；不提交或发布线上。

实施完成：107 项前端测试通过；Go 全量测试通过；独立 MySQL 库中的商店与生活集成测试通过；微信编译和 375px／320px 浏览器检查通过。当前为本地代码与演示验证，尚未发布或进行微信真机验收。
