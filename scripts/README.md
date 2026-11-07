# 开发脚本

数据库相关的日常操作。Windows 用 `.bat`，Linux/macOS 用 `.sh`，两者行为一致。

微信云托管源码包使用 `scripts\package-cloudrun.ps1` 生成，输出到 `output/cloudrun`。该命令不会发布线上服务。三种运行方式及生产配置见 [部署说明](../docs/deployment.md)。

本地也可以将后端构建成容器，在 backend 目录执行 `docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build --wait app`。入口为 `http://localhost:18080`，使用现有开发 MySQL；构建、健康检查、日志和停止命令见 [Docker 本地运行说明](../docs/deployment.md#用-docker-构建并运行本地后端)。

| 操作 | Windows | Linux / macOS |
|------|---------|---------------|
| 启动数据库 | `scripts\db-start.bat` | `./scripts/db-start.sh` |
| 清空数据重启 | `scripts\db-start.bat --reset` | `./scripts/db-start.sh --reset` |
| 停止数据库 | `scripts\db-stop.bat` | `./scripts/db-stop.sh` |
| 停止并删除数据 | `scripts\db-stop.bat --clean` | `./scripts/db-stop.sh --clean` |
| 查看状态 | `scripts\db-status.bat` | `./scripts/db-status.sh` |
| 查看日志 | `scripts\db-logs.bat` | `./scripts/db-logs.sh` |
| 跟踪日志 | `scripts\db-logs.bat -f` | `./scripts/db-logs.sh -f` |

## 完整启动流程

```bash
# 1. 起数据库（脚本会等到真正可连接才返回），首次先复制 backend/.env.example 为 backend/.env
./scripts/db-start.sh

# 2. 自动建表并导入单词与建筑（可重复执行，幂等）
cd backend && go run cmd/import/main.go

# 3. 在 backend 目录启动后端
go run cmd/server/main.go
```

或者用 VSCode：`F5` 选「启动后端服务」，再 `F5` 选「导入初始数据（单词 + 建筑）」。

## 脚本做了什么

**`db-start`** 不只是 `docker compose up -d`。容器起来和数据库可连接是两件事，脚本会轮询 healthcheck 直到状态为 `healthy` 才返回，否则紧接着启动后端会撞上 `connection refused`。等待期间如果容器退出，会直接把日志打出来。

**`db-stop`** 默认只停容器、保留数据卷。加 `--clean` 才删数据，且要求输入 `yes` 二次确认。

**`db-status`** 除了容器状态，还会列出数据表和 `users / words / buildings` 的行数，方便确认导入是否成功。

## 连接信息

| 项 | 值 |
|---|---|
| MySQL 8.4 LTS | `127.0.0.1:3306` |
| 数据库 | `littletown_db` |
| 用户 / 密码 | `littletown` / `littletown_dev_pw` |
| Adminer（网页版管理界面） | http://localhost:8081 |

Adminer 登录时：系统选 `MySQL`，服务器填 `mysql`（Compose 服务名），用户名 `littletown`，密码同上，数据库 `littletown_db`。

这里的密码与 `backend/.env` 的 `DB_PASSWORD` 必须一致，否则后端会报 `Access denied`。改动时两处都要改。应用使用普通用户 `littletown`；root 密码 `littletown_root_dev_pw` 仅供本机管理使用。

默认字符集为 `utf8mb4`，使用 `utf8mb4_bin` 排序规则，保持 OpenID 和单词的大小写区分，支持中文与 emoji。`DB_TIMEZONE=Asia/Shanghai`，本地使用 `DB_TLS=false`；云托管、自建服务器填写各自的 MySQL 连接信息，要求 TLS 时设置 `DB_TLS=true`。

MySQL 使用独立的 `little-town-mysqldata` 数据卷。原 PostgreSQL 容器和数据卷不会被这些脚本自动删除；切换前应备份旧数据，已有用户及学习进度需要迁移，不能通过重新导入词库替代。

## 餐厅布局预览

`node scripts/restaurant-preview.cjs --serve 9433` 编译实际厨房 WXML/WXSS，提供空厨房、成品、熟客点单、招牌菜单、回忆卡和错误恢复等演示状态。需要安装微信开发者工具，或通过 `WECHAT_COMPILER_DIR` 指定包含 `wcc`、`wcsc` 的目录；生成文件在 `output/restaurant-preview`（已忽略）。这是静态布局预览，业务行为由 `node --test scripts/restaurant-test.cjs` 与后端 `TestRestaurantMySQLLifecycle` 验证。

## 学校三科课堂预览

学校三科回归：`node --test scripts/school-test.cjs scripts/school-lessons-test.cjs scripts/school-rewards-test.cjs` 覆盖 12 种玩法、五题课堂小练、讲解播放与生命周期、36 段音频校验、错题重练、照片教材、账号隔离及保存失败。`node scripts/school-preview.cjs` 用微信编译器生成 30 个实际 WXML/WXSS 场景；直接打开 `output/school-preview/index.html`，或加 `--serve 9434` 启动本机预览。预览里的写字板与小讲播播放器运行产品同一套逻辑，其余按钮仅用于布局展示。修改小讲播文稿后，在 macOS 上运行 `python3 scripts/generate-school-audio.py` 重建有变化的语音片段，无需外部语音服务。

## 地铁站与跑酷预览

`node scripts/subway-preview.cjs --serve 9436` 编译实际站台和跑酷 WXML/WXSS，并运行产品的游戏逻辑、Canvas 绘制和页面控制器。打开 `http://127.0.0.1:9436/output/subway-preview/index.html`，可以从站台点击列车试玩，也可查看暂停、结算、未建造和网络失败状态。支持鼠标按钮、触摸滑动和预览用方向键。演示使用本地站台数据，不调用业务后端；输出目录已忽略。

`node --test scripts/subway-test.cjs` 覆盖换道、跳跃/下滑判定、星星计分、随机障碍可通行性、不同帧率、重玩、后台暂停、页面退出、拥有建筑校验、账号隔离与保存失败。地铁站插画源文件是 `scripts/art/subway-station.svg`，发布素材是 `miniapp/images/town/subway-station.png`。

启动预览后，运行 `node scripts/subway-browser-check.cjs`（需安装 `agent-browser`），使用真实鼠标按下、松开检查四个控制按钮，覆盖 HUD 刷新期间的点击、长按以及暂停/继续。微信端还需检查开始、暂停和结算卡片：原生 Canvas 会遮挡普通 view，所以只在奔跑时显示；初始化从 `.run-stage` 读取尺寸，滑动手势只绑定画布，不绑定菜单按钮的父容器。

## 前置要求

Docker Desktop（Windows/macOS）或 docker engine（Linux）。脚本会检查三件事并给出对应提示：Docker 是否安装、compose 命令是否可用、守护进程是否运行。

## 换端口

如果 3306 或 8081 被占用，改 `backend/docker-compose.yml` 的端口映射，并同步改 `backend/.env` 的 `DB_PORT`：

```yaml
ports:
  - "127.0.0.1:13306:3306"   # 宿主机 13306 → 容器 3306
```

两个端口都只绑定到 `127.0.0.1`，局域网内其他机器连不上，开发库不会意外暴露。

三科奖励后端集成测试使用独立的 `MYSQL_TEST_DB=littletown_test_…` 测试库及对应数据库凭据，在 `backend` 目录运行 `go test -p 1 ./...`，覆盖独立次数、原英语共用额度、同词跨年级去重、重复提交、并发钱包和跨天恢复。学校奖励客户端测试覆盖断网收据丢失、重进恢复、切科、账号隔离、存储失败及过期题组。

## 立体小家交互预览

`node scripts/home-space-preview.cjs 9435` 编译实际 WXML/WXSS，启动 `http://127.0.0.1:9435/output/home-preview/space.html`。预览使用真实屋内控制器、碰撞规则与 WebGL 模型，示例账号拥有全部家具；`?level=2` 至 `?level=5` 分别预览各级住宅，第五级摆有全部 24 款家具。保存写入浏览器本地存储，带 `?saved=1` 可检查重新进入后的布局。WASD 走动，V 切换第一／第三人称，E 开关木门。预览不连接用户账号或扣金币。

`node scripts/home-space-preview.cjs --build` 仅重新生成预览文件。编译器默认使用 macOS 微信开发者工具，其他位置通过 `WECHAT_COMPILER_DIR` 指定。浏览器交互检查执行 `node scripts/home-space-browser-check.cjs`，需 Node 环境可解析 Playwright（可通过 `NODE_PATH` 指定已有依赖），并已启动预览服务；`HOME_PREVIEW_URL` 和 `CHROME_PATH` 可覆盖默认地址与 Chrome 路径。截图保存在 `output/home-preview/space-*-final.png`。

扩建、木门与人称检查：`node scripts/home-villa-browser-check.cjs`，验证开门后经过门廊、站在门槛不能关门、五种真实空间大小、第一／第三人称，以及全部家具与背包缩略图。截图保存在 `output/home-preview/villa-*-final.png`。完成场景修改后，`node scripts/render-home-model-assets.cjs` 将实际模型渲染为新增家具和四／五级住宅 PNG；加 `--homes` 仅更新住宅，需要预览服务、Playwright 和 Sharp。

纯逻辑测试：`node --test scripts/home-room-test.cjs scripts/home-space-test.cjs scripts/home-villa-test.cjs scripts/resident-test.cjs`。后端服务测试包含与前端共用的连续坐标／任意旋转碰撞用例；`TestResidentMySQLLifecycle` 检查升级扣款、版本冲突和扩建后布局的实际数据库保存与重新读取。
