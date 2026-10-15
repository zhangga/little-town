# 开发脚本

数据库相关的日常操作。Windows 用 `.bat`，Linux/macOS 用 `.sh`，两者行为一致。

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
# 1. 起数据库（脚本会等到真正可连接才返回）
./scripts/db-start.sh

# 2. 起后端（首次会自动建表）
cd backend && go run cmd/server/main.go

# 3. 另开终端，导入单词与建筑（可重复执行，幂等）
cd backend && go run cmd/import/main.go
```

或者用 VSCode：`F5` 选「启动后端服务」，再 `F5` 选「导入初始数据（单词 + 建筑）」。

## 脚本做了什么

**`db-start`** 不只是 `docker compose up -d`。容器起来和数据库可连接是两件事，脚本会轮询 healthcheck 直到状态为 `healthy` 才返回，否则紧接着启动后端会撞上 `connection refused`。等待期间如果容器退出，会直接把日志打出来。

**`db-stop`** 默认只停容器、保留数据卷。加 `--clean` 才删数据，且要求输入 `yes` 二次确认。

**`db-status`** 除了容器状态，还会列出数据表和 `users / words / buildings` 的行数，方便确认导入是否成功。

## 连接信息

| 项 | 值 |
|---|---|
| PostgreSQL | `127.0.0.1:5432` |
| 数据库 | `littletown_db` |
| 用户 / 密码 | `postgres` / `littletown_dev_pw` |
| Adminer（网页版管理界面） | http://localhost:8081 |

Adminer 登录时：系统选 `PostgreSQL`，服务器填 `postgres`（容器名，不是 localhost），用户名 `postgres`，密码同上，数据库 `littletown_db`。

这里的密码与 `backend/.env` 的 `DB_PASSWORD` 必须一致，否则后端会报 `password authentication failed`。改动时两处都要改。

## 前置要求

Docker Desktop（Windows/macOS）或 docker engine（Linux）。脚本会检查三件事并给出对应提示：Docker 是否安装、compose 命令是否可用、守护进程是否运行。

## 换端口

如果 5432 或 8081 被占用，改 `backend/docker-compose.yml` 的端口映射，并同步改 `backend/.env` 的 `DB_PORT`：

```yaml
ports:
  - "127.0.0.1:15432:5432"   # 宿主机 15432 → 容器 5432
```

两个端口都只绑定到 `127.0.0.1`，局域网内其他机器连不上，开发库不会意外暴露。
