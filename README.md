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
- **语言**: Go 1.25+
- **框架**: Gin (HTTP 路由)
- **数据库**: MySQL 8.0+（本地开发使用 8.4 LTS）
- **ORM**: GORM
- **认证**: JWT
- **部署**: 本地开发、微信云托管、自建 Docker 服务器（见 [部署说明](docs/deployment.md)）

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
- Go 1.25+
- MySQL 8.0+（可通过项目脚本启动 Docker 数据库）
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

# 启动本地 MySQL（当前在 backend 目录；Windows 使用 ..\scripts\db-start.bat）
# Docker 会自动创建 littletown_db 数据库
../scripts/db-start.sh

# 自动建表并导入初始数据(单词和建筑，可重复执行)
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

# 按 utils/config.js 中的 ENV 与 TARGETS 选择 local / cloudrun / server

# 在开发者工具中编译运行
```

## 核心功能

### 学生端
1. **角色与宠物伙伴**
   - 小镇长成长、换装和小屋升级
   - 购买小狗或小猫，伙伴永久入住小镇
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
5. **小镇生活**
   - 建成对应建筑后才解锁生活事件，宠物生病需同时拥有宠物和宠物医院
   - 医生、消防和宠物医生等游戏服务每次只需 1 金币
   - 散步、送面包、读故事等免费日常；详见 [小镇生活](docs/town-life.md)

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

完整配置、已有微信云托管环境、自建 HTTPS 部署及每日提醒入口，见 [部署说明](docs/deployment.md)。开发版默认访问本机，体验版和正式版默认使用已配置的微信云托管环境；自建部署可通过 `miniapp/utils/config.js` 切换。

### 测试环境
```bash
# 使用 Docker Compose
cd backend
docker-compose up -d
```

### 微信云托管

在仓库根目录运行 `scripts\package-cloudrun.ps1` 生成源码包，上传到已有环境 `prod-d4g0vweip50ea1139` 的服务 `golang-y91h`，端口使用 80。MySQL 连接变量、微信凭证和 JWT_SECRET 按 [部署说明](docs/deployment.md) 在控制台配置。

### 自建服务器

将 `deploy/.env.example` 复制为 `deploy/.env`，填写域名、数据库密码和微信凭证，然后在仓库根目录执行：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

同一个后端镜像通过环境变量切换配置，MySQL 数据保存在独立数据卷，Caddy 对外提供 HTTPS。

## 许可证

暂未开源,项目所有权归个人所有。

## 联系方式

如有问题请联系项目负责人。
