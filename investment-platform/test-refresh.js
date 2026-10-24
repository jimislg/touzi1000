/* 执行网页原始脚本，验证整组提交、请求合并、编辑保护和保存冲突。 */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict')
const CORE = require('./public/investment-core')
const clone = x => JSON.parse(JSON.stringify(x))
let passed = 0
function check (name, ok) { assert.ok(ok, name); passed++; console.log('PASS ' + name) }
const a = { investable: 1000, cashYield: 1, holdings: [], universe: [{ code: '600000.SH', qt: 'sh600000', name: '合成样本', px: 10 }], _revision: 'a'.repeat(64), _syncStatus: 'synced' }
const b = clone(a); b.investable = 900; b.universe.push({ code: '600001.SH', qt: 'sh600001', name: '新增样本', px: 20 }); b._revision = 'b'.repeat(64)
const initialQuotes = { sh600000: { price: 10, time: '20261016150000' }, whHKDCNY: { price: 0.85 } }
function runtime () {
  const elements = {}, storage = new Map()
  const el = id => elements[id] || (elements[id] = { value: '', checked: false, style: {}, textContent: '', innerHTML: '', classList: { contains: () => false, toggle () {}, add () {} }, addEventListener () {} })
  const state = { cfg: b, quotes: { ...initialQuotes, sh600001: { price: 20, time: '20261016150000' } }, configCalls: 0, quoteCalls: 0, beforeQuote: null, beforeSave: null, saveStatus: 200 }
  const context = vm.createContext({
    InvestmentCore: CORE, console, Date, location: {hash:''}, setTimeout: () => 0, clearTimeout () {}, setInterval: () => 0, clearInterval () {}, alert () {},
    document: { querySelectorAll: () => [], getElementById: el, addEventListener () {}, activeElement: null, documentElement: el('html') },
    window: { addEventListener () {} }, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    fetch: async (url, options) => {
      if (options && options.method === 'POST') {
        if (state.beforeSave) await state.beforeSave()
        if(state.saveStatus===200){state.cfg={...clone(state.cfg),investable:JSON.parse(options.body).investable,_revision:'c'.repeat(64)};}
        return { ok:state.saveStatus===200, status: state.saveStatus, json: async () => state.saveStatus === 409 ? { ok: false, err: 'conflict' } : { ok: true, revision: 'c'.repeat(64), cloudSync: true, syncStatus: 'synced' } }
      }
      if (url.includes('/api/config')) { state.configCalls++; return { ok:true,json: async () => clone(state.cfg) } }
      if (url.includes('/api/quotes')) { state.quoteCalls++; if (state.beforeQuote) await state.beforeQuote(); return { json: async () => ({ ok: true, quotes: clone(state.quotes) }) } }
      return { json: async () => ({ ok: false }) }
    }
  })
  let js = fs.readFileSync(require('path').join(__dirname, 'public/index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1]
  js = js.slice(0, js.indexOf('/* —— 启动 —— */'))
  vm.runInContext(js, context)
  const run = code => vm.runInContext(code, context)
  context.fixture = clone(a); context.quotes = clone(initialQuotes)
  run('CFG=fixture;Q=quotes;renderAll=()=>renderDataQuality();fillCalcSel=()=>{};')
  return { state, run, el, context, storage }
}
;(async () => {
  const rt = runtime(), oldCfg = rt.run('CFG'), oldQ = rt.run('Q')
  delete rt.state.quotes.sh600001
  await rt.run('refresh(false)')
  check('新增代码行情不全时不提交新配置或行情', rt.run('CFG') === oldCfg && rt.run('Q') === oldQ && rt.run('lastFetch') === null)
  rt.state.quotes.sh600001 = { price: 20, time: '20261016150000' }
  rt.state.configCalls = 0
  const first = rt.run('refresh(false)'), second = rt.run('refresh(true)')
  check('手动和自动同时刷新共用一个Promise', first === second)
  await first
  check('配置与对应行情一起生效且只发一次配置请求', rt.run('CFG.investable') === 900 && rt.run('Q.sh600001.price') === 20 && rt.state.configCalls === 1)
  let release, started
  const waiting = new Promise(resolve => { started = resolve })
  rt.state.beforeQuote = () => new Promise(resolve => { release = resolve; started() })
  const pending = rt.run('refresh(false)'); await waiting
  rt.run('CFG.investable=123;markDirty()'); const edited = rt.run('CFG')
  release(); await pending
  check('响应晚于用户编辑时整组丢弃', rt.run('CFG') === edited && rt.run('CFG.investable') === 123 && rt.run('dirty'))
  rt.state.beforeQuote = null
  rt.run('dirty=false')
  rt.state.saveStatus = 409
  await rt.run('saveConfig()'); await rt.run('confirmSave()')
  check('保存冲突保留本地编辑与版本且不自动重试覆盖', rt.run('dirty') && rt.run('CFG.investable') === 123 && rt.el('saveText').textContent.includes('待核实'))
  check('保存冲突持久保留包含现金字段的草稿', JSON.parse(rt.storage.get('ip_pending_edit_v2')).investable === 123)
  rt.state.saveStatus = 200
  let saveReady
  const saving = new Promise(resolve => { saveReady = resolve })
  rt.state.beforeSave = () => new Promise(resolve => { release = resolve; saveReady() })
  await rt.run('saveConfig()');const save = rt.run('confirmSave()'); await saving
  const beforeSaveResponse = rt.run('CFG'); await rt.run('refresh(false)')
  check('保存等待期间刷新不替换编辑对象或版本', rt.run('CFG') === beforeSaveResponse)
  rt.run('CFG.investable=456;markDirty()'); release(); await save
  check('保存期间新编辑不被成功响应清除dirty', rt.run('dirty') && rt.run('CFG.investable') === 456 && rt.run('CFG._revision') === 'c'.repeat(64))
  const d = CORE.dataQuality(a, initialQuotes, Date.parse('2026-10-18T04:00:00Z'))
  check('周末请求成功仍标注报价来自此前日期', d.priorDate === 1 && CORE.displayQuoteTime(d.oldestTime) === '2026-10-16 15:00')
  check('缺失汇率可见且不冒充实时报价', CORE.dataQuality(a, { sh600000: { price: 10 } }).fxFallback)
  check('零成本收益率不产生Infinity', CORE.holdingValue({ market: 'A', shares: 0, cost: 0, dps: 0 }, { price: 10 }, 0.85).plPct === null)
  check('三档IRR锚保持12/15/17.46%', [100, 80, 60].every((p, i) => Math.abs(CORE.irrAt(p, [100, 80, 60], [0.12,0.15,0.1746]) - [0.12, 0.15, 0.1746][i]) < 1e-10))
  check('四档IRR锚保持10/12/15/17.46%', [120, 100, 80, 60].every((p, i) => Math.abs(CORE.irrAt(p, [120, 100, 80, 60], [0.1,0.12,0.15,0.1746]) - [0.10, 0.12, 0.15, 0.1746][i]) < 1e-10))
  check('港股时间完整归一化', CORE.parseQuotes('v_hk00700="1~sample~00700~100' + '~'.repeat(27) + '2026/10/16 16:08:52"').hk00700.time === '20261016160852')
  const cfg = { holdings: [{ code: '0700.HK', qt: 'hk00700', market: 'HK', shares: 100, cost: 90, dps: 5 }], universe: [{ code: '0700.HK', dpsSpecial: 2 }] }
  check('满配股息普通与特别分列并保持港股80%税后', CORE.dividendForBudget(cfg, { hk00700: { price: 100 }, whHKDCNY: { price: 0.85 } }, '0700.HK', 10000, false, false) === 400 && CORE.dividendForBudget(cfg, { hk00700: { price: 100 }, whHKDCNY: { price: 0.85 } }, '0700.HK', 10000, true, false) === 560)
  const summary = CORE.researchSummary({ researchStatus: 'done' })
  check('研究完成标记不冒充已填写的持有逻辑与证伪条件', summary.thesis.includes('未录入') && summary.breakers.includes('未录入'))
  console.log('整组刷新回归全部通过: ' + passed)
})().catch(e => { console.error(e); process.exitCode = 1 })
