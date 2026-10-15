# 小小镇 Little Town

一个针对小学生英语单词学习的微信小程序,采用建造小镇的游戏化方式帮助孩子记忆单词,结合艾宾浩斯记忆曲线优化复习计划。

## 项目概览

**核心理念**: 把背单词变成建造小镇的过程,孩子通过答对单词获得砖块,用砖块建造建筑,建筑越多小镇越繁荣。

**差异化**:
- **陪伴型产品**,不是工具型产品:孩子的目标是"建造小镇",背单词是达成目标的手段
- **家长可参与**:家长可以查看学习数据、手动添加单词、给孩子奖励
- **微信小程序**:无需下载 app,家长心理门槛低,便于在班级群传播

## 技术架构

### 前端
- **平台**: 微信小程序原生开发
- **UI 框架**: 微信小程序原生组件
- **动画**: Lottie (JSON 动画,体积小)
- **状态管理**: 小程序原生 data/setData

### 后端
- **语言**: Go 1.21+
- **框架**: Gin (HTTP 路由)
- **数据库**: PostgreSQL 14+
- **ORM**: GORM
- **认证**: JWT
- **部署**: 腾讯云/阿里云轻量服务器

### 核心算法
- **艾宾浩斯记忆曲线**: 5分钟、30分钟、12小时、1天、2天、4天、7天、15天、30天
- **自适应复习**: 答对升级,答错重置

## 项目结构

```
little-town/
├── miniapp/                 # 微信小程序前端
│   ├── pages/              # 页面
│   │   ├── index/         # 首页(小镇地图)
│   │   ├── learn/         # 学习页(答题)
│   │   ├── parent/        # 家长端
│   │   └── profile/       # 个人中心
│   ├── components/        # 组件
│   ├── utils/             # 工具函数
│   └── app.json           # 小程序配置
│
├── backend/                # Go 后端
│   ├── cmd/
│   │   ├── server/        # 主服务
│   │   └── import/        # 数据导入脚本
│   ├── internal/
│   │   ├── config/        # 配置管理
│   │   ├── database/      # 数据库初始化
│   │   ├── models/        # 数据模型
│   │   ├── handlers/      # HTTP 处理器
│   │   ├── services/      # 业务逻辑
│   │   ├── middleware/    # 中间件
│   │   └── router/        # 路由
│   ├── data/              # 初始数据
│   │   ├── words/         # 单词库
│   │   └── buildings.json # 建筑库
│   └── go.mod
│
└── docs/                   # 文档
    ├── api.md             # API 接口文档
    └── database.md        # 数据库设计文档
```

## 快速开始

### 1. 环境要求
- Go 1.21+
- PostgreSQL 14+
- Node.js 16+ (如果需要本地开发小程序)
- 微信开发者工具

### 2. 后端启动

```bash
# 进入后端目录
cd backend

# 复制配置文件
cp .env.example .env

# 编辑 .env 文件,配置数据库等信息
# vi .env

# 安装依赖
go mod download

# 创建数据库
createdb littletown_db

# 运行数据库迁移(自动创建表)
go run cmd/server/main.go  # 首次运行会自动迁移

# 导入初始数据(单词和建筑)
go run cmd/import/main.go

# 启动服务器
go run cmd/server/main.go
# 服务器运行在 http://localhost:8080
```

### 3. 小程序启动

```bash
# 进入小程序目录
cd miniapp

# 用微信开发者工具打开该目录

# 修改 utils/config.js 中的 API_BASE_URL 为你的后端地址

# 在开发者工具中编译运行
```

## 核心功能

### 学生端
1. **选宠物/角色** (暂未实现,当前是建造主题)
2. **每日学习**
   - 每天获取 5 个单词(3 个复习 + 2 个新词)
   - 看图选词答题
   - 答对获得砖块和金币
3. **建造小镇**
   - 用砖块建造建筑(学校、商店、医院等)
   - 建筑有不同等级要求
   - 建筑越多小镇越繁荣
4. **个人中心**
   - 查看个人信息
   - 查看金币/砖块数量
   - 查看已建造的建筑

### 家长端
1. **学习数据**
   - 累计学习单词数
   - 今日学习情况
   - 学习正确率
   - 连续打卡天数
   - 最近 7 天学习趋势图
2. **自定义单词**
   - 手动添加学校教的单词
   - 拍照 OCR 识别(暂未实现)
3. **奖励机制**
   - 给孩子发砖块/金币(暂未实现)

## API 接口

详见 [API 文档](docs/api.md)

### 核心接口
- `POST /api/v1/auth/login` - 微信登录
- `GET /api/v1/learn/daily-words` - 获取今日单词
- `POST /api/v1/learn/submit-answer` - 提交答案
- `GET /api/v1/buildings/my-town` - 获取我的小镇
- `POST /api/v1/buildings/build` - 建造建筑
- `GET /api/v1/parent/stats` - 家长查看数据

## 数据库设计

详见 [数据库文档](docs/database.md)

### 核心表
- `users` - 用户表
- `words` - 单词表
- `buildings` - 建筑表
- `user_buildings` - 用户建筑表
- `learning_records` - 学习记录表
- `review_schedules` - 复习计划表(艾宾浩斯)

## 艾宾浩斯算法实现

```
复习级别   间隔时间     掌握程度
Level 0    5 分钟      新学
Level 1    30 分钟     初步记忆
Level 2    12 小时     初步记忆
Level 3    1 天        基本掌握
Level 4    2 天        基本掌握
Level 5    4 天        熟练
Level 6    7 天        熟练
Level 7    15 天       完全掌握
Level 8    30 天       完全掌握
```

**规则**:
- 答对:复习级别 +1,进入下一个时间间隔
- 答错:复习级别归零,重新开始

## 开发路线图

### MVP (已完成)
- [x] 后端架构搭建
- [x] 数据库设计
- [x] 艾宾浩斯算法实现
- [x] 核心 API 接口
- [x] 小程序页面结构
- [ ] 小程序与后端联调
- [ ] 微信登录集成
- [ ] 基础 UI 实现

### V1.0 (3-4 周)
- [ ] 完整的答题流程
- [ ] 建筑建造动画
- [ ] 小镇地图可视化
- [ ] 家长端数据看板
- [ ] 订阅消息(每日提醒)
- [ ] 内测版本发布

### V1.1 (1-2 个月)
- [ ] 更多单词库(人教版 1-6 年级完整)
- [ ] 拍照 OCR 识别单词
- [ ] 好友系统(参观朋友的镇子)
- [ ] 班级排行榜
- [ ] 打卡分享海报

### V2.0 (3-6 个月)
- [ ] 数学区(口算练习)
- [ ] 语文区(成语、古诗)
- [ ] 多宠物/角色选择
- [ ] 更多建筑和场景
- [ ] 付费会员功能

## 部署

### 测试环境
```bash
# 使用 Docker Compose
cd backend
docker-compose up -d
```

### 生产环境
```bash
# 编译二进制文件
go build -o server cmd/server/main.go

# 运行
./server
```

推荐使用 systemd 管理服务:
```ini
[Unit]
Description=Little Town Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/little-town
ExecStart=/opt/little-town/server
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## 许可证

暂未开源,项目所有权归个人所有。

## 联系方式

如有问题请联系项目负责人。
