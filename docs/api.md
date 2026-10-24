# API 接口文档

Base URL: `http://localhost:8080/api/v1`

## 认证

大部分接口需要在 HTTP Header 中携带 JWT Token:

```
Authorization: Bearer <your_jwt_token>
```

---

## 1. 认证接口

### 1.1 微信登录

**POST** `/auth/login`

用户通过微信小程序 code 登录,首次登录会自动注册账号。

#### 请求参数
```json
{
  "code": "微信登录 code",
  "nickname": "用户昵称",
  "avatar": "头像 URL",
  "grade": 1
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 微信 wx.login() 返回的 code |
| nickname | string | 否 | 昵称 |
| avatar | string | 否 | 头像 URL |
| grade | int | 否 | 年级 1-6 |

#### 响应示例
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "open_id": "oX1234567890",
    "nickname": "小明",
    "avatar": "https://...",
    "grade": 2,
    "coins": 0,
    "bricks": 0,
    "level": 1,
    "created_at": "2024-10-15T10:00:00Z"
  }
}
```

---

## 2. 用户接口

### 2.1 获取个人信息

**GET** `/user/profile`

需要认证。

#### 响应示例
```json
{
  "id": 1,
  "nickname": "小明",
  "avatar": "https://...",
  "grade": 2,
  "coins": 120,
  "bricks": 35,
  "level": 3,
  "created_at": "2024-10-15T10:00:00Z"
}
```

### 2.2 更新个人信息

**PUT** `/user/profile`

需要认证。

#### 请求参数
```json
{
  "nickname": "新昵称",
  "avatar": "https://...",
  "grade": 3
}
```

所有字段可选,只更新提供的字段。

#### 响应
返回更新后的用户信息。

---

## 3. 学习接口

### 3.1 获取今日学习单词

**GET** `/learn/daily-words`

需要认证。返回本轮需要学习的单词，包括复习词和新词。每轮默认 10 词（由 `DAILY_WORD_COUNT` 配置），词库不足时按实际可用数量下发；完成后可以继续下一轮。

#### 响应示例
```json
{
  "words": [
    {
      "id": 5,
      "word": "apple",
      "translation": "苹果",
      "image_url": "/images/words/apple.png",
      "audio_url": "/audio/words/apple.mp3",
      "is_review": true
    },
    {
      "id": 12,
      "word": "banana",
      "translation": "香蕉",
      "image_url": "/images/words/banana.png",
      "audio_url": "/audio/words/banana.mp3",
      "is_review": false
    }
  ],
  "count": 2
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| words | array | 单词列表 |
| words[].is_review | boolean | true=复习,false=新词 |
| count | int | 单词总数 |

### 3.2 提交答案

**POST** `/learn/submit-answer`

需要认证。提交单词答题结果。

#### 请求参数
```json
{
  "word_id": 5,
  "is_correct": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| word_id | int | 是 | 单词 ID |
| is_correct | boolean | 是 | 是否答对 |

#### 响应示例
```json
{
  "message": "answer submitted",
  "is_correct": true,
  "coins_earned": 5,
  "bricks_earned": 1,
  "total_coins": 125,
  "total_bricks": 36
}
```

同词当天首次答对会获得奖励（答题砖块每日最多 20 块）:
- 金币 +5
- 砖块 +1

### 自由复习整轮奖励

以下接口均需要普通登录 Bearer token，前缀为 `/api/v1`。正常学习的单题奖励不变。

`GET /learn/daily-words` 在所有模式（learning / practice / empty）返回今日奖励状态，用于学习页面展示剩余次数。`bricks_today` 只含当天的答题砖块，不包含目标完成奖励；跨天读取为 0。`practice_token` 只在 `session_kind: "practice"` 时签发。

```json
{
  "daily_brick_cap": 20,
  "bricks_per_correct": 1,
  "bricks_today": 7,
  "bonus_claimed": false,
  "practice_token": "服务端签发的本轮题组票据",
  "practice_rewards": {
    "bricks_per_round": 4,
    "coins_per_round": 12,
    "daily_round_cap": 12,
    "rewarded_rounds": 0,
    "remaining_rounds": 12
  }
}
```

答题砖块剩余次数为 `max(0, daily_brick_cap - bricks_today) / bricks_per_correct` 向下取整；目标奖励在 `bonus_claimed` 为 false 时还剩 1 次，为 true 时剩 0 次。答题成功后使用响应的 `bricks_today`、`daily_cap` 更新额度，`bonus_granted` 为 true 时更新目标奖励次数。自由复习使用 `practice_rewards.remaining_rounds`，完成整轮后以结算响应更新，不预扣次数。

`POST /learn/practice/answer`：每答完一个词，发送 `{"practice_token":"...","word_id":5}`，成功返回 `{"saved":true}`。同一词重复提交不会增加本轮进度；这里只保存进度，不发单题奖励、不修改间隔复习和成长。

`POST /learn/practice/complete`：完成本轮全部题目、巩固与配对后发送 `{"practice_token":"..."}`。服务端检查每个题组单词都已保存，再结算 **4 砖、12 金币，每日最多 12 轮**。额外字段中的客户端金额会被忽略。

```json
{
  "bricks_earned": 4,
  "coins_earned": 12,
  "round_bricks": 4,
  "round_coins": 12,
  "total_bricks": 19,
  "total_coins": 47,
  "capped": false,
  "already_completed": false,
  "practice_rewards": {
    "bricks_per_round": 4,
    "coins_per_round": 12,
    "daily_round_cap": 12,
    "rewarded_rounds": 1,
    "remaining_rounds": 11
  }
}
```

重复结算同一票据返回 `already_completed: true`，`*_earned` 为 0；`round_bricks / round_coins` 返回本轮原有奖励，供网络响应丢失后恢复展示。第 13 轮及以后仍可完成，`capped: true` 且本轮奖励为 0。额度独立于普通答题砖块上限。票据仅对本人、当天和该题组有效，未答完或票据失效返回 400；不能用题组票据代替登录凭证。

### 3.3 获取学习统计

**GET** `/learn/stats`

需要认证。获取详细的学习统计数据。

#### 响应示例
```json
{
  "stats": {
    "total_words": 25,
    "mastered_words": 8,
    "due_today": 3,
    "today_learned": 5,
    "accuracy": 87.5
  },
  "upcoming": [
    {
      "date": "2024-10-15",
      "count": 3
    },
    {
      "date": "2024-10-16",
      "count": 5
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| total_words | 累计学过的单词数 |
| mastered_words | 已掌握的单词数 (复习级别 >= 6) |
| due_today | 今天需要复习的数量 |
| today_learned | 今天学习的数量 |
| accuracy | 正确率 (%) |
| upcoming | 未来 7 天的复习安排 |

---

## 4. 建筑接口

### 4.1 获取建筑列表

**GET** `/buildings`

需要认证。获取所有可建造的建筑,包括已建造和未建造的。

#### 响应示例
```json
{
  "buildings": [
    {
      "id": 1,
      "name": "学校",
      "description": "孩子们学习的地方",
      "image_url": "/images/buildings/school.png",
      "subject": "english",
      "cost_bricks": 10,
      "unlock_level": 1,
      "is_built": true,
      "can_build": false
    },
    {
      "id": 2,
      "name": "商店",
      "description": "买东西的地方",
      "image_url": "/images/buildings/shop.png",
      "subject": "english",
      "cost_bricks": 8,
      "unlock_level": 1,
      "is_built": false,
      "can_build": true
    }
  ],
  "user": {
    "bricks": 35,
    "coins": 120,
    "level": 2
  }
}
```

| 字段 | 说明 |
|------|------|
| is_built | 是否已建造 |
| can_build | 是否可以建造 (砖块足够且未建造) |

### 4.2 获取我的小镇

**GET** `/buildings/my-town`

需要认证。获取用户已建造的所有建筑。

#### 响应示例
```json
{
  "town_data": {
    "coins": 120,
    "bricks": 35,
    "level": 2,
    "total_buildings": 2
  },
  "buildings": [
    {
      "id": 1,
      "name": "学校",
      "description": "孩子们学习的地方",
      "image_url": "/images/buildings/school.png",
      "position_x": 1,
      "position_y": 0,
      "word_count": 12,
      "built_at": "2024-10-10 14:30:00"
    },
    {
      "id": 2,
      "name": "医院",
      "description": "看病的地方",
      "image_url": "/images/buildings/hospital.png",
      "position_x": 2,
      "position_y": 0,
      "word_count": 8,
      "built_at": "2024-10-12 16:00:00"
    }
  ],
  "layout": {
    "columns": 3,
    "rows": 6,
    "home": {"position_x": 0, "position_y": 0},
    "buildings": [
      {"id": 1, "position_x": 1, "position_y": 0},
      {"id": 2, "position_x": 2, "position_y": 0}
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| position_x, position_y | 从 0 开始的列、行坐标；三列，行数见 layout.rows；旧像素坐标读取时归一化 |
| word_count | 通过该建筑学习的单词数 |
| layout | 地图尺寸、小屋位置和已建位置；按全部图鉴、小屋及额外一行预留，最少 18 格 |

### 4.3 建造建筑

**POST** `/buildings/build`

需要认证。消耗砖块建造建筑。

新建筑放入当前布局的第一块空地，不覆盖已保存的建筑或小屋位置；建造前后地图容量按完整图鉴计算。

#### 请求参数
```json
{
  "building_id": 2
}
```

#### 响应示例
```json
{
  "message": "building constructed",
  "building": {
    "id": 2,
    "name": "商店",
    "description": "买东西的地方",
    "cost_bricks": 8
  },
  "remaining_bricks": 27
}
```

#### 错误示例
```json
{
  "error": "not enough bricks",
  "required": 10,
  "current": 5
}
```

```json
{
  "error": "building already exists"
}
```

### 4.4 免费保存建筑摆放

**PUT** `/buildings/layout`

需要认证。完整提交小屋和自己的全部已建建筑，`id` 使用 `/buildings/my-town` 返回的用户建筑 ID。坐标是从 0 开始的列、行，必须在返回的地图尺寸内，所有位置不能重叠。

```json
{
  "home": {"position_x": 0, "position_y": 0},
  "buildings": [
    {"id": 1, "position_x": 2, "position_y": 5},
    {"id": 2, "position_x": 1, "position_y": 4}
  ]
}
```

成功返回 `layout`（结构同上）、`coins_spent: 0`、`bricks_spent: 0`。余额为零也可保存，重复保存不收费。服务端与建造共用用户行锁，整张地图原子提交；遗漏建筑、包含他人的建筑、重复 ID、重叠或越界均返回 400，原布局不变。若编辑期间新增建筑，需取消草稿并刷新后再摆放。

用户表新增小屋位置字段 `town_home_x`、`town_home_y`，默认 0；本地后端开启 `AUTO_MIGRATE` 时重启自动迁移。

---

## 5. 家长端接口

### 5.1 查看孩子学习统计

**GET** `/parent/stats`

需要认证。家长查看孩子的详细学习数据。

#### 响应示例
```json
{
  "user": {
    "nickname": "小明",
    "avatar": "https://...",
    "grade": 2
  },
  "stats": {
    "total_words": 25,
    "today_words": 5,
    "study_days": 18,
    "streak_days": 7,
    "accuracy": 87.5
  },
  "recent_days": [
    {
      "date": "10-09",
      "count": 5
    },
    {
      "date": "10-10",
      "count": 3
    },
    {
      "date": "10-11",
      "count": 8
    },
    {
      "date": "10-12",
      "count": 5
    },
    {
      "date": "10-13",
      "count": 0
    },
    {
      "date": "10-14",
      "count": 6
    },
    {
      "date": "10-15",
      "count": 5
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| total_words | 累计学习单词数 |
| today_words | 今天学习的单词数 |
| study_days | 累计学习天数 |
| streak_days | 连续打卡天数 |
| accuracy | 正确率 (%) |
| recent_days | 最近 7 天的学习数据 |

### 5.2 手动添加单词

**POST** `/parent/add-word`

需要认证。家长手动添加孩子在学校学的单词。

#### 请求参数
```json
{
  "word": "homework",
  "translation": "家庭作业",
  "image_url": "https://..."
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| word | string | 是 | 单词 |
| translation | string | 是 | 中文释义 |
| image_url | string | 否 | 图片 URL |

#### 响应示例
```json
{
  "message": "word added successfully",
  "word": {
    "id": 126,
    "word": "homework",
    "translation": "家庭作业",
    "grade": 2,
    "subject": "english"
  }
}
```

---

## 6. 小镇生活

以下接口沿用登录鉴权和 `/api/v1` 前缀：

| 方法 | 路径 | JSON 请求 |
| --- | --- | --- |
| GET | `/town-life` | 无 |
| POST | `/town-life/pets/purchase` | `{"pet_id":"dog"}` 或 `{"pet_id":"cat"}` |
| POST | `/town-life/supplies/purchase` | `{"item_id":"bread","request_id":"shop-request-123456"}` |
| POST | `/town-life/events/resolve` | `{"event_id":123}` |
| POST | `/town-life/activities/start` | `{"activity_id":"cinema_cloud","request_id":"activity-request-123456"}` |

均返回 `needs`（enabled/food/water）、`supplies`、`wallet`（coins/bricks）、`pets`（id/name/icon/description/price/owned）、已建建筑名 `buildings`、待办 `event`（无待办时为 null）、最近三条已处理事件 `recent`、`unlocked_count`，以及以下建筑体验字段。事件含 id/kind/building/icon/title/description/action/outcome/cost/created_at/resolved_at。

`activities` 为固定的 22 项体验目录，每项包含 `id/name/building/icon/description/price/available/locked_reason`。`available` 只表示已拥有对应建筑及所需宠物；余额需与 `wallet.coins` 比较。未解锁时 `locked_reason` 提供原因，已解锁时为空字符串。11 座功能建筑各两项，价格 1–3 金币。宠物医院的两项体验均需拥有宠物。

`activity_visits` 为当前账号最近 12 张入场凭据，按购买顺序倒序排列，每项含 `activity_id/request_id/name/building/icon/price/created_at`，无记录时为 `[]`。成功调用 `activities/start` 额外返回 `activity_receipt`（同样结构），用于启动或恢复体验。凭据保存购票时的内容和价格；它代表已付费入场，不是完成记录或奖励。客户端可从最近记录免费重玩，不需要新购票；玩法完成不发放金币、砖块或恢复需求数值。

`request_id` 为 16–80 位大小写字母、数字或连字符；同一次购买重试必须沿用同一标识。活动购买在用户行锁事务内校验建筑、宠物及余额、扣款并保存凭据。同账号同请求只扣一次，相同请求更换活动返回 400；即使余额后来不足或原凭据已不在最近 12 条中，重复原请求仍返回原凭据及最新状态。其他账号不能复用此凭据。客户端传入的价格、奖励和用户 ID 不参与交易。

GET 会按节奏生成符合已拥有条件的生活事件；同时最多一件，每日最多三件，处理后至少间隔两小时。宠物各 20 金币，事件中的服务每次 1 金币，普通日常事件免费；主动购买的建筑体验使用独立目录和入场费用，不受事件生成节奏限制。余额不足、条件未满足、物品/事件/体验不存在或请求标识无效返回 400。完整规则及发布步骤见 [小镇生活](town-life.md)。

## 7. 餐厅便当厨房

以下路径使用 `/api/v1` 前缀，需要登录且已拥有餐厅。读写均校验账号和餐厅所有权；新厨房免费，不变更钱包或小镇需求值。

| 方法 | 路径 | 请求 |
| --- | --- | --- |
| GET | `/restaurant` | 无 |
| POST | `/restaurant/recipes` | `{request_id, recipe_id, dish}`；新建时 `recipe_id` 为空，更新时为已有食谱 ID |
| PUT | `/restaurant/signatures` | `{request_id, recipe_ids}`；完整替换菜单，0–3 个不同的本人食谱 ID |
| POST | `/restaurant/serve` | `{request_id, resident_id, order_id, recipe_id, dish}`；自由作品的 `recipe_id` 可为空 |

便当格式：

```json
{
  "name": "小熊春游便当",
  "box_shape": "square",
  "box_color": "peach",
  "decoration": "flower",
  "portions": [
    {"ingredient": "rice", "x": 32, "y": 32, "style": "bear"},
    {"ingredient": "corn", "x": 70, "y": 65, "style": "plain"}
  ]
}
```

`name` 为去除首尾空格后的 1–16 个 Unicode 字符，不允许控制字符。`box_shape` 为 `square/round`；`box_color` 为 `peach/mint/sunshine`；`decoration` 为 `none/sesame/flower/star`。食材为 `rice/egg/broccoli/corn/carrot/strawberry`，每盒 1–8 份，允许重复；`style` 默认 `plain`，米饭还可用 `bear`，鸡蛋还可用 `star`。坐标为盒内百分比 15–85，圆盒还要求中心到 `(50,50)` 的距离不超过 35。服务端保留合法坐标的精度。

全部成功响应均包含：

- `recipes`：`{id, dish, served_count, first_taster, last_feedback}`；最多 24 道，ID 为不透明字符串。
- `signature_ids`：菜单上的食谱 ID，最多 3 道。
- `residents`：`{id, name, icon, preference, visits, last_dish_name, last_feedback, order}`。固定居民为 `abu`、`taotao`、`lin`。
- `order`：`{id, kind, text, preferred_ingredient, recipe_id}`；`kind` 为 `wish/surprise/signature`。提交出餐时使用最新 `order.id`；招牌订单要求与指定配方的组成相同，允许名字不同。
- `recent_services`：最近 12 次招待，元素为 `{request_id, resident_id, resident_name, dish, recipe_id, feedback, preferred}`。

保存食谱的响应额外包含 `saved_recipe_id`；出餐响应额外包含 `service_result`，结构同近期招待记录。普通 GET 不包含这两个写入结果字段。先招待再新建或更新匹配食谱，会关联近期尚未归属食谱的品尝记录，保持首位品尝者并避免重复计数。

`request_id` 必须为 16–80 位字母、数字或连字符。同账号同请求只执行一次，重复确认返回当前餐厅状态及该请求最初的结果；同一标识搭配不同操作或内容会返回 400。网络响应不明时保留原请求，继续确认不得生成新标识。仅看到相同食谱内容不能证明保存请求已经成功，因为保存还会关联品尝历史。

400 表示未建餐厅、无效便当、食谱不属于当前用户、菜单／容量超限、过期订单或请求标识冲突；401 表示未登录，404 表示账号不存在，500 表示服务错误。数据迁移包含 `restaurants` 与 `restaurant_requests`，无需重新导入建筑目录。

## 错误码

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或 Token 无效 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 错误响应格式

```json
{
  "error": "error message"
}
```

常见错误信息:
- `missing authorization header` - 缺少认证 header
- `invalid token` - Token 无效或过期
- `user not found` - 用户不存在
- `word not found` - 单词不存在
- `building not found` - 建筑不存在
- `not enough bricks` - 砖块不足
- `building already exists` - 建筑已存在

---

## 调用示例

### curl
```bash
# 登录
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"code":"test123","nickname":"小明","grade":2}'

# 获取今日单词 (需要替换 TOKEN)
curl -X GET http://localhost:8080/api/v1/learn/daily-words \
  -H "Authorization: Bearer YOUR_TOKEN"

# 提交答案
curl -X POST http://localhost:8080/api/v1/learn/submit-answer \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"word_id":5,"is_correct":true}'
```

### JavaScript (微信小程序)
```javascript
// 登录
wx.request({
  url: 'http://localhost:8080/api/v1/auth/login',
  method: 'POST',
  data: {
    code: res.code,
    nickname: '小明',
    grade: 2
  },
  success: (res) => {
    wx.setStorageSync('token', res.data.token)
  }
})

// 获取今日单词
wx.request({
  url: 'http://localhost:8080/api/v1/learn/daily-words',
  method: 'GET',
  header: {
    'Authorization': 'Bearer ' + wx.getStorageSync('token')
  },
  success: (res) => {
    console.log(res.data.words)
  }
})
```

---

## 版本历史

### v1.0 (2024-10-15)
- 初始版本
- 实现基础的认证、学习、建筑、家长端接口

### 未来计划
- v1.1: 添加好友系统接口
- v1.2: 添加班级和排行榜接口
- v2.0: 添加数学、语文学科接口
