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

需要认证。返回今日需要学习的单词,包括复习词和新词。

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

答对会获得奖励:
- 金币 +5
- 砖块 +1

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
    "total_buildings": 3
  },
  "buildings": [
    {
      "id": 1,
      "name": "学校",
      "description": "孩子们学习的地方",
      "image_url": "/images/buildings/school.png",
      "position_x": 60,
      "position_y": 60,
      "word_count": 12,
      "built_at": "2024-10-10 14:30:00"
    },
    {
      "id": 2,
      "name": "医院",
      "description": "看病的地方",
      "image_url": "/images/buildings/hospital.png",
      "position_x": 240,
      "position_y": 60,
      "word_count": 8,
      "built_at": "2024-10-12 16:00:00"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| position_x, position_y | 建筑在地图上的坐标 |
| word_count | 通过该建筑学习的单词数 |

### 4.3 建造建筑

**POST** `/buildings/build`

需要认证。消耗砖块建造建筑。

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
