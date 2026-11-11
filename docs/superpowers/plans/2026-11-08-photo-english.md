# 照片英语课本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将用户提供的十张英语课本照片变成小镇学校里可认读、听音和拼写的十个单元。

**Architecture:** 课程数据及交互放在现有 school 分包，使用现有课堂判题、错题巩固及英语奖励。照片和合成英语读音分别放入独立 coursebook、coursebook-voice 资源分包，进入课本时异步加载，避免 school 超过 2 MiB。练习进度沿用按账号隔离的本机教材存储。

**Tech Stack:** 微信原生 WXML/WXSS/CommonJS、Node.js node:test、微信 WXML/WXSS 编译器、macOS say/afconvert/sips。

---

### Task 1: 忠实录入课程和变体

**Files:** Create `miniapp/school/data/photo-english.js`, `miniapp/school/utils/photo-course.js`; test `scripts/photo-english-test.cjs`.

- [x] 对照原图录入 Unit 1–9 及袋鼠故事的全部清晰词汇。每个词条保留 `word`、`translation`；并列写法使用 `aliases`，`textbookForm` 保留照片原文。cloud/windy、ride 等图文不完全准确之处在 `note` 说明，不直接改写来源。
- [x] 导出 `COURSES`、`courseFor(id)`、`courseWords(course)`、`makeCourseRound(id, mode, batch, random)`。每组至多五词，最后一组不回绕重复，选择题仅从当前单元取不同释义的干扰项。

```js
const course = courseFor('unit-4')
const last = makeCourseRound(course.id, 'spelling', Math.ceil(course.words.length / 5) - 1)
assert.ok(last.length > 0 && last.length <= 5)
assert.equal(new Set(last.map(q => q.courseWordID)).size, last.length)
```

### Task 2: 资源分包与可重复生成

**Files:** Create `miniapp/coursebook/ready.js`, `miniapp/coursebook/index/index.{js,json,wxml,wxss}`, `miniapp/coursebook/photos/*.jpg`, `miniapp/coursebook-voice/audio/*.m4a`, `scripts/generate-photo-english.py`; modify `miniapp/app.json`, `miniapp/project.config.json`.

- [x] 用 `sips` 只对副本校正横向照片方向、缩小并压缩，原 Downloads 文件保持原样。用 Samantha 合成所有规范词及变体的 AAC 音频，慢速由现有播放器 playbackRate 实现。
- [x] 生成器接受 `--source-dir`，按内容指纹跳过未变化的音频，输出 SHA-256、时长和体积清单，拒绝任一资源分包达到 2 MiB。

```bash
python3 scripts/generate-photo-english.py --source-dir '/Users/jossyzhang/Downloads/飞书20261108-182523'
```

### Task 3: 接入学校的课本词卡

**Files:** Create `miniapp/school/utils/photo-course-page.js`, `miniapp/school/styles/photo-course.wxss`; modify `miniapp/school/utils/classroom-page.js`, `miniapp/school/utils/curriculum.js`, `miniapp/school/utils/content.js`, `miniapp/school/utils/notebook.js`, `miniapp/school/pages/classroom/classroom.wxml` and `.wxss`.

- [x] 英语首页和教材本加入「照片英语课本」入口；课程目录显示十组课程及已练词数。单元详情提供翻卡、常速/慢速读音、原图对照、分组和三种练习方式。
- [x] `startRound` 接收 `options.courseRound`，答题时按 `courseWordID` 记录已练词，重练和错题巩固保留课程信息。返回时回到单元，切科清理课程上下文，方法讲解返回仍保留题目。
- [x] 拼写接受规范词及 aliases，正误反馈同时展示可接受形式。图片说明和美英楼层编号差异在对应单元内可见。保持现有教材及奖励协议兼容。

```js
const question = { word: 'lift', aliases: ['elevator'] }
assert.equal(checkAnswer('english', ' Elevator ', question).correct, true)
```

### Task 4: 验证与使用说明

**Files:** Modify `scripts/school-preview.cjs`, `docs/learning-modes.md`; create `scripts/photo-english-test.cjs`.

- [x] 覆盖所有来源照片、词条及资源存在，变体判题、末组边界、仅浏览不发奖、做题进度持久化、账户隔离、资源失败与重试，以及错题/方法课/切科导航。
- [x] 跑现有学校、奖励和学习回归；编译真实模板并在 320px/390px 浏览器预览检查溢出、词卡翻转和声音播放。记录仅手机微信能验证的限制。

```bash
node --test scripts/photo-english-test.cjs scripts/school-test.cjs scripts/school-lessons-test.cjs scripts/school-rewards-test.cjs scripts/learning-test.cjs scripts/page-loading-test.cjs
node scripts/school-preview.cjs
```

- [x] 文档说明入口、单元/词条数、图文勘误、合成音频、资源生成方法及本机进度范围。此次在当前会话直接实施；不提交其他进行中的小镇改动。

验证结果：125 项相关 Node 测试通过，37 个实际 WXML/WXSS 场景编译通过；320px / 390px 浏览器布局未见横向溢出，194 段 AAC 均可解码。微信手机端的实际播放和打包图片预览仍需真机检查。
