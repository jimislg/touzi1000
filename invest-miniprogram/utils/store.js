/* 数据层：快照秒开 → 实时覆盖。计算口径与网页版 public/index.html 完全同源。
 * 实时链路 = 自建服务器 /api/config（口令 Cookie，2026-10-23 起替代 WorkBuddy 云网关）+ 腾讯行情源直拉（行情）。
 * 平台网站域名被 WAF 拦 MicroMessenger UA（403）的问题已随自建部署消除；小程序为纯只读客户端。 */
const CONF = require('./config')
const CORE = require('./investment-core')

let SNAP = null
try { SNAP = require('./snapshot') } catch (e) { SNAP = null }

const state = {
  CFG: (SNAP && SNAP.cfg) || null,
  Q: (SNAP && SNAP.quotes) || {},
  source: SNAP ? 'snapshot' : 'loading', /* live | stale | snapshot | loading */
  lastFetch: null,
  snapshotAt: (SNAP && SNAP.savedAt) || null,
  error: null,
  loading: false,
  _lastLoad: 0
}

const listeners = []
function onUpdate (cb) {
  listeners.push(cb)
  return function unsub () { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1) }
}
function emit () { listeners.slice().forEach(f => { try { f() } catch (e) {} }) }

/* ── 基础工具 ── */
function fmt (n, d) {
  d = d == null ? 0 : d
  if (n == null || !Number.isFinite(n)) return '—'
  const neg = n < 0
  const parts = Math.abs(n).toFixed(d).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + parts[0] + (parts[1] ? '.' + parts[1] : '')
}
function sign (n) { return (n >= 0 ? '+' : '') + (n == null || isNaN(n) ? '—' : fmt(n, 2)) + '%' }
function clsN (n) { return n == null || !Number.isFinite(n) ? 'muted' : (n >= 0 ? 'up' : 'down') }
function hhmm (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = x => (x < 10 ? '0' : '') + x
  return d.getHours() + ':' + p(d.getMinutes())
}
function dateOf (iso) { return iso ? iso.slice(0, 10) + ' ' + hhmm(iso) : '' }

/* ── 行情与持仓（网页版同源口径） ── */
function q (u) { return CORE.quoteOf(u, state.Q) }
function hkd () { return CORE.fxOf(state.CFG || {}, state.Q) }
function hLive (h) { return CORE.holdingValue(h, q(h), hkd()) }

function divTaxOf (h) {
  return CORE.dividendSummary(Object.assign({}, state.CFG, { holdings:[h], cash:0, investable:0, cashYield:0 }), state.Q).value
}
function invMV () {
  return sumComplete(state.CFG.holdings.map(h => { const x = hLive(h); return x ? x.mvCNY : null }))
}
function totalCapital () {
  const C = state.CFG
  const mv = invMV(), cash = C.investable != null ? C.investable : C.cash
  return mv != null && Number.isFinite(cash) ? cash + mv : null
}
function curOf (u) { return u.code.endsWith('.HK') ? '港元' : '元' }
function tierAmt (C, pct) { // 郎刚10-25晚：累计建仓上限一律显示金额（按规划本金折算），不再显示百分比
  const TC = CORE.planningCapital(C)
  return pct != null && TC != null ? '≤' + fmt(pct / 100 * TC / 1e4, 1) + '万' : ''
}
function sumComplete (values) { return values.every(v => Number.isFinite(v)) ? values.reduce((s, v) => s + v, 0) : null }
function limitOf (h) { return CORE.positionLimit(state.CFG, h.code) }
function quoteText (u) {
  const qq = q(u)
  return qq ? (qq.snapshot ? '快照 · ' : '') + CORE.displayQuoteTime(qq.time || '') + '（北京时间）' : '报价缺失'
}
function researchLabel () { return '' } // 郎刚2026-10-25：研究门控提示不再上屏；价格一律用config维护的参考价与档位
function approvalOf (u) { return CORE.decisionBudget(state.CFG, state.Q, u.code) }
function activityOf (u) { return CORE.tradeActivity(state.CFG, u.code) }
function decisionText (bc) { return bc.approvedCNY > 0 ? '条件额度待服务端复核' : '执行阻断' }

/* ── 分档建仓信号（网页版 renderSignals 同源） ── */
function ladderTxt (u, px) {
  const ts = u.tiers || []; if (!ts.length) return ''
  const { deep, deepIndex: deepI, next } = CORE.ladderState(ts, px)
  if (!deep) {
    return next
      ? '未到档；最近档 ' + next.label + '（' + fmt(next.price, 1) + '）还差 ' + ((px / next.price - 1) * 100).toFixed(1) + '%'
      : ''
  }
  const nx = next
    ? '；下一档 ' + next.label + '（' + fmt(next.price, 1) + '）还差 ' + ((px / next.price - 1) * 100).toFixed(1) + '%'
    : '；已到最深档'
  return '历史参考已到 ' + deep.label + ' 档' + nx
}
function buildSignals () {
  const C = state.CFG, dis = C.dismissedSignals || [], rows = []
  C.universe.forEach(u => {
    const qq = q(u), bc = approvalOf(u), rs = CORE.researchState(u), activity = activityOf(u)
    const px = qq && qq.price, bp = u.buyPrice, limit = limitOf(u), PC = CORE.planningCapital(C)
    const w = PC > 0 && Number.isFinite(bc.issuerValueCNY) ? bc.issuerValueCNY / PC * 100 : null
    const over = w != null && Number.isFinite(limit.pct) && w > limit.pct
    const trig = px > 0 && bp > 0 && px <= bp, near = px > bp && bp > 0 && px <= bp * 1.05
    const missing = !(px > 0), unpriced = !(bp > 0)
    if (!over && !trig && !near && !missing && !unpriced && rs.complete && !bc.blockers.length) return
    const badge = missing ? '报价缺失' : over ? (limit.needsReview ? '参考限额待复核' : '超限待决策') : unpriced ? '未定价' : trig ? '已到价·' + decisionText(bc) : near ? '接近参考价' : '研究/预算待核'
    const kind = missing ? 'data:' : over ? 'over:' : trig ? 'trig:' : near ? 'near:' : 'review:'
    rows.push({ code: u.code, pri: over ? 0 : trig ? 1 : near ? 2 : 3, badge, bcls: over || missing ? 'b-over' : 'b-near', name: u.name,
      val: fmt(px, 2) + ' ' + curOf(u), gate: bp > 0 ? '历史参考 ' + fmt(bp, 2) : '未建立生效定价',
      dev: over ? '占规划本金 ' + fmt(w, 1) + '% · 参考限额 ' + fmt(limit.pct, 1) + '%' : decisionText(bc),
      note: [bc.blockers.length ? bc.blockers.join('；') : '条件参考额 ' + fmt(bc.approvedCNY / 1e4, 1) + ' 万，须服务端重新核验，不是下单许可', activity.label, quoteText(u)].filter(Boolean).join('；'),
      dk: kind + u.code, trig, near, blocked: bc.approvedCNY <= 0, missing, researchPending: !rs.complete })
  })
  rows.forEach(r => { r.off = dis.includes(r.dk) })
  rows.sort((a, b) => a.pri - b.pri || a.name.localeCompare(b.name, 'zh'))
  return rows
}

/* 满配仅作等额席位情景，缺值与真实零值分开；不表示已获准部署。 */
function divCNYof (code, amountCNY, withSpecial, gross) {
  return CORE.dividendForBudget(state.CFG, state.Q, code, amountCNY, withSpecial, gross)
}
function fullDivOf () {
  const base=CORE.dividendSummary(state.CFG,state.Q,{scope:'planned'}), special=CORE.dividendSummary(state.CFG,state.Q,{scope:'planned',withSpecial:true})
  return {net:base.knownDividend,complete:base.complete,spec:base.complete&&special.complete?special.value-base.value:null,
    totalBudget:base.rows.reduce((s,r)=>s+(r.amountCNY||0),0),coveredBudget:base.rows.reduce((s,r)=>s+(r.value!=null?r.amountCNY||0:0),0),missing:base.missing}
}

/* ── 网络层 ── */
const CLOUD = require('./cloud')
const QUOTES = require('./quotes')
const ERRORS = require('./errors')
function allSymbols (cfg) {
  const s = [], seen = {}
  ;(cfg.holdings || []).forEach(h => { if (h.qt && !seen[h.qt]) { seen[h.qt] = 1; s.push(h.qt) } })
  ;(cfg.universe || []).forEach(u => { if (u.qt && !seen[u.qt]) { seen[u.qt] = 1; s.push(u.qt) } })
  s.push('whHKDCNY')
  return s.join(',')
}
/* config 走自建服务器 /api/config（口令 Cookie 鉴权）；
 * 行情直连腾讯行情源。配置与行情两条链路均成功才提交，避免新旧数据混用。 */
let pendingLoad = null
function reload () {
  if (pendingLoad) return pendingLoad
  state.loading = true
  let nextCFG
  pendingLoad = Promise.resolve().then(() => {
    if (!CLOUD) throw { type: 'sdk' }
    return CLOUD.database.from('app_config').select('data').eq('key', 'config').limit(1)
  }).then(r => {
    if (!r) throw { type: 'data', body: '云数据库返回为空' }
    if (r.error) throw ERRORS.databaseError(r)
    const row = r.data && r.data[0]
    const cfg = row && (typeof row.data === 'string' ? JSON.parse(row.data) : row.data)
    if (!cfg || !Array.isArray(cfg.holdings) || !Array.isArray(cfg.universe)) throw { type: 'data', body: '配置缺少持仓或观察池' }
    nextCFG = cfg
    return QUOTES.fetchQuotes(allSymbols(cfg))
  }).then(quotes => {
    // 两条链路均成功才提交一组数据，避免新配置混用旧行情。
    state.CFG = nextCFG
    state.Q = quotes
    state.lastFetch = new Date().toISOString()
    state.source = 'live'
    state.error = null
  }).catch(e => {
    state.error = (e && e.type) ? e : { type: 'unknown', body: ERRORS.clean(e) }
    if (state.source === 'live') state.source = 'stale'
  }).then(() => {
    state.loading = false
    state._lastLoad = Date.now()
    pendingLoad = null
    emit()
  })
  return pendingLoad
}
function init () { reload() }
function maybeReload () {
  if (state.source !== 'live' || Date.now() - state._lastLoad > 180000) reload()
}

/* ── 状态文案 ── */
function statusModel () {
  const fx = state.Q.whHKDCNY && state.Q.whHKDCNY.price ? 'HKD/CNY ' + state.Q.whHKDCNY.price.toFixed(4) : ''
  let text = '加载中…'
  if (state.source === 'live' && state.lastFetch) text = '本次读取 · ' + hhmm(state.lastFetch)
  else if (state.source === 'stale') text = '上次成功数据 · ' + dateOf(state.lastFetch) + '（刷新失败）'
  else if (state.source === 'snapshot') text = '离线快照 · ' + dateOf(state.snapshotAt)
  let errText = null
  const e = state.error
  if (e) {
    const hint = '请在微信公众平台→开发管理→开发设置→服务器域名，将 ' + CONF.MP_ENDPOINT + ' 和 https://qt.gtimg.cn 加入 request 合法域名，再重新预览。电脑的“不校验域名”设置不会自动应用到手机。'
    const fallback = state.source === 'stale' ? '当前保留上次成功数据，尚未更新。' : (state.CFG ? '当前显示离线快照。' : '当前无可用数据。')
    const detail = ERRORS.clean(e.body || e.msg || '未知错误')
    if (e.type === 'domain' || /url not in domain list/i.test(detail)) errText = '微信阻止了未配置的请求域名（' + detail + '）。' + hint
    else if (e.type === 'db') errText = '平台配置读取失败（' + (e.status ? 'HTTP ' + e.status + ' · ' : '') + detail + '）。'
    else if (e.type === 'sdk') errText = '云客户端初始化失败。'
    else if (e.type === 'network') errText = '网络请求失败（' + detail + '）。请检查手机网络；若提示域名校验失败，请核对 request 合法域名。'
    else if (e.type === 'qhttp') errText = '行情源返回异常（HTTP ' + e.status + '）。'
    else errText = '实时数据暂不可达（类型:' + e.type + (e.status ? ' /HTTP' + e.status : '') + ' 详情:' + detail + '）。'
    errText += fallback
  }
  const quality = state.CFG ? CORE.dataQuality(state.CFG, state.Q) : null
  const qualityText = quality ? '行情覆盖 ' + quality.covered + '/' + quality.total + ' · 最早报价 ' + CORE.displayQuoteTime(quality.oldestTime) + '（北京时间）' + (quality.priorDate ? ' · 含此前交易日收盘/报价，休市时不代表接口失败' : '') + (quality.undated ? ' · ' + quality.undated + '只未提供完整时间' : '') + (quality.fxFallback ? ' · 汇率使用配置回退值' : '') + (quality.staleDps ? ' · ' + quality.staleDps + '只股息待复核' : '') : ''
  return { source: state.source, statusText: text, fxText: fx, errorMsg: errText, qualityText }
}

/* ══ 页面模型 ══ */

function indexModel () {
  const st = statusModel()
  if (!state.CFG) return Object.assign({ loading: true }, st)
  const C = state.CFG
  const TC = totalCapital(), inv = invMV()
  const investable = C.investable != null ? C.investable : C.cash || 0
  const costAll = sumComplete(C.holdings.map(h => { const x = hLive(h); return x ? x.costCNY : null }))
  // 郎刚10-25晚：浮盈必须始终展示。港股历史人民币成本未核时，按现汇率折算上市币种成本估算，并明示口径。
  const costEst = sumComplete(C.holdings.map(h => {
    const x = hLive(h)
    if (x && x.costCNY != null) return x.costCNY
    const hk = h.market === 'HK' || /\.HK$/.test(h.code || ''), rate = hk ? hkd() : 1
    return Number.isFinite(rate) && rate > 0 && Number.isFinite(h.shares) && h.cost != null && h.cost >= 0 ? h.shares * h.cost * rate : null
  }))
  const plVerified = inv != null && costAll != null
  const pl = plVerified ? inv - costAll : (inv != null && costEst != null ? inv - costEst : null)
  const plBase = plVerified ? costAll : costEst
  const curDiv = sumComplete(C.holdings.map(divTaxOf))
  const grossDiv = CORE.dividendSummary(C,state.Q,{gross:true}).value
  const ledger = CORE.ledgerSummary(C)
  const all = buildSignals()
  const act = all.filter(r => !r.off)
  const names = (...pris) => act.filter(r => pris.includes(r.pri)).map(r => r.name).join('、') || '—'
  return Object.assign({
    loading: false,
    tc: fmt(TC == null ? null : TC / 1e4, 1),
    inv: fmt(investable / 1e4, 1),
    mv: fmt(inv == null ? null : inv / 1e4, 1),
    pl: fmt(pl == null ? null : pl / 1e4, 2),
    plPct: plBase > 0 && inv != null ? ((inv / plBase - 1) * 100).toFixed(2) : '—',
    plCls: clsN(pl),
    plNote: !plVerified && pl != null ? '港股历史人民币成本未核，浮盈按现汇率折算上市币种成本估算' : '',
    ledgerLabel: ledger.label, ledgerGaps: (ledger.blockers || []).join('；'),
    curDiv: fmt(curDiv == null ? null : curDiv / 1e4, 2),
    grossDiv: fmt(grossDiv == null ? null : grossDiv / 1e4, 2),
    dividendCoverage: grossDiv == null ? '资料待补' : fmt(grossDiv / 1000000 * 100, 1) + '%（税前普通股息参考，未审计可持续性）',
    nOver: act.filter(r => r.pri === 0).length, overNames: names(0),
    nTrig: act.filter(r => r.trig).length, trigNames: act.filter(r => r.trig).map(r => r.name).join('、') || '—',
    nNear: act.filter(r => r.near).length, nearNames: act.filter(r => r.near).map(r => r.name).join('、') || '—',
    deployPct: TC > 0 && inv != null ? (inv / TC * 100).toFixed(1) : '—', uninvested: fmt(investable / 1e4, 0)
  }, st)
}

function positionsModel () {
  const st = statusModel()
  if (!state.CFG) return Object.assign({ loading: true }, st)
  const C = state.CFG
  const TC = CORE.planningCapital(C)
  const values = C.holdings.map(hLive)
  const mvAll = sumComplete(values.map(x => x ? x.mvCNY : null)), costAll = sumComplete(values.map(x => x ? x.costCNY : null)), divAll = sumComplete(C.holdings.map(divTaxOf))
  const rows = C.holdings.map(h => {
    const x = hLive(h)
    const qq = q(h)

    const dayPct = qq && qq.pct != null ? qq.pct : null
    return {
      code: h.code, name: h.name, grade: h.grade || '—', cur: curOf(h),
      px: x ? fmt(x.px, 2) : '—',
      pctTxt: dayPct != null ? sign(dayPct) : '—', pctCls: dayPct != null ? clsN(dayPct) : 'muted',
      snapFlag: (x && x.snap) ? ' 快照' : '',
      mv: x ? fmt(x.mvCNY / 1e4, 1) : '—',
      cost: x && x.costCNY != null ? fmt(x.costCNY / 1e4, 1) : '待核',
      pl: x && x.pl != null ? fmt(x.pl / 1e4, 2) : '—', plPct: x && x.plPct != null ? x.plPct.toFixed(2) + '%' : '—', plCls: x ? clsN(x.pl) : 'muted',
      weight: x && TC > 0 ? (x.mvCNY / TC * 100).toFixed(1) : '—',
      basisNote: x ? x.costBasisNote : '报价缺失', nativePl: x && h.market === 'HK' ? '上市币种浮动 ' + fmt(x.nativePl, 0) + ' 港元，不含汇兑' : '', quoteText: quoteText(h),
      div: fmt(divTaxOf(h) == null ? null : divTaxOf(h) / 1e4, 2),
      dpsYld: x && x.mvCNY > 0 && divTaxOf(h) != null ? (divTaxOf(h) / x.mvCNY * 100).toFixed(2) : '—'
    }
  })
  const pl = mvAll != null && costAll != null ? mvAll - costAll : null
  return Object.assign({
    loading: false,
    mvTotal: fmt(mvAll == null ? null : mvAll / 1e4, 1), costTotal: fmt(costAll == null ? null : costAll / 1e4, 1),
    pl: fmt(pl == null ? null : pl / 1e4, 2), plPct: costAll > 0 && mvAll != null ? ((mvAll / costAll - 1) * 100).toFixed(2) + '%' : '—', plCls: clsN(pl),
    div: fmt(divAll == null ? null : divAll / 1e4, 2),
    rows
  }, st)
}

function seatsModel (expanded) {
  const st = statusModel()
  if (!state.CFG) return Object.assign({ loading: true }, st)
  const C = state.CFG, S = C.seats
  expanded = expanded || {}
  const TC = CORE.planningCapital(C)
  const TCv = totalCapital()
  if (!S || !Array.isArray(S.list)) return Object.assign({ loading: false, noSeats: true }, st)
  let mvAll = 0, BAll = 0, pctSum = 0
  const seats = S.list.map((s, si) => {
    const seatHoldings = C.holdings.filter(h => (s.members || []).some(cd => CORE.issuerCodes(C, cd).includes(h.code)))
    const mv = sumComplete(seatHoldings.map(h => { const x = hLive(h); return x ? x.mvCNY : null }))
    const members = (s.members || []).map((code, mi) => {
      const held = C.holdings.filter(x => CORE.issuerCodes(C, code).includes(x.code))
      const h = held[0]
      const u = C.universe.find(x => x.code === code)
      let mvW = null
      if (held.length) { const value = sumComplete(held.map(h => { const x=hLive(h);return x?x.mvCNY:null }));mvW=fmt(value==null?null:value/1e4,1)+'万 · '+held.map(h=>h.code+' '+h.shares+'股').join('、') }
      const qq = u ? q(u) : null
      const px = qq && qq.price ? qq.price : (u && u.px != null ? u.px : null)
      const pills = ((u && u.tiers) || []).map((t, i) => {
        const pct = (u.tierPct || [])[i]
        const amt = tierAmt(C, pct) // 郎刚10-25晚：与观察页一致，建仓上限显示金额
        const hit = px != null && px <= t.price
        return {
          label: t.label,
          price: fmt(t.price, t.price % 1 ? 1 : 0),
          cur: t.cur === 'HKD' ? '港元' : '元',
          amt, hit, mark: hit ? '✓ ' : ''
        }
      })
      return {
        mi, code, name: u ? u.name : code, mvW: mvW || (u ? '未建仓' : '候选'),
        pills, plan: '历史策略记录（待复核）：' + ((u && u.plan) || '未录入'),
        expanded: !!expanded[code]
      }
    })
    mvAll = mvAll != null && mv != null ? mvAll + mv : null; BAll = TC != null ? BAll + s.pct / 100 * TC : null; pctSum += s.pct
    const B = TC != null ? s.pct / 100 * TC : null
    return {
      key: s.key, name: s.name, pct: s.pct, b: fmt(B == null ? null : B / 1e4, 0),
      mv: fmt(mv == null ? null : mv / 1e4, 1), prog: B > 0 && mv != null ? (mv / B * 100).toFixed(1) : '—',
      room: fmt(B != null && mv != null ? Math.max(B - mv, 0) / 1e4 : null, 0), members
    }
  })
  const fd = fullDivOf()
  const trans = (S.transitional || []).map(code => {
    const h = C.holdings.find(x => x.code === code)
    const u = C.universe.find(x => x.code === code)
    let mv = 0
    if (h) { const x = hLive(h); if (x) mv = x.mvCNY }
    return (u ? u.name : code) + ' ' + fmt(mv == null ? null : mv / 1e4, 1) + '万'
  }).join('、')
  return Object.assign({
    loading: false,
    bAll: fmt(BAll == null ? null : BAll / 1e4, 0), mvAll: fmt(mvAll == null ? null : mvAll / 1e4, 1),
    prog: BAll > 0 && mvAll != null ? (mvAll / BAll * 100).toFixed(1) : '—',
    pctSum: pctSum + '',
    fullDiv: fmt(fd.complete ? fd.net / 1e4 : null, 1), spec: fmt(fd.spec == null ? null : fd.spec / 1e4, 1), dividendCoverage: '已覆盖预算 ' + fmt(fd.coveredBudget / 1e4, 1) + '/' + fmt(fd.totalBudget / 1e4, 1) + ' 万；缺项：' + (fd.missing.join('、') || '无'),
    seats, transText: trans || '无'
  }, st)
}

const WATCH_FILTERS = [
  { key: 'all', label: '全部', hint: '查看全部观察标的。', match: () => true },
  { key: 'trig', label: '已到参考价', hint: '现价已到触发价；价格触发不等于下单。', match: x => x.trig },
  { key: 'near', label: '接近', hint: '现价高于触发价、不超过触发价的5%；按距离由近到远排列。', match: x => x.near },
  { key: 'wait', label: '等待', hint: '现价高于触发价5%以上，继续等待。', match: x => x.waiting },
  { key: 'held', label: '持仓', hint: '查看当前已经持有的公司。', match: x => x.held },
  { key: 'unheld', label: '未持仓', hint: '查看观察池中尚未持有的公司。', match: x => !x.held },
  { key: 'a', label: 'A类', hint: '查看平台当前归为A类的公司。', match: x => x.grade === 'A' },
  { key: 'b', label: 'B类', hint: '查看平台当前归为B类的公司。', match: x => x.grade === 'B' },
  { key: 'exit', label: '退出观察', hint: '查看平台已列入退出观察名单的公司。', match: x => x.exitWatch }
]

function watchModel (expanded, filter) {
  const st = statusModel()
  if (!state.CFG) return Object.assign({ loading: true }, st)
  const C = state.CFG
  expanded = expanded || {}
  const selected = WATCH_FILTERS.find(x => x.key === filter) || WATCH_FILTERS[0]
  filter = selected.key
  const TCv = totalCapital()
  const S = C.seats, b = (S && S.researchBatches) || {}
  const all = C.universe.map(u => {
    const held = C.holdings.some(h => h.code === u.code)
    const qq = q(u)
    const px = qq ? qq.price : null
    const dayPct = qq && qq.pct != null ? qq.pct : null
    const tiers = (u.tiers || []).map((t, i) => {
      const pct = (u.tierPct || [])[i]
      const amt = tierAmt(C, pct) // 郎刚10-25晚：四档价标注累计建仓上限金额，方便对照
      const unit = t.cur === 'HKD' ? '港元' : t.cur === 'CNY' ? '元' : ''
      let cls = 'wait', mark = ''
      if (px != null) {
        if (px <= t.price) { cls = 'trig'; mark = ' ✓' } else if (px <= t.price * 1.05) { cls = 'near'; mark = ' ≈' }
      }
      return { label: t.label, price: fmt(t.price, t.price % 1 ? 1 : 0), unit, amt, cls, mark }
    })
    let status = '待定价', bcls = '', dist = '—', trig = false
    if (u.buyPrice != null && px != null) {
      const d = (px / u.buyPrice - 1) * 100
      dist = d > 0 ? '+' + d.toFixed(1) + '%' : d.toFixed(1) + '%'
      if (px <= u.buyPrice) { status = '已到价·待审核'; bcls = 'b-trig'; trig = true }
      else if (px <= u.buyPrice * 1.05) { status = '接近'; bcls = 'b-near' }
      else { status = '等待'; bcls = 'b-near' }
    }
    if (!(px > 0)) status = '报价缺失'
    const rs = CORE.researchState(u), bc = approvalOf(u)
    const batch = (b.batch1 || []).includes(u.code) ? '研1' : (b.batch2 || []).includes(u.code) ? '研2' : (b.watchExit || []).includes(u.code) ? '退出观察' : ''
    return {
      code: u.code, name: u.name, grade: u.grade || '—', batch, held, trig,
      summary: CORE.researchSummary(u, state.CFG),
      near: status === '接近', waiting: status === '等待',
      distancePct: u.buyPrice > 0 && px != null ? (px / u.buyPrice - 1) * 100 : null,
      researchPending: !rs.complete,
      exitWatch: (b.watchExit || []).includes(u.code),
      research: researchLabel(rs), decisionNote: '条件额度须服务端复核，各公司额度不可相加', quoteText: quoteText(u),
      px: px != null ? fmt(px, 2) : '—', cur: curOf(u),
      pctTxt: dayPct != null ? sign(dayPct) : '—', pctCls: dayPct != null ? clsN(dayPct) : 'muted',
      status, bcls, dist, tiers,
      plan: '历史策略记录（待复核）：' + (u.plan || '未录入'),
      expanded: !!expanded[u.code]
    }
  })
  const n = {}
  const filters = WATCH_FILTERS.map(f => {
    n[f.key] = all.filter(f.match).length
    return { key: f.key, label: f.label, count: n[f.key] }
  })
  const rows = all.filter(selected.match)
  if (filter === 'near') rows.sort((a, b) => a.distancePct - b.distancePct || a.code.localeCompare(b.code))
  return Object.assign({ loading: false, rows, n, filter, filters, filterHint: selected.hint, filterLabel: selected.label }, st)
}

module.exports = {
  state, init, reload, maybeReload, onUpdate, emit,
  fmt, sign, clsN, q, hkd, hLive, divTaxOf, invMV, totalCapital,
  curOf, buildSignals, ladderTxt,
  indexModel, positionsModel, seatsModel, watchModel
}
