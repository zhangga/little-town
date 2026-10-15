#!/usr/bin/env bash
#
# 查看数据库日志
#
# 用法：
#   ./scripts/db-logs.sh         查看最近 100 行
#   ./scripts/db-logs.sh -f      持续跟踪输出（Ctrl+C 退出）
#   ./scripts/db-logs.sh 500     查看最近 500 行
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR/backend"

FOLLOW=""
TAIL=100
for arg in "$@"; do
  case "$arg" in
    -f|--follow) FOLLOW="-f" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -9
      exit 0
      ;;
    ''|*[!0-9]*)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
    *) TAIL="$arg" ;;
  esac
done

if ! docker inspect little-town-db >/dev/null 2>&1; then
  echo "✗ 数据库容器不存在，执行 ./scripts/db-start.sh 启动" >&2
  exit 1
fi

if [ -n "$FOLLOW" ]; then
  docker logs -f --tail "$TAIL" little-town-db
else
  docker logs --tail "$TAIL" little-town-db
fi
