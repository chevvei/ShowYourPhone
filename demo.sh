#!/usr/bin/env bash
# iPhone Duo · 一键演示服务
# 用法：
#   ./demo.sh          局域网演示：手机连同一 WiFi，浏览器打开打印的地址
#   ./demo.sh tunnel   公网隧道：生成 https 链接发微信，远程随时看（需 cloudflared）
#   ./demo.sh port 9000    自定义端口
# 前提：项目根目录若有 iphoneDuo-custom.json（页面「⤓ 导出配置」导出），
#       每次启动自动重新打包，照片随链接一起发布。
set -e
cd "$(dirname "$0")"

PORT=8000
MODE=lan
while [ $# -gt 0 ]; do
  case "$1" in
    tunnel) MODE=tunnel ;;
    port)   PORT="$2"; shift ;;
  esac
  shift
done

# ---- 重新打包（有发布者配置则带上）----
CONFIG_ARGS=()
[ -f iphoneDuo-custom.json ] && CONFIG_ARGS=(--config iphoneDuo-custom.json)
if [ -f iphoneDuo-custom.json ]; then
  python3 build.py "${CONFIG_ARGS[@]}" >/dev/null && echo "[1/2] 已打包（含发布照片）"
else
  python3 build.py >/dev/null && echo "[1/2] 已打包（无发布照片，可在页面「⤓ 导出配置」后重启本脚本）"
fi

URL_PATH="/dist/iphoneDuo.html"
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
LAN_URL="http://${LAN_IP}:${PORT}${URL_PATH}"

echo "[2/2] 演示服务启动"
echo "=================================================="
echo "  本机打开:   http://localhost:${PORT}${URL_PATH}"
echo "  手机打开:   ${LAN_URL}   （需连同一 WiFi）"
echo "  分享码:     可加 ?sharecode=CODE 访问 dist/share/ 下的照片包"
command -v qrencode >/dev/null 2>&1 && qrencode -t ANSIUTF8 "${LAN_URL}" && echo "  ^ 扫码直达"
echo "=================================================="
echo "  Ctrl+C 停止"

# ---- 公网隧道模式（cloudflared 免费无需注册）----
if [ "$MODE" = "tunnel" ]; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "未安装 cloudflared，安装后重试："
    echo "  sudo apt install cloudflared   # 或"
    echo "  https://github.com/cloudflare/cloudflared/releases 下载最新 linux-amd64"
    exit 1
  fi
  echo "公网隧道启动中，生成的 https 链接可直接发微信/邮件（手机电脑均可打开）..."
  exec cloudflared tunnel --url "http://localhost:${PORT}"
fi

exec python3 -m http.server "$PORT"
