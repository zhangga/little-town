# 数据库设计文档

## 概览

小小镇项目使用 PostgreSQL 作为主数据库,通过 GORM 进行 ORM 映射。

## ER 关系图

```
User (用户)
  ├─ has many ─> UserBuilding (用户建筑)
  ├─ has many ─> LearningRecord (学习记录)
  └─ has many ─> ReviewSchedule (复习计划)

Building (建筑)
  └─ has many ─> UserBuilding (用户建筑)

Word (单词)
  ├─ has many ─> LearningRecord (学习记录)
  └─ has many ─> ReviewSchedule (复习计划)
```

## 表结构

### users - 用户表

存储用户基本信息和游戏资源。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PRIMARY KEY | 主键 |
| open_id | VARCHAR(100) UNIQUE NOT NULL | 微信 OpenID |
| union_id | VARCHAR(100) | 微信 UnionID |
| nickname | VARCHAR(100) | 昵称 |
| avatar | TEXT | 头像 URL |
| parent_phone | VARCHAR(20) | 家长手机号 |
| grade | INT | 年级 1-6 |
| coins | INT DEFAULT 0 | 金币数量 |
| bricks | INT DEFAULT 0 | 砖块数量 |
| level | INT DEFAULT 1 | 用户等级 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| deleted_at | TIMESTAMP | 软删除时间 |

**索引**:
- UNIQUE INDEX on `open_id`
- INDEX on `union_id`
- INDEX on `deleted_at`

---

### words - 单词表

存储所有单词及其元数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PRIMARY KEY | 主键 |
| word | VARCHAR(100) NOT NULL | 单词 |
| translation | VARCHAR(200) NOT NULL | 中文释义 |
| grade | INT NOT NULL | 年级 1-6 |
| subject | VARCHAR(20) DEFAULT 'english' | 学科 english/math/chinese |
| image_url | TEXT | 图片 URL |
| audio_url | TEXT | 音频 URL |
| difficulty | INT DEFAULT 1 | 难度 1-5 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| deleted_at | TIMESTAMP | 软删除时间 |

**索引**:
- INDEX on `grade`
- INDEX on `subject`
- INDEX on `deleted_at`
- COMPOSITE INDEX on (grade, subject)

---

### buildings - 建筑表

存储所有可建造的建筑类型。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PRIMARY KEY | 主键 |
| name | VARCHAR(100) NOT NULL | 建筑名称 |
| description | TEXT | 建筑描述 |
| image_url | TEXT | 建筑图片 URL |
| subject | VARCHAR(20) DEFAULT 'english' | 所属学科 |
| cost_bricks | INT DEFAULT 10 | 建造所需砖块 |
| unlock_level | INT DEFAULT 1 | 解锁等级 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| deleted_at | TIMESTAMP | 软删除时间 |

**索引**:
- INDEX on `subject`
- INDEX on `unlock_level`
- INDEX on `deleted_at`

---

### user_buildings - 用户建筑表

记录用户已建造的建筑。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PRIMARY KEY | 主键 |
| user_id | INT NOT NULL | 用户 ID (外键 users.id) |
| building_id | INT NOT NULL | 建筑 ID (外键 buildings.id) |
| position_x | INT DEFAULT 0 | 地图 X 坐标 |
| position_y | INT DEFAULT 0 | 地图 Y 坐标 |
| word_count | INT DEFAULT 0 | 通过该建筑学的单词数 |
| built_at | TIMESTAMP | 建造时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**:
- INDEX on `user_id`
- UNIQUE INDEX on (user_id, building_id) - 每个用户每种建筑只能建一个

**外键**:
- FOREIGN KEY (user_id) REFERENCES users(id)
- FOREIGN KEY (building_id) REFERENCES buildings(id)

---

### learning_records - 学习记录表

记录每次学习的详细信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PRIMARY KEY | 主键 |
| user_id | INT NOT NULL | 用户 ID (外键 users.id) |
| word_id | INT NOT NULL | 单词 ID (外键 words.id) |
| is_correct | BOOLEAN | 本次是否答对 |
| times_right | INT DEFAULT 0 | 累计答对次数 |
| times_wrong | INT DEFAULT 0 | 累计答错次数 |
| mastered | BOOLEAN DEFAULT FALSE | 是否已掌握 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**:
- INDEX on `user_id`
- INDEX on `word_id`
- INDEX on `created_at` - 用于按时间查询
- COMPOSITE INDEX on (user_id, word_id) - 用于快速查找用户对某单词的学习情况

**外键**:
- FOREIGN KEY (user_id) REFERENCES users(id)
- FOREIGN KEY (word_id) REFERENCES words(id)

---

### review_schedules - 复习计划表 (艾宾浩斯)

存储每个单词的复习计划。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PRIMARY KEY | 主键 |
| user_id | INT NOT NULL | 用户 ID (外键 users.id) |
| word_id | INT NOT NULL | 单词 ID (外键 words.id) |
| review_level | INT DEFAULT 0 | 复习级别 0-8 |
| next_review_at | TIMESTAMP | 下次复习时间 |
| last_reviewed_at | TIMESTAMP | 上次复习时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**:
- INDEX on `user_id`
- INDEX on `next_review_at` - 用于查询到期需复习的单词
- UNIQUE INDEX on (user_id, word_id) - 每个用户每个单词只有一条复习计划

**外键**:
- FOREIGN KEY (user_id) REFERENCES users(id)
- FOREIGN KEY (word_id) REFERENCES words(id)

---

## 复习级别说明

| review_level | 间隔时间 | 掌握程度 |
|--------------|----------|----------|
| 0 | 5 分钟 | 新学 |
| 1 | 30 分钟 | 初步记忆 |
| 2 | 12 小时 | 初步记忆 |
| 3 | 1 天 | 基本掌握 |
| 4 | 2 天 | 基本掌握 |
| 5 | 4 天 | 熟练 |
| 6 | 7 天 | 熟练 |
| 7 | 15 天 | 完全掌握 |
| 8 | 30 天 | 完全掌握 |

答对时 `review_level++`,答错时 `review_level = 0`。

---

## 查询优化建议

### 1. 获取今日需复习的单词
```sql
SELECT * FROM review_schedules
WHERE user_id = ? AND next_review_at <= NOW()
ORDER BY next_review_at ASC
LIMIT 10;
```
优化:已有 INDEX on (user_id, next_review_at)

### 2. 获取新单词
```sql
SELECT * FROM words
WHERE grade = ? AND subject = 'english'
  AND id NOT IN (SELECT word_id FROM review_schedules WHERE user_id = ?)
ORDER BY difficulty ASC, id ASC
LIMIT 5;
```
优化:可以考虑添加复合索引 (grade, subject, difficulty)

### 3. 统计用户学习数据
```sql
-- 今日学习数量
SELECT COUNT(*) FROM learning_records
WHERE user_id = ? AND created_at >= CURRENT_DATE;

-- 正确率
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
FROM learning_records
WHERE user_id = ?;
```
优化:INDEX on (user_id, created_at) 可加速时间范围查询

### 4. 连续打卡天数
```sql
-- 最近 N 天每天的学习记录数
SELECT DATE(created_at) as date, COUNT(*) as count
FROM learning_records
WHERE user_id = ?
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```
优化:已有 INDEX on (user_id, created_at)

---

## 数据库迁移

使用 GORM AutoMigrate,在应用启动时自动创建表和更新字段。

```go
db.AutoMigrate(
    &models.User{},
    &models.Word{},
    &models.Building{},
    &models.UserBuilding{},
    &models.LearningRecord{},
    &models.ReviewSchedule{},
)
```

---

## 备份策略

### 每日备份
```bash
pg_dump -U littletown -d littletown_db -F c -f backup_$(date +%Y%m%d).dump
```

### 恢复
```bash
pg_restore -U littletown -d littletown_db -c backup_20241015.dump
```

---

## 性能监控

### 慢查询日志
```sql
-- 查看慢查询
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### 表大小监控
```sql
SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(table_name::regclass)) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(table_name::regclass) DESC;
```

---

## 扩展性考虑

### 未来可能的表

1. **friendships** - 好友关系表
   - 用于实现"参观朋友的镇子"功能

2. **class_rooms** - 班级表
   - 用于班级排行榜和老师管理

3. **achievements** - 成就表
   - 用于记录用户解锁的成就徽章

4. **subscriptions** - 订阅消息记录表
   - 记录用户的订阅消息发送历史

5. **parent_rewards** - 家长奖励记录表
   - 记录家长给孩子发放的奖励历史
