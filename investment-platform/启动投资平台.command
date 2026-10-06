#!/bin/sh
# 郎刚的投资工作平台 · 双击启动/修复脚本
# 数据同步已由云数据库双写取代（server.js 内置），本脚本只负责平台服务(8307)。
# 优先注册 launchd 守护（开机自启 + 崩溃自动重启）；失败则直接后台启动。
cd "$(dirname "$0")"
NODE=/Users/jimislg/.workbuddy/binaries/node/versions/22.22.2-6/bin/node
PLIST="$HOME/Library/LaunchAgents/com.langang.investment-platform.plist"
UID_N=$(id -u)

# 0) 若已在运行，直接打开
if curl -s --max-time 3 http://127.0.0.1:8307/api/config >/dev/null 2>&1; then
  echo "平台已在运行: http://127.0.0.1:8307"
  open http://127.0.0.1:8307
  exit 0
fi

# 1) 尝试注册 launchd 守护（在真实终端上下文通常可以成功）
launchctl bootstrap "gui/$UID_N" "$PLIST" 2>/dev/null || launchctl load "$PLIST" 2>/dev/null
sleep 2
if curl -s --max-time 3 http://127.0.0.1:8307/api/config >/dev/null 2>&1; then
  echo "launchd 守护已启用（开机自启 + 崩溃自动重启）"
  open http://127.0.0.1:8307
  exit 0
fi

# 2) 兜底：清理残留进程后直接后台启动
lsof -ti :8307 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
sleep 1
nohup "$NODE" server.js >> server.log 2>&1 &
disown
sleep 2
if curl -s --max-time 3 http://127.0.0.1:8307/api/config >/dev/null 2>&1; then
  echo "平台已启动（本次会话守护；重启电脑后将由 launchd 自动接管）"
  open http://127.0.0.1:8307
else
  echo "启动失败，请查看 server.log"
  tail -5 server.log 2>/dev/null
fi
