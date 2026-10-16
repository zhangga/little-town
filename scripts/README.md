# 开发脚本

数据库相关的日常操作。Windows 用 `.bat`，Linux/macOS 用 `.sh`，两者行为一致。

微信云托管源码包使用 `scripts\package-cloudrun.ps1` 生成，输出到 `output/cloudrun`。该命令不会发布线上服务。三种运行方式及生产配置见 [部署说明](../docs/deployment.md)。

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

## 前置要求

Docker Desktop（Windows/macOS）或 docker engine（Linux）。脚本会检查三件事并给出对应提示：Docker 是否安装、compose 命令是否可用、守护进程是否运行。

## 换端口

如果 3306 或 8081 被占用，改 `backend/docker-compose.yml` 的端口映射，并同步改 `backend/.env` 的 `DB_PORT`：

```yaml
ports:
  - "127.0.0.1:13306:3306"   # 宿主机 13306 → 容器 3306
```

两个端口都只绑定到 `127.0.0.1`，局域网内其他机器连不上，开发库不会意外暴露。
