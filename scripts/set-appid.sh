#!/usr/bin/env bash
#
# 把新的小程序 AppID 同步到所有需要它的地方。
#
# AppID 散落在四处：两个小程序工程配置 + 后端 .env + .env.example。
# 手动改容易漏，漏掉后端那处会导致登录时报「小程序 AppID 无效」，
# 而配置文件看起来又是对的，很难排查。所以统一用这个脚本改。
#
# 用法：
#   ./scripts/set-appid.sh wx1234567890abcdef
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

APPID="${1:-}"

if [ -z "$APPID" ]; then
  echo "用法: $0 <AppID>" >&2
  echo "例如: $0 wx1234567890abcdef" >&2
  exit 1
fi

# 微信 AppID 格式：wx + 16 位十六进制
if ! printf '%s' "$APPID" | grep -qE '^wx[0-9a-fA-F]{16}$'; then
  echo "✗ AppID 格式不对：$APPID" >&2
  echo "  正确格式：wx 开头 + 16 位十六进制字符，共 18 位" >&2
  echo "  在微信公众平台「设置 → 基本设置」里可以查到" >&2
  exit 1
fi

# 待更新的文件与各自的匹配模式
JSON_FILES="miniapp/project.config.json miniapp/project.private.config.json"
ENV_FILES="backend/.env backend/.env.example"

updated=0

# --- 小程序工程配置：替换 "appid": "..." ---
for f in $JSON_FILES; do
  if [ ! -f "$f" ]; then
    echo "  ! 跳过不存在的文件: $f"
    continue
  fi

  before="$(grep -oE '"appid"[[:space:]]*:[[:space:]]*"[^"]*"' "$f" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
  if [ "$before" = "$APPID" ]; then
    echo "  · $f（已是该 AppID）"
    continue
  fi

  # 用临时文件替换，兼容 GNU sed 与 BSD sed（-i 的参数不同）
  tmp="$(mktemp)"
  sed "s/\"appid\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"appid\": \"$APPID\"/" "$f" > "$tmp"
  mv "$tmp" "$f"
  echo "  ✓ $f  ${before:-（空）} → $APPID"
  updated=$((updated + 1))
done

# --- 后端配置：替换 WECHAT_APPID=... ---
for f in $ENV_FILES; do
  if [ ! -f "$f" ]; then
    echo "  ! 跳过不存在的文件: $f"
    continue
  fi

  before="$(grep -E '^WECHAT_APPID=' "$f" | head -1 | cut -d= -f2-)"
  if [ "$before" = "$APPID" ]; then
    echo "  · $f（已是该 AppID）"
    continue
  fi

  tmp="$(mktemp)"
  sed "s|^WECHAT_APPID=.*|WECHAT_APPID=$APPID|" "$f" > "$tmp"
  mv "$tmp" "$f"
  echo "  ✓ $f  ${before:-（空）} → $APPID"
  updated=$((updated + 1))
done

echo
if [ "$updated" -eq 0 ]; then
  echo "所有位置已经是 $APPID，无需改动。"
else
  echo "已更新 $updated 处。"
fi

echo
echo "接下来："
echo "  1. 微信开发者工具里重新导入项目（或详情 → 修改 AppID）"
echo "  2. 重启后端，启动日志应显示：微信登录：已配置（AppID ${APPID:0:4}****${APPID: -4}）"
echo "  3. 在微信公众平台后台把 request 合法域名配上（上线前必需，本地联调可跳过）"
