# 第一人称方块世界 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 把“我的家”接入能上下楼、购买和搬放家具、挖掘建造、合成传送门并探索异世界的第一人称方块沙盒。

**Architecture:** 在 home 分包增加独立 world 页面，复用已购买家具模型和现有商场。纯数据世界负责地层、碰撞、采集、合成、所有权及序列化；分块网格负责 WebGL 画面；页面负责触控、键盘、背包与生命周期。世界修改按后端环境与账号保存在本机，购买继续由服务端确认。

**Tech Stack:** 原生微信小程序 WXML/WXSS、CommonJS、现有 Three.js r108、Node test、微信模板编译器、Chrome。

---

### Task 1: 世界规则和存档

**Files:** Create `miniapp/home/utils/sandbox-catalog.js`, `miniapp/home/utils/sandbox-world.js`, `scripts/sandbox-test.cjs`.

- [x] 定义草地、泥土、岩石、煤铁和奇异矿石、不可破坏的黑色基岩；世界边界为有限方块地图。
- [x] 生成与房屋等级相符的实际楼层（1/1/2/2/3 层）和可行走楼梯，保留初始家，生成草地、树、矿洞及实体商店入口。
- [x] 实现挖掘掉落、背包扣除、方块放置、家具所有权检查、开关门、房屋图纸和跨维度传送。
- [x] 实现账号隔离的存档校验与恢复。用 `node --test scripts/sandbox-test.cjs` 验证资源守恒、碰撞、基岩、门、家具与维度往返。

### Task 2: 方块渲染与控制

**Files:** Create `miniapp/home/utils/sandbox-scene.js`, `miniapp/home/utils/sandbox-page.js`, `miniapp/home/pages/world/world.{js,json,wxml,wxss}`.

- [x] 生成只包含可见面的分块网格，复用家具和人物手臂，增加门轴、方块动物、异界生物、雾、太阳和云。
- [x] 默认使用角色眼睛高度，支持转头、行走、跳跃、重力、楼梯、准星选取、挖掘进度和手持物预览。
- [x] 完成背包、合成配方、房屋图纸、操作说明、回家及保存反馈；隐藏页面停止输入与动画。

### Task 3: 接通入口和实际验证

**Files:** Modify `miniapp/app.json`, `miniapp/pages/resident/resident.js`, `miniapp/home/pages/mall/mall.js`, route assertions and `README.md`; create `scripts/sandbox-preview.cjs`, `scripts/sandbox-browser-check.cjs`.

- [x] “我的家”和商场返回指向 world；购买后只把已拥有的家具交给玩家拿起摆放。
- [x] 从真实 WXML/WXSS 和页面控制器生成浏览器预览，检查第一人称、门、楼梯、挖矿、放置、家具、传送和存档回读。
- [x] 用微信编译器检查模板，运行 `node --test scripts/*-test.cjs`，检查 320/390/768 宽度截图及控制台。
- [x] 写明本机存档边界和小程序重新编译入口，记录验证结果。

## 验证结果

- `node --test scripts/*-test.cjs`：356 项全部通过，其中方块世界规则与生命周期 25 项。
- 微信 `wcc/wcsc` 成功编译世界、居民主页、商场的真实模板与样式。
- `node scripts/sandbox-browser-check.cjs`：第一人称眼高、触控走动穿门、挖树拾取与木板合成、方块扣除、家具拿放、新房图纸、星门维度往返、存档重新载入、320/390/768 布局和五个房屋等级全部通过；无脚本或 WebGL 错误。
- 浏览器实测画面约 18–28 个绘制调用、1.2–1.7 万三角形（草地视角）；完整世界 81 个分块，修改仅重建邻近分块。截图在 `output/home-preview/sandbox-*.png`。
- 没有新增 npm 依赖或数据库迁移。已完成本地实现，未部署，未做微信真机验收。
