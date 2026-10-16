#!/usr/bin/env bash
#
# 启动开发数据库（MySQL + Adminer）
#
# 用法：
#   ./scripts/db-start.sh          启动数据库
#   ./scripts/db-start.sh --reset  清空数据后重新启动（会删除所有小镇数据！）
#
set -euo pipefail

# 切到仓库根目录，保证从任意位置调用都能工作
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR/backend"

RESET=false
for arg in "$@"; do
  case "$arg" in
    --reset|-r) RESET=true ;;
    -h|--help)
      grep '^#' "$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")" | sed 's/^# \{0,1\}//' | head -12
      exit 0
      ;;
    *)
      echo "未知参数: $arg（可用：--reset）" >&2
      exit 1
      ;;
  esac
done

# --- 依赖检查 ---
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ 未找到 docker 命令" >&2
  echo "  请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop" >&2
  exit 1
fi

# docker compose（v2 插件）与 docker-compose（v1 独立程序）都要兼容
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "✗ 未找到 docker compose 命令" >&2
  echo "  请升级 Docker Desktop，或单独安装 docker-compose" >&2
  exit 1
fi

# --- 守护进程是否在跑 ---
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker 守护进程未运行" >&2
  echo "  Windows/macOS 请先启动 Docker Desktop，Linux 执行: sudo systemctl start docker" >&2
  exit 1
fi

if [ "$RESET" = true ]; then
  echo "⚠️  即将清空数据库卷，所有用户、单词、建筑数据都会被删除。"
  printf "   确认请输入 yes: "
  read -r answer
  if [ "$answer" != "yes" ]; then
    echo "已取消。"
    exit 0
  fi
  echo "→ 停止容器并删除数据卷…"
  $COMPOSE down -v
  echo "→ 数据卷已删除，将重新初始化"
fi

echo "→ 启动数据库容器…"
$COMPOSE up -d

# --- 等待数据库就绪 ---
# 容器起来 ≠ 数据库可连接，这里必须等 healthcheck 通过，
# 否则紧接着启动后端会报 connection refused
echo -n "→ 等待数据库就绪"
CONTAINER="little-town-mysql"
READY=false
for i in $(seq 1 120); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "starting")"
  if [ "$status" = "healthy" ]; then
    READY=true
    break
  fi
  # 容器已退出的话不必再等
  running="$(docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo "false")"
  if [ "$running" = "false" ]; then
    echo
    echo "✗ 容器已退出，日志如下：" >&2
    docker logs --tail 30 "$CONTAINER" >&2 || true
    exit 1
  fi
  printf "."
  sleep 1
done
echo

if [ "$READY" != true ]; then
  echo "✗ 等待超时（120 秒）。检查日志：$COMPOSE logs mysql" >&2
  exit 1
fi

echo "✓ 数据库已就绪"
echo
echo "  MySQL       127.0.0.1:3306   库 littletown_db   用户 littletown"
echo "  Adminer     http://localhost:8081"
echo
echo "  下一步："
echo "    启动后端    cd backend && go run cmd/server/main.go"
echo "    导入数据    cd backend && go run cmd/import/main.go"
echo "    停止数据库  ./scripts/db-stop.sh"
