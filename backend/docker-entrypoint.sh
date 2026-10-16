#!/bin/sh
set -eu

# 仅启动服务时初始化；一次性 push/import 命令不隐式导入词库。
if [ "${1:-}" = "/app/server" ] && [ "${INIT_DATA:-false}" = "true" ]; then
  /app/import
fi
exec "$@"
