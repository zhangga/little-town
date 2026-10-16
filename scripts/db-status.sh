#!/usr/bin/env bash
#
# 查看开发数据库状态
#
# 用法：./scripts/db-status.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR/backend"

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

mysql_query() {
  docker exec little-town-mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE" --execute="$1"' sh "$1"
}

echo "=== 容器状态 ==="
$COMPOSE ps

echo
echo "=== 连通性 ==="
if docker inspect --format='{{.State.Health.Status}}' little-town-mysql >/dev/null 2>&1; then
  status="$(docker inspect --format='{{.State.Health.Status}}' little-town-mysql)"
  case "$status" in
    healthy)   echo "✓ 数据库已就绪，可以连接" ;;
    starting)  echo "… 数据库正在启动，稍等几秒" ;;
    unhealthy) echo "✗ 数据库不健康，执行 ./scripts/db-logs.sh 查看日志" ;;
    *)         echo "状态: $status" ;;
  esac
else
  echo "✗ 数据库容器不存在，执行 ./scripts/db-start.sh 启动"
fi

echo
echo "=== 数据表 ==="
# 容器未运行时这条查询会失败，用 || true 让脚本正常结束
if mysql_query "SHOW TABLES" 2>/dev/null; then
  :
else
  echo "  （数据库未运行，或后端尚未首次启动建表）"
fi

echo
echo "=== 数据量 ==="
mysql_query "SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users UNION ALL SELECT 'words', COUNT(*) FROM words UNION ALL SELECT 'buildings', COUNT(*) FROM buildings" 2>/dev/null || true
