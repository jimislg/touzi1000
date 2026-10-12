/* 构建：①从 investment-platform/config.json 读 accessKey 生成 utils/config.js（口令不进源码字面量）
 *      ②拉线上 config + 实时行情 生成 utils/snapshot.js（小程序离线秒开快照）
 * 用法：node scripts/build.js
 * 时机：平台数据大更新后（档位/持仓/席位变化）重跑一次刷新快照即可。 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const PLAT = path.join(ROOT, '..', 'investment-platform')
const BASE = 'https://langang-invest.app.workbuddy.host'

;(async () => {
  const plat = JSON.parse(fs.readFileSync(path.join(PLAT, 'config.json'), 'utf8'))
  const key = plat.accessKey
  if (!key) throw new Error('investment-platform/config.json 无 accessKey，无法生成口令')

  const cfg = await (await fetch(BASE + '/api/config', { headers: { Cookie: 'ak=' + key } })).json()
  if (!cfg || !Array.isArray(cfg.holdings)) throw new Error('线上 config 拉取失败')
  /* 口令一致性检查：只打印结论，不打印值 */
  console.log('口令一致性(线上cfg.accessKey vs 本地闸门口令):', cfg.accessKey === key ? '一致 ✓' : '!! 不一致 —— 站点保存后闸门可能翻转，需统一')

  const syms = [...new Set([...cfg.holdings.map(h => h.qt), ...cfg.universe.map(u => u.qt), 'whHKDCNY'])].join(',')
  const qj = await (await fetch(BASE + '/api/quotes?symbols=' + encodeURIComponent(syms), { headers: { Cookie: 'ak=' + key } })).json()

  fs.writeFileSync(path.join(ROOT, 'utils', 'config.js'),
    '/* 由 scripts/build.js 生成（口令源自 investment-platform/config.json），勿手改 */\n' +
    'module.exports = ' + JSON.stringify({ BASE: BASE, KEY: key }, null, 2) + '\n')

  const snap = { savedAt: new Date().toISOString(), cfg: cfg, quotes: (qj && qj.quotes) || {} }
  fs.writeFileSync(path.join(ROOT, 'utils', 'snapshot.js'),
    '/* 由 scripts/build.js 生成的离线快照（含持仓成本，仅个人使用），勿手改 */\nmodule.exports = ' + JSON.stringify(snap) + '\n')

  console.log('生成 utils/config.js + utils/snapshot.js')
  console.log('快照时间:', snap.savedAt, '| 行情标的:', Object.keys(snap.quotes).length, '| 持仓:', cfg.holdings.length, '| 观察池:', cfg.universe.length)
})().catch(e => { console.error('构建失败:', e.message); process.exit(1) })
