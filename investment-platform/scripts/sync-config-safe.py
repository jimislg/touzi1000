#!/usr/bin/env python3
"""安全同步：本地 config.json → VPS，覆盖前强制检测网页端是否有新保存。
郎刚 2026-11-14 定：11:28 用本地单向覆盖，抹掉了网页端手工调整的7只档位，故立此守卫。

用法：python3 scripts/sync-config-safe.py [--force-merge]
无参数：若 VPS 自上次同步后被网页端改过 → 中止并列出差异，绝不覆盖。
--force-merge：把 VPS 上的新改动合并进本地后再同步（需人工核对差异输出）。
"""
import json, subprocess, sys, os, hashlib, tempfile, shlex
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, 'config.json')
BASE = os.path.join(ROOT, 'scripts', '.vps-sync-baseline.json')
VPS = 'root@149.28.89.105:/opt/invest-platform/config.json'
KEYS = ['universe', 'holdings', 'trades', 'investableAmount', 'cash', 'targetCapital', 'seats']

def fp(c):
    return {k: c.get(k) for k in KEYS}

def run(cmd, **kw):
    return subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True, **kw).stdout

remote = os.path.join(tempfile.gettempdir(), 'vps-config-before-sync.json')
run('scp -q ' + VPS + ' ' + shlex.quote(remote))
cur = json.load(open(CFG, encoding='utf-8'))
vps = json.load(open(remote, encoding='utf-8'))
base = json.load(open(BASE, encoding='utf-8')) if os.path.exists(BASE) else None

if base is not None and fp(vps) != fp(base):
    print('❌ 中止：VPS 自上次同步后被网页端改过，直接覆盖会丢失这些修改。')
    B = {x['code']: x for x in base.get('universe', [])}
    V = {x['code']: x for x in vps.get('universe', [])}
    for code, y in V.items():
        x = B.get(code, {})
        if [t.get('price') for t in x.get('tiers', [])] != [t.get('price') for t in y.get('tiers', [])]:
            print('  档位差异:', y.get('name'), [t.get('price') for t in x.get('tiers', [])], '→', [t.get('price') for t in y.get('tiers', [])])
        for k in ['buyPrice', 'plan', 'note']:
            if x.get(k) != y.get(k) and k != 'tiers':
                print('  字段差异:', y.get('name'), k)
    if '--force-merge' not in sys.argv:
        print('  请先核对差异，用 --force-merge 合并后再同步，或手工合并 config.json。')
        sys.exit(2)
    # 合并：VPS 上被网页端改过的字段优先，其余用本地
    C = {x['code']: x for x in cur['universe']}
    for code, y in V.items():
        x = B.get(code, {})
        if code in C and (x != y):
            for k in ['tiers', 'buyPrice', 'plan', 'note']:
                if x.get(k) != y.get(k):
                    C[code][k] = y.get(k)
    json.dump(cur, open(CFG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('✅ 已把 VPS 新改动合并进本地 config.json')

# 覆盖写入 + 备份 + 重启 + 回读校验
run(f'ssh root@149.28.89.105 "cp /opt/invest-platform/config.json /opt/invest-platform/config.json.backup-safesync-$(date +%Y%m%d%H%M%S)"')
run('scp -q ' + shlex.quote(CFG) + ' ' + VPS)
run('ssh root@149.28.89.105 "chmod 600 /opt/invest-platform/config.json && systemctl restart invest-platform"')
after = os.path.join(tempfile.gettempdir(), 'vps-config-after-sync.json')
run('scp -q ' + VPS + ' ' + shlex.quote(after))
a = json.load(open(after, encoding='utf-8'))
c = json.load(open(CFG, encoding='utf-8'))
if fp(a) != fp(c):
    print('❌ 回读校验失败：VPS 与本地不一致'); sys.exit(3)
json.dump(c, open(BASE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('✅ 同步完成：VPS 与本地一致，baseline 已更新（下次覆盖前会自动守卫）')
