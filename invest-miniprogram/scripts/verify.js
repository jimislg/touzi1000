/* 交付前校验：结构完整性 + 用快照数据空跑四个页面模型（wx桩），核对与网页版口径一致 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')

let fail = 0
const T = (name, ok) => { if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL') + ' ' + name) }

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

/* ③ 禁用语法扫描 */
const srcFiles = []
;(function walk (d) {
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) { if (!/node_modules/.test(p) && !/\/scripts$/.test(p)) walk(p) } else if (/\.(js|wxml|wxss)$/.test(f)) srcFiles.push(p)
  })
})(ROOT)
const forbidden = [/<div[\s>]/, /<span[\s>]/, /<img[\s>]/, /\blocalStorage\b/, /\bdocument\./, /\bwindow\./, /\bfetch\(/, /createWorkBuddyCloud/, /\/\.cloud\//]
srcFiles.forEach(f => {
  const s = fs.readFileSync(f, 'utf8')
  const bad = forbidden.filter(re => re.test(s))
  T('禁用语法扫描 ' + path.relative(ROOT, f), bad.length === 0)
})

/* ④ 生成物存在且可解析 */
let CONF = null, SNAP = null
try { CONF = JSON.parse(fs.readFileSync(path.join(ROOT, 'utils/config.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*module\.exports = /, '').replace(/\s*$/, '')) } catch (e) { console.log(e.message) }
T('utils/config.js 生成且含 BASE/KEY', !!(CONF && CONF.BASE && CONF.KEY))
try { eval('SNAP = ' + fs.readFileSync(path.join(ROOT, 'utils/snapshot.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*module\.exports = /, '')) } catch (e) { console.log(e.message) }
T('utils/snapshot.js 生成且含 cfg/quotes/savedAt', !!(SNAP && SNAP.cfg && SNAP.quotes && SNAP.savedAt))

/* ⑤ wx 桩空跑四个页面模型，与网页版口径核对 */
global.wx = { request () {} }
const store = require(path.join(ROOT, 'utils/store.js'))

const tc = store.totalCapital()
console.log('\n—— 口径核对（对照 2026-10-11 网页版快照与今晨行情）——')
console.log('总资产:', (tc / 1e4).toFixed(1), '万 (期望≈1001)')
console.log('持仓市值:', (store.invMV() / 1e4).toFixed(1), '万 (期望≈257)')
console.log('汇率:', store.hkd().toFixed(4), '(期望≈0.8526)')

const idx = store.indexModel()
console.log('总览: 浮盈', idx.pl, '万 (期望≈9.7) · 信号数', idx.sigs.length, '· 已触发', idx.nTrig, '· 接近', idx.nNear)
T('总览模型可渲染', idx.tc && idx.sigs && idx.nTrig !== undefined)
T('总资产≈1000万级', tc > 9000000 && tc < 11000000)

const pos = store.positionsModel()
console.log('持仓: 市数', pos.rows.length, '(期望7) · 腾讯行', (pos.rows.find(r => /腾讯/.test(r.name)) || {}).name || '缺失')
T('持仓7只', pos.rows.length === 7)

const seats = store.seatsModel()
console.log('策略: 席位数', seats.seats.length, '(期望5) · 满配股息', seats.fullDiv, '万/年 · 宁德特别', seats.spec)
const mt = seats.seats[0].members[0]
console.log('  第一席茅台 pill:', mt.pills.map(p => (p.hit ? '✓' : '×') + p.label + p.price + p.amt).join(' | '))
const tencent = seats.seats[1].members[0]
console.log('  第二席腾讯 pill:', tencent.pills.map(p => (p.hit ? '✓' : '×') + p.label + p.price + p.amt).join(' | '))
T('五席结构', seats.seats.length === 5)
T('茅台三档全部未到档(现价>1150)', mt.pills.length === 3 && mt.pills.every(p => !p.hit))
T('腾讯T0未到档(425.8>420)', tencent.pills.every(p => !p.hit))

const watch = store.watchModel()
console.log('观察池: 总数', watch.rows.length, '(期望30) · 可购入', watch.n.trig, '· 持仓', watch.n.held, '· A类', watch.n.a)
T('观察池30标的(宁德重复条目已剔除)', watch.rows.length === 30)

console.log('\n结果: ' + (fail === 0 ? '全部通过' : fail + ' 项失败'))
process.exit(fail === 0 ? 0 : 1)
