/* 交付前校验：结构完整性 + 用快照数据空跑四个页面模型（wx桩），核对与网页版口径一致 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')

let fail = 0
const T = (name, ok) => { if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL') + ' ' + name) }

/* 两端共用口径必须逐字节一致 */
T('网页版与小程序共用口径一致', fs.readFileSync(path.join(ROOT, '../investment-platform/public/investment-core.js')).equals(fs.readFileSync(path.join(ROOT, 'utils/investment-core.js'))))

/* ① JSON 严格解析 */
;['app.json', 'project.config.json', 'sitemap.json',
  'pages/index/index.json', 'pages/positions/positions.json', 'pages/seats/seats.json', 'pages/watch/watch.json'
].forEach(f => {
  let ok = false
  try { JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); ok = true } catch (e) { console.log('  ', f, e.message) }
  T('JSON严格解析 ' + f, ok)
})

/* ② app.json pages ↔ 文件存在 + lazyCodeLoading */
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
appJson.pages.forEach(p => {
  T('页面文件存在 ' + p + '.wxml', fs.existsSync(path.join(ROOT, p + '.wxml')))
  T('页面文件存在 ' + p + '.js', fs.existsSync(path.join(ROOT, p + '.js')))
})
T('lazyCodeLoading=requiredComponents', appJson.lazyCodeLoading === 'requiredComponents')
T('tabBar 每项 pagePath 都在 pages 中', appJson.tabBar.list.every(t => appJson.pages.includes(t.pagePath)))
T('首屏为总览页', appJson.pages[0] === 'pages/index/index')

/* ③ 禁用语法扫描（应用代码；libs/ 为官方云SDK bundle，豁免——其内部含 .cloud 路径与 fetch 引用属正常） */
const srcFiles = []
;(function walk (d) {
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) { if (!/node_modules/.test(p) && !/\/scripts$/.test(p) && !/\/libs$/.test(p)) walk(p) } else if (/\.(js|wxml|wxss)$/.test(f)) srcFiles.push(p)
  })
})(ROOT)
const forbidden = [/<div[\s>]/, /<span[\s>]/, /<img[\s>]/, /\blocalStorage\b/, /\bdocument\./, /\bwindow\./, /\bfetch\(/, /createWorkBuddyCloud/, /\/\.cloud\//]
srcFiles.forEach(f => {
  const s = fs.readFileSync(f, 'utf8')
  const bad = forbidden.filter(re => re.test(s))
  T('禁用语法扫描 ' + path.relative(ROOT, f), bad.length === 0)
})
const LIB = path.join(ROOT, 'libs', 'workbuddy-cloud.js')
T('libs/workbuddy-cloud.js 官方SDK存在', fs.existsSync(LIB) && fs.statSync(LIB).size > 400000)

/* ④ 生成物存在且可解析 */
let CONF = null, SNAP = null
try { CONF = JSON.parse(fs.readFileSync(path.join(ROOT, 'utils/config.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*module\.exports = /, '').replace(/\s*$/, '')) } catch (e) { console.log(e.message) }
T('utils/config.js 生成且含 MP_ENDPOINT/PUB_KEY', !!(CONF && CONF.MP_ENDPOINT && CONF.PUB_KEY && CONF.PUB_KEY.indexOf('wbpk_') === 0))
try { eval('SNAP = ' + fs.readFileSync(path.join(ROOT, 'utils/snapshot.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*module\.exports = /, '')) } catch (e) { console.log(e.message) }
T('utils/snapshot.js 生成且含 cfg/quotes/savedAt', !!(SNAP && SNAP.cfg && SNAP.quotes && SNAP.savedAt))

/* ④' 行情解析与 server.js 同源校验（合成 gtimg 样本：idx3现价/idx4昨收/idx30时间/idx32涨跌幅） */
const QQ = require(path.join(ROOT, 'utils/quotes.js'))
{
  const f = []
  f[0] = '1485.00'; f[1] = '1470.00'; f[27] = '20261014150000'; f[29] = '1.02'
  const s = 'v_sh600519="1~guizhou~600519~' + f.join('~') + '"'
  const q = QQ.parseQuotes(s).sh600519
  T('parseQuotes 同源(price/prevClose/pct/time)', q && q.price === 1485 && q.prevClose === 1470 && q.pct === 1.02 && q.time === '20261014150000')
}

/* ⑤ wx 桩空跑四个页面模型，与网页版口径核对 */
global.wx = { request () {} }
const store = require(path.join(ROOT, 'utils/store.js'))

const tc = store.totalCapital()
const idx = store.indexModel()
T('总览模型可渲染', idx.tc && idx.sigs && idx.nTrig !== undefined)
T('总资本为有限数值', Number.isFinite(tc) && tc >= 0)
const pos = store.positionsModel()
T('持仓行数与快照一致', pos.rows.length === SNAP.cfg.holdings.length)
T('总览和持仓浮盈百分比一致', idx.plPct + '%' === pos.plPct || idx.plPct === '—')
const seats = store.seatsModel()
const expectedSeats = (SNAP.cfg.seats && SNAP.cfg.seats.list) || []
T('席位结构与快照一致', expectedSeats.length ? seats.seats.length === expectedSeats.length : !!seats.noSeats || seats.seats.length === 0)
const watch = store.watchModel()
T('观察池行数与快照一致', watch.rows.length === SNAP.cfg.universe.length)
T('观察池代码无重复', new Set(watch.rows.map(r => r.code)).size === watch.rows.length)

console.log('\n结果: ' + (fail === 0 ? '全部通过' : fail + ' 项失败'))
process.exit(fail === 0 ? 0 : 1)
