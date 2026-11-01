# 三科独立学习奖励 Implementation Plan

> **For agentic workers:** Execute the checklist inline in this session; preserve the existing learning page and school activities.

**Goal:** 三科采用原英语答题、每日完成、整轮复习的奖励数值，各科独立额度；新旧英语入口共用英语额度。

**Architecture:** 后端按账号锁定钱包，保存学校题组及逐题收据，服务端计算额度和到账金额。小程序保存待确认提交并按顺序重试，展示服务端剩余次数与本轮收获；本地教材与讲播保留。

**Tech Stack:** Go / Gin / GORM / MySQL，原生微信小程序，Node test。

---

- [ ] 增加 school models / service / handler / migration / routes：逐题 1 砖 + 5 金币，每科 20 砖上限；每日不同题目达到 DAILY_WORD_COUNT 后额外 10 砖 + 10 金币；复习每轮 4 砖 + 12 金币，每科 12 轮。所有数值复用现有常量。
- [ ] 兼容旧英语：共享 User 奖励计数与完成日期、已有 PracticeRound；内置同一个英文词的逐题奖励和目标进度去重。
- [ ] 学校奖励模块保存待确认题组和答案，幂等恢复；同一题组重试不重复到账，过期题组明确提示。写字奖励基于完成练写，不声称自动判分。
- [ ] 接入原有三科玩法、小练、教材、复习按钮；显示每科剩余次数、本轮到账和下一科学习入口；错题回看、只听讲播不重复发奖。
- [ ] 增加真实 MySQL 集成测试：三个独立额度、原英语兼容、并发/重复、跨日、钱包总量、未完成和跨账号拒绝。
- [ ] 增加页面与奖励队列测试：保存重试、重进恢复、切科、写字、小练、原英语回归；编译页面并检查窄屏奖励状态。
- [ ] 更新学习规则文档，运行相关 Node 与 Go 检查，记录实际结果。
