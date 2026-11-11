# 林溪光影与采集合成 Implementation Plan

> **For agentic workers:** Execute the tasks inline in this session and keep the existing room controls and unsaved user changes intact.

**Goal:** 在立体小家旁提供可以走动的美化自然世界，包括风、慢溪、矿洞、采集、合成、白玻璃和真正映出场景的镜子。

**Architecture:** 复用现有 WebGL 场景与走动控制，增加独立的自然环境渲染、纯资源规则和页面控制模块。探索区使用相对房屋的固定坐标，合成物陈列在溪边工坊；资源进度按登录用户保存在本机，不进入金币钱包。

**Tech Stack:** 微信小程序 WXML/WXSS、已内置的 Three.js r108、Node test runner、微信编译器和真实浏览器 WebGL。

---

- [x] 资源规则：`miniapp/home/utils/nature-resources.js` 定义矿脉、工具等级、冷却、配方、库存和可通行区域；`scripts/nature-world-test.cjs` 验证完整采集合成链、材料不足、距离、工具、存档隔离及失败恢复。
- [x] 渲染：`miniapp/home/utils/nature-world.js` 负责树林、草地、花、慢溪、桥、矿洞与矿物；`nature-reflections.js` 负责共面镜子反射；在 `home-scene.js` 接入环境、风、水、阳光阴影和生命周期。
- [x] 交互：`miniapp/home/utils/nature-page.js` 管理探索、矿脉进度、配方、采集和本机保存；在现有房间控制器中复用 WASD、空格、V、E 与触摸手势。
- [x] 展示：`miniapp/home/templates/nature-world.wxml` 和 `miniapp/home/styles/nature-world.wxss` 增加探索入口、就近互动与可滚动合成背包；编译真实模板，检查 320/390/768 宽度。
- [x] 验收：运行相关 Node 回归；真实 WebGL 检查动水、树叶、镜中人物、玻璃与资源采集合成；记录实测结果和本机存档边界到 `docs/nature-world.md`。

## 验证结果

- 62 项相关 Node 测试通过，覆盖完整采集合成、入口返回、账号隔离与旧房间功能。
- 房间及方块世界的真实 WXML/WXSS 通过微信编译。
- 林溪浏览器检查通过：风、水、键盘、采集、10 张配方、玻璃与镜面、矿洞、重新进入和 320／390／768 宽度；无页面错误或 Three.js 警告。
- 原房间与别墅的浏览器检查通过，包含摆放、任意旋转、存档、开关门、五级户型和 24 款家具。
- 首次进入林溪的浏览器样例约 110 draw calls / 33,234 triangles；home 分包磁盘占用约 1.31 MiB，上传大小以微信工具为准。
- 使用独立本机探索存档，未发布、未做微信真机验收。
