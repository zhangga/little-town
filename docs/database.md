# 数据库设计文档

小小镇统一使用 MySQL 8.0+，通过 GORM 访问；本地 Docker 使用 MySQL 8.4 LTS。微信云托管和自建服务器使用同一套模型、查询和导入逻辑。

## 连接与初始化

1. 将 `backend/.env.example` 复制为 `backend/.env`。
2. 在仓库根目录执行 `scripts\db-start.bat`（Windows）或 `./scripts/db-start.sh`（Linux/macOS）。
3. 在 `backend` 目录执行 `go run cmd/import/main.go`，自动建表并导入单词、建筑；重复执行会更新变化的数据。
4. 执行 `go run cmd/server/main.go` 启动后端。

| 环境变量 | 默认值 | 作用 |
|---|---|---|
| DB_HOST | 127.0.0.1 | 数据库主机 |
| DB_PORT | 3306 | 数据库端口 |
| DB_USER | littletown | 应用用户 |
| DB_PASSWORD | 空 | 数据库密码，由环境配置 |
| DB_NAME | littletown_db | 数据库名 |
| DB_TLS | false | 本地可关闭；要求 TLS 的云数据库设置为 true |
| DB_TIMEZONE | Asia/Shanghai | Go 时间解析与数据库会话使用的时区 |

实际配置由环境变量和 `.env` 加载；`config/config.example.yaml` 仅作配置结构参考。

连接使用 utf8mb4，表使用 InnoDB、utf8mb4_bin 排序规则，支持中文和 emoji，保持 OpenID、单词的大小写区分。时间列使用 DATETIME(6)，保留微秒；会话时区默认 +08:00。业务进程也应运行在上海时区（容器可设置 `TZ=Asia/Shanghai`），以保持每日学习、奖励和推送时间一致。

## 数据模型

实际表结构以 `backend/internal/models/models.go` 和 GORM 建表结果为准。主键为 BIGINT UNSIGNED AUTO_INCREMENT，关联 ID 使用相同类型。

| 表 | 内容 | 关键字段与索引 |
|---|---|---|
| users | 用户与资源 | open_id 唯一索引；union_id、reward_date、deleted_at 普通索引；金币、砖块、等级、每日奖励计数 |
| words | 单词库 | 单词、释义、年级、学科、图片/音频 URL、难度；deleted_at 索引 |
| buildings | 建筑目录 | 名称、介绍、图片、学科、砖块成本、解锁等级；deleted_at 索引 |
| user_buildings | 用户已建建筑 | 用户、建筑、坐标、学习计数、建造时间；user_id 索引，building_id 关联 buildings |
| learning_records | 学习记录 | 用户、单词、答题结果、对错次数、掌握状态；user_id、word_id 索引，word_id 关联 words |
| review_schedules | 复习计划 | 用户、单词、复习级别、下次/上次复习时间；user_id、next_review_at 索引，word_id 关联 words |
| subscriptions | 订阅额度 | user_id 唯一索引；剩余额度、请求/授权/推送时间、累计推送数 |

users、words、buildings 通过可空的 deleted_at 软删除。

字符串长度明确声明：OpenID/UnionID/昵称/单词/建筑名最多 100 字符，释义最多 200，手机号最多 20，学科最多 20；URL 和建筑介绍使用 TEXT。索引列不会被自动映射为无法直接索引的 TEXT。

订阅记录的 last_request_at、last_granted_at、last_pushed_at 使用可空时间：事件未发生时存 SQL NULL，Go 中使用 `*time.Time`。保持 MySQL 默认严格模式，不写入零日期。

## 复习级别

| review_level | 间隔 |
|---|---|
| 0 | 5 分钟 |
| 1 | 30 分钟 |
| 2 | 12 小时 |
| 3 | 1 天 |
| 4 | 2 天 |
| 5 | 4 天 |
| 6 | 7 天 |
| 7 | 15 天 |
| 8 | 30 天 |

答对升级，答错回到 0；具体逻辑见 `backend/internal/services/spaced_repetition.go`。

## 查询示例

```sql
-- 到期复习
SELECT * FROM review_schedules
WHERE user_id = ? AND next_review_at <= NOW()
ORDER BY next_review_at ASC
LIMIT 10;

-- 未学过的单词
SELECT * FROM words
WHERE grade = ? AND subject = 'english' AND deleted_at IS NULL
  AND id NOT IN (SELECT word_id FROM review_schedules WHERE user_id = ?)
ORDER BY difficulty ASC, id ASC
LIMIT 5;

-- 今日学习数量（按数据库会话时区计算）
SELECT COUNT(*) FROM learning_records
WHERE user_id = ? AND created_at >= CURRENT_DATE;

-- 最近七天的学习趋势：MySQL INTERVAL 语法
SELECT DATE(created_at) AS date, COUNT(*) AS count
FROM learning_records
WHERE user_id = ? AND created_at >= CURRENT_DATE - INTERVAL 7 DAY
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

GORM 普通查询自动处理软删除；原生 SQL 需要显式过滤。后续可按实际查询计划评估 `(user_id, created_at)`、`(user_id, next_review_at)` 等复合索引。

## 建表与数据迁移

服务和导入命令均通过 `database.AutoMigrate` 创建或更新七张表。AutoMigrate 负责 MySQL 内的结构更新，不会自动搬运其他数据库的数据。

MySQL 使用新的 little-town-mysqldata Docker 数据卷。切换旧 PostgreSQL 项目时，应先备份、迁移所有业务表，保留 ID、用户资源、软删除记录和学习进度，再核对各表行数和关联。旧容器和旧卷在确认迁移完成后可按需归档，项目脚本不会自动删除它们。

## 备份与恢复

以下命令由 MySQL 客户端执行，-p 会交互提示密码。生产环境应结合云数据库自动备份。

```bash
# --result-file 避免 Windows 终端重定向改变 SQL 文件编码
mysqldump -h127.0.0.1 -ulittletown -p --single-transaction \
  --no-tablespaces --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 --result-file=backup.sql littletown_db

# 恢复到已创建的数据库
mysql -h127.0.0.1 -ulittletown -p --default-character-set=utf8mb4 \
  littletown_db -e "SOURCE backup.sql"
```

## 运行检查

执行 `scripts\db-status.bat` 或 `./scripts/db-status.sh` 查看容器健康状态、数据表与核心表行数。

```sql
SELECT @@character_set_connection, @@collation_connection,
       @@session.time_zone, @@sql_mode;

SELECT table_name,
       ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY data_length + index_length DESC;
```

单元测试：在 backend 目录运行 `go test ./...`。真实 MySQL 回归测试需预先创建独立测试库，将 MYSQL_TEST_DB 设置为以 littletown_test_ 开头的库名，再运行 `go test ./internal/database -v`；连接参数仍使用 DB_*，测试不会使用业务库保存记录。
