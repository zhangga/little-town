#!/usr/bin/env bash
#
# 停止开发数据库
#
# 用法：
#   ./scripts/db-stop.sh          停止容器（保留数据）
#   ./scripts/db-stop.sh --clean  停止并删除数据卷（下次启动是全新数据库）
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR/backend"

CLEAN=false
for arg in "$@"; do
  case "$arg" in
    --clean|-c) CLEAN=true ;;
    -h|--help)
      grep '^#' "$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")" | sed 's/^# \{0,1\}//' | head -8
      exit 0
      ;;
    *)
      echo "未知参数: $arg（可用：--clean）" >&2
      exit 1
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ 未找到 docker 命令" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "✗ 未找到 docker compose 命令" >&2
  exit 1
fi

if [ "$CLEAN" = true ]; then
  echo "⚠️  将同时删除数据卷，所有数据不可恢复。"
  printf "   确认请输入 yes: "
  read -r answer
  if [ "$answer" != "yes" ]; then
    echo "已取消。"
    exit 0
  fi
  $COMPOSE down -v
  echo "✓ 容器已停止，数据卷已删除"
  echo "  下次 ./scripts/db-start.sh 会得到全新数据库"
else
  $COMPOSE down
  echo "✓ 容器已停止（数据保留在 docker 卷中）"
  echo "  重新启动：./scripts/db-start.sh"
fi
