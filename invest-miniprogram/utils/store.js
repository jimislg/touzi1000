/* 数据层：快照秒开 → 实时覆盖。计算口径与网页版 public/index.html 完全同源。
 * 数据源 = langang-invest.app.workbuddy.host（云端唯一数据源），小程序为纯只读客户端。 */
const CONF = require('./config')

let SNAP = null
try { SNAP = require('./snapshot') } catch (e) { SNAP = null }

const state = {
  CFG: (SNAP && SNAP.cfg) || null,
  Q: (SNAP && SNAP.quotes) || {},
  source: SNAP ? 'snapshot' : 'loading', /* live | snapshot | loading */
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
  if (n == null || isNaN(n)) return '—'
  const neg = n < 0
  const parts = Math.abs(n).toFixed(d).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + parts[0] + (parts[1] ? '.' + parts[1] : '')
}
function sign (n) { return (n >= 0 ? '+' : '') + (n == null || isNaN(n) ? '—' : fmt(n, 2)) + '%' }
function clsN (n) { return n >= 0 ? 'up' : 'down' }
function hhmm (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = x => (x < 10 ? '0' : '') + x
  return d.getHours() + ':' + p(d.getMinutes())
}
function dateOf (iso) { return iso ? iso.slice(0, 10) + ' ' + hhmm(iso) : '' }

/* ── 行情与持仓（网页版同源口径） ── */
function q (u) {
  const x = state.Q[u.qt]
  return (x && x.price) ? x : (u.px ? { price: u.px, snapshot: true } : null)
}
function hkd () {
  const x = state.Q.whHKDCNY
  return (x && x.price) ? x.price : ((state.CFG && state.CFG.hkdcnyFallback) || 0.8548)
}
function hLive (h) {
  const qq = q(h); if (!qq) return null
  const px = qq.price
  const mvCNY = h.market === 'HK' ? h.shares * px * hkd() : h.shares * px
  const costCNY = h.market === 'HK' ? h.shares * h.cost * hkd() : h.shares * h.cost
  return {
    px, mvCNY, costCNY,
    pl: mvCNY - costCNY,
    plPct: (mvCNY / costCNY - 1) * 100,
    snap: !!qq.snapshot,
    dpsCNY: h.market === 'HK' ? h.dps * hkd() : h.dps
  }
}
function divTaxOf (h) {
  const x = hLive(h); if (!x) return 0
  return h.shares * x.dpsCNY * (h.market === 'HK' ? 0.8 : 0.9)
}
function invMV () {
  return state.CFG.holdings.reduce((s, h) => { const x = hLive(h); return s + (x ? x.mvCNY : 0) }, 0)
}
function totalCapital () {
  const C = state.CFG
  return (C.investable != null ? C.investable : C.cash || 0) + invMV()
}
function curOf (u) { return u.code.endsWith('.HK') ? '港元' : '元' }
function limitOf (h) {
  if (h.grade === 'A') {
    if (h.label === '目标达成型') return 20
    if (h.label === '接近目标型') return 15
    if (h.label === '组合辅助型') return 10
    return 20
  }
  return h.grade === 'B' ? 8 : 0
}

/* ── 分档建仓信号（网页版 renderSignals 同源） ── */
function ladderTxt (u, px) {
  const ts = u.tiers || []; if (!ts.length) return ''
  let deep = null, deepI = -1, next = null
  ts.forEach((t, i) => { if (px <= t.price) { deep = t; deepI = i } else if (deep && !next) next = t })
  if (!deep) {
    return next
      ? '未到档；最近档 ' + next.label + '（' + fmt(next.price, 1) + '）还差 ' + ((px / next.price - 1) * 100).toFixed(1) + '%'
      : ''
  }
  const pct = (u.tierPct || [])[deepI]
  const amt = pct != null ? '（累计' + pct + '%≈' + fmt(pct / 100 * totalCapital() / 1e4, 0) + '万）' : ''
  const nx = next
    ? '；下一档 ' + next.label + '（' + fmt(next.price, 1) + '）还差 ' + ((px / next.price - 1) * 100).toFixed(1) + '%'
    : '；已到最深档'
  return '已到 ' + deep.label + ' 档' + amt + nx
}
function buildSignals () {
  const C = state.CFG, dis = C.dismissedSignals || [], rows = []
  C.holdings.forEach(h => {
    const x = hLive(h); if (!x) return
    const w = x.mvCNY / totalCapital() * 100, lim = limitOf(h)
    if (w > lim) {
      rows.push({ pri: 0, badge: '仓位超限', bcls: 'b-over', name: h.name, val: '权重 ' + w.toFixed(1) + '%', gate: '上限 ' + lim + '%', dev: '超 ' + (w - lim).toFixed(1) + 'pct', note: '≈超 ' + fmt((w - lim) / 100 * totalCapital() / 1e4, 0) + ' 万。减持节奏按第四步决策，不因价格恐慌抛售', dk: 'over:' + h.code })
    } else if (w > lim * 0.8) {
      rows.push({ pri: 1.5, badge: '仓位接近', bcls: 'b-near', name: h.name, val: '权重 ' + w.toFixed(1) + '%', gate: '上限 ' + lim + '%', dev: '余 ' + fmt((lim - w) / 100 * totalCapital() / 1e4, 0) + ' 万空间', note: '继续加仓空间有限，新资金优先给未达限的标的', dk: 'posnear:' + h.code })
    }
  })
  C.universe.forEach(u => {
    const qq = q(u); if (!qq) return
    const px = qq.price
    if (u.buyPrice == null) return
    const lad = ladderTxt(u, px)
    if (px <= u.buyPrice) {
      rows.push({ pri: 1, badge: '已触发', bcls: 'b-trig', name: u.name, val: fmt(px, 2) + ' ' + curOf(u), gate: '≤ ' + fmt(u.buyPrice, 2), dev: '现价已入档', note: (lad ? lad + '；' : '') + '触发≠下单，按分档策略执行', dk: 'trig:' + u.code })
    } else if (px <= u.buyPrice * 1.05) {
      rows.push({ pri: 2, badge: '接近', bcls: 'b-near', name: u.name, val: fmt(px, 2) + ' ' + curOf(u), gate: fmt(u.buyPrice, 2), dev: '+' + ((px / u.buyPrice - 1) * 100).toFixed(1) + '%', note: (lad ? lad + '；' : '') + '跌至触发价即可行动', dk: 'near:' + u.code })
    }
  })
  rows.forEach(r => { r.off = dis.includes(r.dk) })
  rows.sort((a, b) => a.pri - b.pri || a.name.localeCompare(b.name, 'zh'))
  return rows
}

/* ── 满配年股息（网页版 divCNYof 同源：席位预算等分、A股90%/港股通80%税后） ── */
function divCNYof (code, amountCNY, withSpecial, gross) {
  const C = state.CFG
  const h = C.holdings.find(x => x.code === code), u = C.universe.find(x => x.code === code)
  const dps = h && h.dps != null ? h.dps : (u && u.dps != null ? u.dps : null)
  const dsp = (withSpecial && u && u.dpsSpecial != null) ? u.dpsSpecial : 0
  const x = h ? hLive(h) : null
  const px = (x && x.px) ? x.px : (u && u.px != null ? u.px : null)
  const mkt = h && h.market ? h.market : (u && u.code.endsWith('.HK') ? 'HK' : 'A')
  if (!((dps + dsp) > 0) || !(px > 0)) return null
  const pxCNY = mkt === 'HK' ? px * hkd() : px
  if (!(pxCNY > 0)) return null
  const tax = gross ? 1 : (mkt === 'HK' ? 0.8 : 0.9)
  return amountCNY / pxCNY * (dps + dsp) * tax * (mkt === 'HK' ? hkd() : 1)
}
function fullDivOf () {
  const C = state.CFG, S = C.seats, TC = C.targetCapital || 10000000
  let net = 0, spec = 0
  ;(S.list || []).forEach(st => {
    const mem = st.members || []; if (!mem.length) return
    const per = st.pct / 100 * TC / mem.length
    mem.forEach(code => {
      net += divCNYof(code, per, false, false) || 0
      const wS = divCNYof(code, per, true), base = divCNYof(code, per, false)
      spec += (wS != null && base != null) ? wS - base : 0
    })
  })
  return { net, spec }
}

/* ── 网络层 ── */
function allSymbols () {
  const s = [], seen = {}
  ;(state.CFG.holdings || []).forEach(h => { if (h.qt && !seen[h.qt]) { seen[h.qt] = 1; s.push(h.qt) } })
  ;(state.CFG.universe || []).forEach(u => { if (u.qt && !seen[u.qt]) { seen[u.qt] = 1; s.push(u.qt) } })
  s.push('whHKDCNY')
  return s.join(',')
}
function req (path) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: CONF.BASE + path,
      header: { Cookie: 'ak=' + CONF.KEY },
      success (r) {
        if (r.statusCode === 401) return reject({ type: 'auth', status: 401 })
        if (r.statusCode === 200) return resolve(r.data)
        reject({ type: 'http', status: r.statusCode, body: typeof r.data === 'string' ? r.data.slice(0, 60) : '' })
      },
      fail (e) { reject({ type: 'network', msg: (e && e.errMsg) || '' }) }
    })
  })
}
function reload () {
  state.loading = true
  return req('/api/config').then(cfg => {
    if (!cfg || !Array.isArray(cfg.holdings)) throw { type: 'data', body: cfg ? JSON.stringify(cfg).slice(0, 60) : '空' }
    state.CFG = cfg
    return req('/api/quotes?symbols=' + encodeURIComponent(allSymbols()))
  }).then(qj => {
    if (qj && qj.ok && qj.quotes) {
      state.Q = qj.quotes
      state.lastFetch = qj.fetchedAt
      state.source = 'live'
      state.error = null
    } else {
      state.error = { type: 'quotes', body: qj ? JSON.stringify(qj).slice(0, 60) : '空' }
    }
  }).catch(e => {
    state.error = (e && e.type) ? e : { type: 'unknown', body: String(e).slice(0, 60) }
  }).then(() => {
    state.loading = false
    state._lastLoad = Date.now()
    emit()
  })
}
function init () { reload() }
function maybeReload () {
  if (state.source !== 'live' || Date.now() - state._lastLoad > 180000) reload()
}

/* ── 状态文案 ── */
function statusModel () {
  const fx = state.Q.whHKDCNY && state.Q.whHKDCNY.price ? 'HKD/CNY ' + state.Q.whHKDCNY.price.toFixed(4) : ''
  let text = '加载中…'
  if (state.source === 'live' && state.lastFetch) text = '实时 · ' + hhmm(state.lastFetch)
  else if (state.source === 'snapshot') text = '离线快照 · ' + dateOf(state.snapshotAt)
  let errText = null
  const e = state.error
  if (e) {
    if (e.type === 'auth') errText = '口令校验失败（401）：平台 accessKey 已变更，小程序口令需重新生成。'
    else if (e.type === 'network') errText = '实时数据请求失败（' + (e.msg || '网络错误') + '）。若为域名校验拦截：请到微信公众平台→开发管理→开发设置→服务器域名，把 ' + CONF.BASE.replace('https://', '') + ' 加入 request 合法域名；或在手机上打开小程序右上角「…」→开发调试后重试。以下为离线快照数据。'
    else errText = '实时数据暂不可达（类型:' + e.type + (e.status ? ' /HTTP' + e.status : '') + (e.body ? ' 详情:' + e.body : '') + '），以下为离线快照（' + dateOf(state.snapshotAt) + '）。'
  }
  return { source: state.source, statusText: text, fxText: fx, errorMsg: errText }
}

/* ══ 页面模型 ══ */

function indexModel () {
  const st = statusModel()
  if (!state.CFG) return Object.assign({ loading: true }, st)
  const C = state.CFG
  const TC = totalCapital(), inv = invMV()
  const investable = C.investable != null ? C.investable : C.cash || 0
  const costAll = C.holdings.reduce((s, h) => { const x = hLive(h); return s + (x ? x.costCNY : 0) }, 0)
  const pl = inv - costAll
  const curDiv = C.holdings.reduce((s, h) => s + divTaxOf(h), 0)
  const all = buildSignals()
  const act = all.filter(r => !r.off)
  const names = p => act.filter(r => r.pri === p).map(r => r.name).join('、') || '—'
  return Object.assign({
    loading: false,
    tc: fmt(TC / 1e4, 1),
    inv: fmt(investable / 1e4, 1),
    mv: fmt(inv / 1e4, 1),
    pl: fmt(pl / 1e4, 2), plPct: (inv / costAll - 1).toFixed(2) + '', plCls: clsN(pl),
    curDiv: fmt(curDiv / 1e4, 2),
    nOver: act.filter(r => r.pri === 0).length, overNames: names(0),
    nTrig: act.filter(r => r.pri === 1).length, trigNames: names(1),
    nNear: act.filter(r => r.pri === 1.5 || r.pri === 2).length, nearNames: names(1.5, 2),
    deployPct: (inv / TC * 100).toFixed(1), uninvested: fmt((TC - inv) / 1e4, 0),
    /* 已划掉的信号也显示（淡出+标记），信息量大于直接隐藏 */
    sigs: all.map(r => ({ name: r.name, badge: r.badge, bcls: r.bcls, val: r.val, gate: r.gate, dev: r.dev, note: r.note, off: !!r.off }))
  }, st)
}

function positionsModel () {
  const st = statusModel()
  if (!state.CFG) return Object.assign({ loading: true }, st)
  const C = state.CFG
  const TC = totalCapital()
  let mvAll = 0, costAll = 0, divAll = 0
  const rows = C.holdings.map(h => {
    const x = hLive(h)
    const qq = q(h)
    if (x) { mvAll += x.mvCNY; costAll += x.costCNY; divAll += divTaxOf(h) }
    const dayPct = qq && qq.pct != null ? qq.pct : null
    return {
      code: h.code, name: h.name, grade: h.grade || '—', cur: curOf(h),
      px: x ? fmt(x.px, 2) : '—',
      pctTxt: dayPct != null ? sign(dayPct) : '—', pctCls: dayPct != null ? clsN(dayPct) : 'muted',
      snapFlag: (x && x.snap) ? ' 快照' : '',
      mv: x ? fmt(x.mvCNY / 1e4, 1) : '—',
      cost: x ? fmt(x.costCNY / 1e4, 1) : '—',
      pl: x ? fmt(x.pl / 1e4, 2) : '—', plPct: x ? x.plPct.toFixed(2) + '%' : '—', plCls: x ? clsN(x.pl) : 'muted',
      weight: x ? (x.mvCNY / TC * 100).toFixed(1) : '—',
      div: fmt(divTaxOf(h) / 1e4, 2),
      dpsYld: x && x.mvCNY > 0 ? (divTaxOf(h) / x.mvCNY * 100).toFixed(2) : '—'
    }
  })
  const pl = mvAll - costAll
  return Object.assign({
    loading: false,
    mvTotal: fmt(mvAll / 1e4, 1), costTotal: fmt(costAll / 1e4, 1),
    pl: fmt(pl / 1e4, 2), plPct: costAll > 0 ? ((mvAll / costAll - 1) * 100).toFixed(2) + '%' : '—', plCls: clsN(pl),
    div: fmt(divAll / 1e4, 2),
    rows
  }, st)
}

function seatsModel (expanded) {
  const st = statusModel()
  if (!state.CFG) return Object.assign({ loading: true }, st)
  const C = state.CFG, S = C.seats
  expanded = expanded || {}
  const TC = C.targetCapital || 10000000
  const TCv = totalCapital()
  if (!S || !Array.isArray(S.list)) return Object.assign({ loading: false, noSeats: true }, st)
  let mvAll = 0, BAll = 0, pctSum = 0
  const seats = S.list.map((s, si) => {
    let mv = 0
    const members = (s.members || []).map((code, mi) => {
      const h = C.holdings.find(x => x.code === code)
      const u = C.universe.find(x => x.code === code)
      let mvW = null
      if (h) { const x = hLive(h); if (x) { mv += x.mvCNY; mvW = fmt(x.mvCNY / 1e4, 1) + '万' } }
      const qq = u ? q(u) : null
      const px = qq && qq.price ? qq.price : (u && u.px != null ? u.px : null)
      const pills = ((u && u.tiers) || []).map((t, i) => {
        const pct = (u.tierPct || [])[i]
        const amt = pct != null ? fmt(pct / 100 * TCv / 1e4, 0) + '万' : ''
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
        pills, plan: (u && u.plan) || '待定档',
        expanded: !!expanded[code]
      }
    })
    mvAll += mv; BAll += s.pct / 100 * TC; pctSum += s.pct
    const B = s.pct / 100 * TC
    return {
      key: s.key, name: s.name, pct: s.pct, b: fmt(B / 1e4, 0),
      mv: fmt(mv / 1e4, 1), prog: (B > 0 ? mv / B * 100 : 0).toFixed(1),
      room: fmt(Math.max(B - mv, 0) / 1e4, 0), members
    }
  })
  const fd = fullDivOf()
  const trans = (S.transitional || []).map(code => {
    const h = C.holdings.find(x => x.code === code)
    const u = C.universe.find(x => x.code === code)
    let mv = 0
    if (h) { const x = hLive(h); if (x) mv = x.mvCNY }
    return (u ? u.name : code) + ' ' + fmt(mv / 1e4, 1) + '万'
  }).join('、')
  return Object.assign({
    loading: false,
    bAll: fmt(BAll / 1e4, 0), mvAll: fmt(mvAll / 1e4, 1),
    prog: (BAll > 0 ? mvAll / BAll * 100 : 0).toFixed(1),
    pctSum: pctSum + '',
    fullDiv: fmt(fd.net / 1e4, 1), spec: fmt(fd.spec / 1e4, 1),
    seats, transText: trans || '无'
  }, st)
}

function watchModel (expanded, filter) {
  const st = statusModel()
  if (!state.CFG) return Object.assign({ loading: true }, st)
  const C = state.CFG
  expanded = expanded || {}
  filter = filter || 'all'
  const TCv = totalCapital()
  const S = C.seats, b = (S && S.researchBatches) || {}
  const all = C.universe.map(u => {
    const held = C.holdings.some(h => h.code === u.code)
    const qq = q(u)
    const px = qq ? qq.price : null
    const dayPct = qq && qq.pct != null ? qq.pct : null
    const tiers = (u.tiers || []).map((t, i) => {
      const pct = (u.tierPct || [])[i]
      const amt = (pct != null && pct > 0) ? Math.round(pct / 100 * TCv / 1e4) + '万' : ''
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
      if (px <= u.buyPrice) { status = '可购入'; bcls = 'b-trig'; trig = true }
      else if (px <= u.buyPrice * 1.05) { status = '接近'; bcls = 'b-near' }
      else { status = '等待'; bcls = 'b-near' }
    }
    const batch = (b.batch1 || []).includes(u.code) ? '研1' : (b.batch2 || []).includes(u.code) ? '研2' : (b.watchExit || []).includes(u.code) ? '退出观察' : ''
    return {
      code: u.code, name: u.name, grade: u.grade || '—', batch, held, trig,
      research: (u.researchStatus && u.researchStatus !== 'done') ? '研·' + (u.researchStatus === 'partial' ? '部分' : '未做') : '',
      px: px != null ? fmt(px, 2) : '—', cur: curOf(u),
      pctTxt: dayPct != null ? sign(dayPct) : '—', pctCls: dayPct != null ? clsN(dayPct) : 'muted',
      status, bcls, dist, tiers,
      plan: u.plan || (u.grade === 'A' ? 'A类：首仓3-5%／正常10-15%／硬20%' : 'B类：首仓1-2%／正常3-5%／硬8%'),
      expanded: !!expanded[u.code]
    }
  })
  const n = {
    all: all.length,
    trig: all.filter(x => x.trig).length,
    held: all.filter(x => x.held).length,
    a: all.filter(x => x.grade === 'A').length
  }
  let rows = all
  if (filter === 'trig') rows = all.filter(x => x.trig)
  else if (filter === 'held') rows = all.filter(x => x.held)
  else if (filter === 'a') rows = all.filter(x => x.grade === 'A')
  return Object.assign({ loading: false, rows, n, filter }, st)
}

module.exports = {
  state, init, reload, maybeReload, onUpdate, emit,
  fmt, sign, clsN, q, hkd, hLive, divTaxOf, invMV, totalCapital,
  curOf, buildSignals, ladderTxt,
  indexModel, positionsModel, seatsModel, watchModel
}
