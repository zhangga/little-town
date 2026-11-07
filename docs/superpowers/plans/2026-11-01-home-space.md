# 沉浸式立体小家 Implementation Plan

**Goal:** 保持原有橡木积木风，提供可以走进去的真实 3D 房间、WASD 走动、底部家具背包和自由摆放／旋转。

**Architecture:** home 分包内使用微信官方 Three.js 适配版；场景、家具模型、连续空间碰撞和页面交互分别维护。家具仍由服务器校验所有权、碰撞和版本，兼容原来整数格子的存档。

**Tech Stack:** 原生微信小程序 Canvas WebGL、threejs-miniprogram 0.0.8、Node 测试、Go/GORM。

- [x] 连续空间：新增 home-space.js，实现任意角度矩形碰撞、角色碰撞、绕行寻路、旧布局转换；后端加入可选 angle 与小数坐标，保留旧布局语义。
- [x] 3D 场景：新增 home-models.js / home-scene.js，用橡木地板、窗户、墙梁、门厅搭建可环视小家；12 种真实家具、积木小人、走路动画、电视自然图片。
- [x] 操作与页面：重写屋内控制器与模板；大场景，小背包置底；取出、拖动、0–359° 旋转、收回、保存；键盘和触摸 WASD，转视角、缩放、家具互动；隐藏／卸载时停止动画和监听。
- [x] 验证：连续摆放边界和碰撞、旧布局、按键生命周期、购买到背包、保存与冲突测试；后端测试；真实 WebGL 浏览器交互预览和原生 WXML/WXSS 编译；分包体积检查。

键盘接口：微信官方 api-typings，PC 平台 wx.onKeyDown/onKeyUp，自基础库 3.6.0；前台且已点击页面后触发。手机提供相同 WASD 长按键。

## 验证结果

- 前端全量 286 项测试通过；屋内／小家相关 38 项通过。
- 后端 `go test ./...` 通过；真实 MySQL 的 `TestResidentMySQLLifecycle` 通过，含小数坐标、137.5° 朝向持久化和账号隔离。
- 真实 WXML/WXSS 编译通过。浏览器 WebGL 交互检查通过：WASD 按下／松开、背包选取、家具拖放、137° 旋转、保存后重进、环视、近景以及 320/390/768 宽度布局。
- 预览场景 93 次绘制、3304 个三角形；home 分包约 987 KB，主包约 1.56 MB，均在 2 MiB 内。
- 微信真机未验收。发布时需先更新后端，再重新编译小程序；本次布局格式无新增数据库列。
- 本地示例预览：`output/home-preview/space.html`；场景截图：`space-final.png`、`space-backpack-final.png`、`space-placement-final.png`、`space-close-final.png`。
