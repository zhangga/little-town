# School Subjects Implementation Plan

**Goal:** 在小镇学校加入语文鼠标/手指练字、数学数字答题、英语听音拼写，以及三科照片教材。

**Architecture:** 新增 school 分包，学校入口直接进入三科教室，原英语 tab 提供三科导航并保持原学习奖励。教材、照片及练习次数按后端和账号保存在本机；不假装具有 OCR 或汉字自动判分能力。

**Tech Stack:** 微信小程序 WXML/WXSS、Canvas 2D、JavaScript、Node 原生测试、微信 WXML/WXSS 编译器。

## Implementation

- [x] `miniapp/school/utils/content.js`：汉字/英语默认教材、有限范围口算生成、用户文本解析（不执行输入）、严格答案校验。
- [x] `miniapp/school/utils/notebook.js`：账号隔离存储、持久保存教材照片、删除清理、写入失败保留编辑内容。
- [x] `miniapp/school/utils/handwriting.js`：Canvas 2D 田字格、鼠标模拟触摸/手机触摸、完整笔画撤销、清空、范字开关，生命周期隔离。
- [x] `miniapp/school/utils/classroom-page.js` 和 `miniapp/school/pages/classroom/classroom.*`：三科选择、练习、反馈、错题重练、本机次数、照片与教材编辑列表。
- [x] `miniapp/app.json`、`miniapp/utils/town-shop.js`、`miniapp/utils/town-life.js`、`miniapp/pages/learn/learn.*`：分包注册、学校入口、原英语页面的三科导航。
- [x] `scripts/school-test.cjs`：解析/算术边界、完整三科流程、错题重练、空答案/重复提交、画板生命周期、账号隔离、照片保存和存储失败/取消回归。
- [x] `scripts/school-preview.cjs`：通过本机微信编译器渲染真实 WXML/WXSS，检查 320px 和 390px 布局。
- [x] `docs/learning-modes.md`、`README.md`、`scripts/README.md`：入口、玩法、照片录入步骤、本机存储边界、验证命令。

## Verification

```sh
node --test scripts/school-test.cjs scripts/learning-test.cjs scripts/page-loading-test.cjs scripts/town-shop-test.cjs scripts/building-interior-test.cjs scripts/sound-page-test.cjs
node scripts/school-preview.cjs
git diff --check
```

预期：所有断言通过；真实模板编译成功；窄屏无横向溢出；写字画布笔迹与清空/撤销动作一致。手机实机触摸、拍照权限和录音播放需如实标注是否验证。

## Verification result

2026-10-31：84 项相关检查中 83 项通过，唯一失败为现有学习测试的主包 2 MiB 体积检查；工作区并行新增的 `miniapp/images/home/` 资源纳入了主包，本次学校代码位于独立的 school 分包。未删除或改动这些并行素材，也未放宽包体积限制。学校、学习页、小镇入口的实际 WXML/WXSS 均编译成功，12 个学校预览场景已生成；320px/390px 无横向溢出，真实 Canvas 2D 笔迹、撤销、清空通过浏览器验证。尚未进行微信手机实测或发布。

后续三科玩法与小讲播扩展时，主包及所有分包检查均已通过，见 [扩展验证结果](2026-10-31-school-lessons.md)。以上保留第一阶段的实际检查记录。
