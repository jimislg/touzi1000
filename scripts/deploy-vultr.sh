#!/bin/zsh
# 投资平台 Vultr 自建服务器部署脚本（2026-10-23 起，WorkBuddy 云下线后的替代通道）
# 服务器：Vultr 洛杉矶 xray-los-angeles-1（149.28.89.105，Ubuntu 24.04，systemd 服务 invest-platform，端口 8307）
#
# 用法：
#   zsh scripts/deploy-vultr.sh          # 交互提示
#   zsh scripts/deploy-vultr.sh push     # 本地 → 服务器（代码+配置，改完代码/数据后发布）
#   zsh scripts/deploy-vultr.sh pull     # 服务器 → 本地（网站端保存过数据后，拉回并 git 提交）
#   zsh scripts/deploy-vultr.sh status   # 查看服务状态与两端 revision 对比
#
# 数据权威说明：网站端编辑（POST /api/config）直接写服务器 /opt/invest-platform/config.json
# 并留 .pending journal；push 前先 pull 可避免覆盖。本地 git 仓库是长期归档，pull 后请提交。

set -e
HOST=${VULTR_HOST:-root@149.28.89.105}
REMOTE=/opt/invest-platform
LOCAL="$(cd "$(dirname "$0")/.." && pwd)/investment-platform"
RSYNC="rsync -az --stats -e 'ssh -o BatchMode=yes'"
SSH="ssh -o BatchMode=yes $HOST"

node_bin=/Users/jimislg/.workbuddy/binaries/node/versions/22.22.2-6/bin/node

rev_of() { $node_bin -e "
  const crypto=require('crypto'),fs=require('fs');
  const cfg=JSON.parse(fs.readFileSync('$1','utf8'));
  const core=require('/Users/jimislg/Documents/郎刚的芒格/investment-platform/public/investment-core.js');
  try{console.log(core.revisionOf?core.revisionOf(cfg):'n/a')}catch(e){console.log('n/a')}
" 2>/dev/null || echo "读取失败"; }

case "${1:-}" in
  push)
    echo "== push：本地 → 服务器 =="
    eval $RSYNC $LOCAL/server.js $LOCAL/cloud-store.js $LOCAL/config-service.js $LOCAL/config.json $LOCAL/package.json $LOCAL/publicConfig.json $LOCAL/divcache.json $LOCAL/public $LOCAL/node_modules $HOST:$REMOTE/
    $SSH 'systemctl restart invest-platform && systemctl is-active invest-platform'
    echo "== push 完成，公网自检 =="
    curl -s --noproxy '*' -o /dev/null -w 'HTTP %{http_code}\n' "http://149.28.89.105:8307/"
    ;;
  pull)
    echo "== pull：服务器 → 本地 =="
    if $SSH "test -f $REMOTE/config.json.pending"; then
      echo "⚠️ 服务器存在未清空的 .pending journal（云端已死属正常），以服务器 config.json 为准拉取"
    fi
    rsync -az -e "ssh -o BatchMode=yes" $HOST:$REMOTE/config.json "$LOCAL/config.json"
    echo "已拉取。请核对后 git 提交：git diff investment-platform/config.json"
    ;;
  status)
    $SSH 'systemctl is-active invest-platform; free -m | head -2; ss -tlnp | grep 8307'
    echo "-- 本地 revision --"; rev_of "$LOCAL/config.json"
    echo "-- 服务器 revision --"
    $SSH "md5sum $REMOTE/config.json | cut -c1-12"
    echo "-- 本地 md5 --"; md5 -q "$LOCAL/config.json" | cut -c1-12
    ;;
  *)
    sed -n '2,16p' "$0"; exit 1 ;;
esac
