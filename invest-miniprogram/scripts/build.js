/* 构建：①从 investment-platform/publicConfig.json 生成 utils/config.js
 *      （MP 共享网关 endpoint + publishableKey，公开密钥不落源码字面量，保持注入纪律）
 *      ②拉线上 config + 实时行情 生成 utils/snapshot.js（小程序离线秒开快照）
 * 用法：node scripts/build.js
 * 时机：平台数据大更新后（档位/持仓/席位变化）重跑一次刷新快照即可。 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const PLAT = path.join(ROOT, '..', 'investment-platform')
require('./sync-core')
/* 2026-10-23 起：WorkBuddy 云下线，平台迁移到 Vultr 自建服务器（HTTP+口令）。
 * 如换地址/端口，改这里或用环境变量 PLATFORM_BASE 覆盖后重跑本脚本。 */
const BASE = process.env.PLATFORM_BASE || 'http://149.28.89.105:8307'

;(async () => {
  const pub = JSON.parse(fs.readFileSync(path.join(PLAT, 'publicConfig.json'), 'utf8'))
  if (!pub.publishableKey || !pub.publishableKey.startsWith('wbpk_')) throw new Error('publicConfig.json 无合法 publishableKey')
  /* 小程序数据源 = 自建服务器（原 mp-api.app.workbuddy.host 共享网关已随云服务下线废弃） */
  const MP_ENDPOINT = BASE
  /* 自建服务器口令（= 平台 accessKey），注入 config.js 供请求头 Cookie 使用 */
  const key = JSON.parse(fs.readFileSync(path.join(PLAT, 'config.json'), 'utf8')).accessKey
  const cfg = await (await fetch(BASE + '/api/config', { headers: { Cookie: 'ak=' + key } })).json()
  if (!cfg || !Array.isArray(cfg.holdings)) throw new Error('线上 config 拉取失败')

  const syms = [...new Set([...cfg.holdings.map(h => h.qt), ...cfg.universe.map(u => u.qt), 'whHKDCNY'])].join(',')
  const qj = await (await fetch(BASE + '/api/quotes?symbols=' + encodeURIComponent(syms), { headers: { Cookie: 'ak=' + key } })).json()

  const missing = require('../utils/investment-core').missingSymbols(qj && qj.quotes, syms)
  if (!qj || !qj.ok || missing.length) throw new Error('行情不完整，不覆盖离线快照：' + missing.join(', '))

  fs.writeFileSync(path.join(ROOT, 'utils', 'config.js'),
    '/* 由 scripts/build.js 生成（MP_ENDPOINT=自建服务器数据源，MP_KEY=访问口令；PUB_KEY 为云端遗留参数，当前链路未使用），勿手改 */\n' +
    'module.exports = ' + JSON.stringify({ MP_ENDPOINT: MP_ENDPOINT, MP_KEY: key, PUB_KEY: pub.publishableKey }, null, 2) + '\n')

  const snap = { savedAt: new Date().toISOString(), cfg: cfg, quotes: (qj && qj.quotes) || {} }
  fs.writeFileSync(path.join(ROOT, 'utils', 'snapshot.js'),
    '/* 由 scripts/build.js 生成的离线快照（含持仓成本，仅个人使用），勿手改 */\nmodule.exports = ' + JSON.stringify(snap) + '\n')

  console.log('生成 utils/config.js + utils/snapshot.js')
  console.log('MP网关:', MP_ENDPOINT, '| publishableKey前缀:', pub.publishableKey.slice(0, 5) + '***')
  console.log('快照时间:', snap.savedAt, '| 行情标的:', Object.keys(snap.quotes).length, '| 持仓:', cfg.holdings.length, '| 观察池:', cfg.universe.length)
})().catch(e => { console.error('构建失败:', e.message); process.exit(1) })
