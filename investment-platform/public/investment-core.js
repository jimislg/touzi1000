/* 两端共用的纯函数。此文件为唯一源码；小程序副本由 scripts/sync-core.js 生成。 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.InvestmentCore = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function number (value) {
    return value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null
  }

  function parseQuotes (text) {
    const out = {}, re = /v_([A-Za-z0-9_]+)="([^"]*)"/g
    let m
    while ((m = re.exec(text))) {
      const f = m[2].split('~')
      let price = number(f[3])
      // 仅汇率允许特殊字段回退；股票现价缺失时不能把昨收/买卖盘/成交量当现价。
      if (!(price > 0) && m[1] === 'whHKDCNY') {
        for (let i = 3; i < 12; i++) {
          const v = number(f[i])
          if (v > 0 && v < 10) { price = v; break }
        }
      }
      out[m[1]] = {
        name: f[1] || '', price: price > 0 ? price : null,
        prevClose: number(f[4]) > 0 ? number(f[4]) : null,
        pct: number(f[32]), time: (f[30] || '').replace(/\D/g, '').slice(0, 14)
      }
    }
    return out
  }

  function missingSymbols (quotes, symbols) {
    const list = Array.isArray(symbols) ? symbols : String(symbols || '').split(',')
    return list.filter(s => s && !(quotes && quotes[s] && Number.isFinite(quotes[s].price) && quotes[s].price > 0))
  }

  function ladderState (tiers, px) {
    let deepIndex = -1
    ;(tiers || []).forEach((t, i) => { if (px <= t.price) deepIndex = i })
    return { deepIndex, deep: tiers && tiers[deepIndex] || null, next: tiers && tiers[deepIndex + 1] || null }
  }

  function positionRoom (weightPct, limitPct, capital) {
    return [weightPct, limitPct, capital].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) ? Math.max(0, limitPct - weightPct) / 100 * capital : null
  }

  const finite = v => typeof v === 'number' && Number.isFinite(v)
  const nonnegative = v => finite(v) && v >= 0
  const cents = v => Number.isSafeInteger(v) && v >= 0
  const text = v => typeof v === 'string' && v.trim() !== ''
  const items = (cfg, key) => Array.isArray(cfg && cfg[key]) ? cfg[key] : []
  const stamp = v => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(v)) return NaN
    const date = v.slice(0,10), day = Date.parse(date + 'T00:00:00+08:00')
    if (!Number.isFinite(day) || new Date(day + 8*3600000).toISOString().slice(0,10) !== date) return NaN
    return Date.parse(v.length === 10 ? v + 'T00:00:00+08:00' : v)
  }
  const clock = now => now == null ? Date.now() : typeof now === 'number' && Number.isFinite(now) ? now : NaN
  const fen = v => nonnegative(v) && Number.isSafeInteger(Math.round(v * 100)) ? Math.round(v * 100) : null
  function planningCapital (cfg) { return cfg && finite(cfg.targetCapital) && cfg.targetCapital > 0 ? cfg.targetCapital : null }
  function issuerCodes (cfg, code) {
    const all = items(cfg, 'universe').concat(items(cfg, 'holdings'))
    const item = all.find(x => x && x.code === code)
    const pairs = [['601318.SH', '2318.HK'], ['600941.SH', '0941.HK'], ['603288.SH', '3288.HK']]
    const group = item && text(item.issuerId) ? all.filter(x => x && x.issuerId === item.issuerId).map(x => x.code) : (pairs.find(g => g.includes(code)) || [])
    return [...new Set([code].concat(group).filter(text))]
  }
  function seatOf (cfg, code) {
    const codes = issuerCodes(cfg, code)
    return cfg && cfg.seats && Array.isArray(cfg.seats.list) ? cfg.seats.list.find(s => s && Array.isArray(s.members) && s.members.some(c => codes.includes(c))) : null
  }
  function positionLimit (cfg, code) {
    const u = items(cfg, 'universe').find(x => x.code === code) || items(cfg, 'holdings').find(x => x.code === code) || {}
    const st = seatOf(cfg, code), seatPct = st && finite(st.pct) && st.pct > 0 && st.pct <= 100 ? st.pct : null
    if (finite(u.riskMaxPct) && u.riskMaxPct > 0 && u.riskMaxPct <= 100) {
      return { pct: seatPct == null ? u.riskMaxPct : Math.min(u.riskMaxPct, seatPct), source: '显式个股风险上限' + (seatPct != null && u.riskMaxPct > seatPct ? '（受共享席位预算约束）' : ''), needsReview: seatPct == null || u.riskMaxPct > seatPct }
    }
    const ps = u.tierPct, last = Array.isArray(ps) ? ps[ps.length - 1] : null
    if (Array.isArray(ps) && ps.length >= 3 && Array.isArray(u.tiers) && ps.length === u.tiers.length && ps.every((p, i) => finite(p) && p > 0 && p < 100 && (i === 0 || p >= ps[i - 1])) && seatPct != null && last <= seatPct) {
      return { pct: last, source: '历史定制档位累计本金上限（非审批）', needsReview: false }
    }
    const legacy = u.grade === 'A' ? 20 : u.grade === 'B' ? 8 : null
    return { pct: legacy == null ? null : seatPct == null ? legacy : Math.min(legacy, seatPct), source: '旧等级参考，待独立风险限额确认', needsReview: true }
  }

  function taxRateOf (h, now) {
    h = h || {}; const at = clock(now)
    if (finite(h.dividendTaxRate) && h.dividendTaxRate >= 0 && h.dividendTaxRate <= 1 && text(h.dividendTaxSource)) return { r: h.dividendTaxRate, tag: '显式税率假设', basis: h.dividendTaxSource, verified: h.dividendTaxVerified === true, needsReview: h.dividendTaxVerified !== true }
    if (h.market === 'HK' || /\.HK$/.test(h.code || '')) return { r: 0.2, tag: '港股通20%估算', basis: '历史账户假设，需核对实际持有渠道', verified: false, needsReview: true }
    const date = h.buyDate, start = stamp(date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !finite(start) || !finite(at) || start > at || new Date(start + 8 * 3600000).toISOString().slice(0, 10) !== date) return { r: null, tag: '持有期/渠道待核', basis: '缺少有效批次买入日期', verified: false, needsReview: true }
    const parts = date.split('-').map(Number)
    const anniversary = (months) => {
      const d = new Date(Date.UTC(parts[0], parts[1] - 1 + months, 1)), last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(parts[2], last)) - 8 * 3600000
    }
    const r = at > anniversary(12) ? 0 : at > anniversary(1) ? 0.1 : 0.2
    return { r, tag: 'A股持有期估算·' + (r * 100) + '%', basis: '最早买入日' + date + '；非逐批次税务核算', verified: false, needsReview: true }
  }

  function modelFlows (eps, g, pay, tax, exitPE, n) {
    if (!(finite(eps) && eps > 0 && finite(g) && g > -1 && finite(pay) && pay >= 0 && pay <= 1 && finite(tax) && tax >= 0 && tax <= 1 && finite(exitPE) && exitPE >= 0 && Number.isInteger(n) && n >= 1 && n <= 100)) return null
    const flow = []; let e = eps
    for (let t = 1; t <= n; t++) { e *= 1 + g; flow.push(e * pay * (1 - tax)) }
    flow[n - 1] += e * exitPE
    return flow.every(nonnegative) ? flow : null
  }
  function priceAt (eps, g, pay, tax, exitPE, discount, n) {
    const flow = modelFlows(eps, g, pay, tax, exitPE, n)
    if (!flow || !finite(discount) || discount <= -1) return null
    const result = flow.reduce((s, v, i) => s + v / Math.pow(1 + discount, i + 1), 0)
    return finite(result) ? result : null
  }
  function irrOf (eps, g, pay, tax, exitPE, price, n) {
    const flow = modelFlows(eps, g, pay, tax, exitPE, n)
    if (!flow || !(finite(price) && price > 0) || !flow.some(v => v > 0)) return null
    const npv = r => flow.reduce((s, v, i) => s + v / Math.pow(1 + r, i + 1), 0) - price
    let lo = -0.999999, hi = 1
    if (npv(lo) < 0) return null
    while (npv(hi) > 0 && hi < 1000000) hi = hi * 2 + 1
    if (npv(hi) > 0) return null
    for (let i = 0; i < 180; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid }
    const result = (lo + hi) / 2
    return finite(result) ? result : null
  }

  function researchState (u) {
    u = u || {}; const r = u.research || {}, a = u.audit || {}
    const status = r.status || u.researchStatus || 'unknown', version = r.version || u.researchVersion || null, source = r.source || u.researchSource || null
    const complete = status === 'done' && text(version) && text(source) && finite(stamp(r.asOf || u.researchAsOf))
    const auditPassed = a.status === 'passed' && text(a.version) && text(a.source) && finite(stamp(a.asOf)) && complete && a.researchVersion === version
    const blockers = []
    if (!['A', 'B'].includes(u.grade)) blockers.push('质量等级未达到A/B门槛')
    if (!complete) blockers.push(status === 'done' ? '研究完成标记缺少版本、来源或日期' : '研究状态待补/未完成')
    if (!auditPassed) blockers.push('独立审计记录缺失、未通过或研究版本不一致')
    return { status, complete, auditStatus: a.status || 'unknown', auditPassed, grade: u.grade || null, version, source, blockers }
  }
  function modelReturn (u, price, now) {
    const s = researchState(u), m = u && u.cashflowModel
    if (!s.complete || !s.auditPassed || !m || !text(m.version) || !text(m.source) || !finite(stamp(m.asOf)) || stamp(m.asOf) > clock(now) || m.researchVersion !== s.version || m.auditVersion !== u.audit.version) return null
    return irrOf(m.eps, m.growth, m.payout, m.tax, m.exitPE, price, m.years)
  }

  function applyDivUpdate (h, d) {
    if (h.dpsManual) return false
    const value = d && number(d.dps)
    if (!d || d.err || d.tag === 'stale' || value == null || value < 0) {
      h.dpsStale = true
      // 不把本次失败日期冒充上次成功日期。
      return false
    }
    const changed = h.dps !== value || !!h.dpsStale
    h.dps = value
    h.dpsStale = false
    h.dpsAsOf = d.asOf || new Date().toISOString().slice(0, 10)
    h.dpsSource = value === 0
      ? '近12个月无已实施分红（' + (d.source || '数据源') + '，' + h.dpsAsOf + '）'
      : (d.source || '近12个月已实施除息合计') + '（自动' + (d.tag === 'cache' ? '·缓存' : '·实时') + '）'
    return changed
  }

  function quoteOf (item, quotes) {
    const quote = quotes && quotes[item.qt]
    return quote && Number.isFinite(quote.price) && quote.price > 0 ? quote : item.px > 0 ? { price: item.px, snapshot: true } : null
  }
  function fxOf (cfg, quotes) {
    const quote = quotes && quotes.whHKDCNY
    return quote && quote.price > 0 ? quote.price : cfg.hkdcnyFallback || 0.8548
  }
  function holdingValue (h, quote, fx) {
    if (!h || !quote || !nonnegative(h.shares) || !nonnegative(quote.price)) return null
    const hk = h.market === 'HK' || /\.HK$/.test(h.code || ''), rate = hk ? fx : 1
    if (!(finite(rate) && rate > 0)) return null
    const mvCNY = h.shares * quote.price * rate, costAtSpotCNY = nonnegative(h.cost) ? h.shares * h.cost * rate : null
    const verified = !hk || h.costBasisStatus === 'verified' && cents(h.settledCostCNYFen) && text(h.costBasisSource)
    const costCNY = verified ? (hk ? h.settledCostCNYFen / 100 : costAtSpotCNY) : null
    const nativeCost = nonnegative(h.cost) ? h.shares * h.cost : null
    return { px: quote.price, mvCNY, costCNY, costAtSpotCNY, pl: costCNY == null ? null : mvCNY - costCNY,
      plPct: costCNY > 0 ? (mvCNY / costCNY - 1) * 100 : null, nativePl: nativeCost == null ? null : h.shares * quote.price - nativeCost,
      nativePlPct: nativeCost > 0 ? (quote.price / h.cost - 1) * 100 : null, snap: !!quote.snapshot,
      dpsCNY: nonnegative(h.dps) ? h.dps * rate : null, costBasisStatus: verified ? 'available' : 'unverified',
      costBasisNote: verified ? '持仓成本参考；实际全账户收益仍需交易和现金流对账' : '缺历史人民币结算成本；上市币种浮动仅供参考，不含汇兑' }
  }
  function dividendForBudget (cfg, quotes, code, amountCNY, withSpecial, gross) {
    const h = items(cfg,'holdings').find(x => x.code === code), u = items(cfg,'universe').find(x => x.code === code)
    const item = h || u; if (!item || !nonnegative(amountCNY)) return null
    const dps = h && h.dps != null ? h.dps : u && u.dps != null ? u.dps : null
    const special = withSpecial && u && u.dpsSpecial != null ? u.dpsSpecial : 0
    if (h && h.dpsStale || !nonnegative(dps) || !nonnegative(special)) return null
    const quote = quoteOf(item,quotes), px = quote && quote.price
    if (!(px > 0)) return null
    const tax = gross ? 0 : taxRateOf(h || Object.assign({market:/\.HK$/.test(code)?'HK':'A'},u)).r
    if (tax == null) return null
    return amountCNY / px * (dps + special) * (1 - tax)
  }
  function irrAt (px, prices, rates) {
    const anchors = rates, n = Array.isArray(prices) ? prices.length : 0
    if (!Array.isArray(rates) || rates.length !== n || rates.some(v => !finite(v) || v <= -1)) return null
    if (!(px > 0) || n < 2 || n > 4 || prices.some((p, i) => !(p > 0) || i > 0 && p >= prices[i - 1])) return null
    const levels = anchors
    if (px >= prices[0]) return Math.max(levels[0] - Math.log(px / prices[0]) * (levels[1] - levels[0]) / Math.log(prices[0] / prices[1]), -0.3)
    if (px <= prices[n - 1]) return Math.min(levels[n - 1] + Math.log(prices[n - 1] / px) * (levels[n - 1] - levels[n - 2]) / Math.log(prices[n - 2] / prices[n - 1]), 0.4)
    for (let i = 0; i < n - 1; i++) if (px <= prices[i] && px >= prices[i + 1]) {
      const f = (Math.log(px) - Math.log(prices[i + 1])) / (Math.log(prices[i]) - Math.log(prices[i + 1]))
      return levels[i + 1] + f * (levels[i] - levels[i + 1])
    }
    return null
  }
  function dataQuality (cfg, quotes, now) {
    const symbols = [...new Set([...(cfg.holdings || []), ...(cfg.universe || [])].map(x => x.qt).filter(Boolean))]
    const missing = missingSymbols(quotes, symbols)
    const today = new Date((now == null ? Date.now() : now) + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, '')
    const times = symbols.map(s => (quotes[s] && quotes[s].time || '').replace(/\D/g, '')).filter(t => /^\d{14}$/.test(t)).sort()
    return { total: symbols.length, missing, covered: symbols.length - missing.length, oldestTime: times[0] || '', undated: symbols.length - times.length,
      priorDate: times.filter(t => t.slice(0, 8) < today).length, fxFallback: !(quotes.whHKDCNY && quotes.whHKDCNY.price > 0),
      staleDps: (cfg.holdings || []).filter(h => h.dpsStale).length }
  }
  function displayQuoteTime (time) {
    return /^\d{14}$/.test(time) ? time.slice(0, 4) + '-' + time.slice(4, 6) + '-' + time.slice(6, 8) + ' ' + time.slice(8, 10) + ':' + time.slice(10, 12) : '时间未提供'
  }
  function researchSummary (company, cfg) {
    const pack = cfg && cfg._researchSupplement
    const supplement = pack && pack.presentationOnly === true && pack.schemaVersion === 1 && Array.isArray(pack.records)
      ? pack.records.find(row => Array.isArray(row.codes) && row.codes.includes(company.code)) : null
    const text = (field, fallback) => typeof company[field] === 'string' && company[field].trim() ? company[field] : fallback
    if (supplement) return {
      thesis: supplement.thesis, breakers: supplement.breakers, reviewBy: supplement.reviewBy,
      evidenceGap: (supplement.remainingGaps || []).map(g => typeof g === 'string' ? g : g.item).filter(Boolean).join('；') || '公开研究资料已补充；独立核验、账户对账和投资审批另行判断',
      supplementLabel: pack.asOf + '公开研究补充 · ' + (supplement.researchCompletion === 'done' ? '材料已齐' : '含待核项') + ' · 未授予执行资格',
      reportPath: /^\/research\/[a-z0-9_-]+\.html$/.test(supplement.reportPath || '') ? supplement.reportPath : null
    }
    return { thesis: text('thesisSummary', '持有逻辑摘要未录入，请核对研究报告'), breakers: text('thesisBreakers', '证伪条件未录入，不能仅凭价格触发行动'), reviewBy: text('reviewBy', '下次复核日期未录入'), evidenceGap: text('evidenceGap', '待核事项未单独录入，请核对研究报告'), supplementLabel: null, reportPath: null }
  }
  // 静态情景计算：普通股息税后、现金不受价格冲击；不预测发生概率或回本时间。
  function stressPortfolio (cfg, quotes, options) {
    cfg = cfg || {}; quotes = quotes || {}; options = options || {}
    const scope = options.scope == null ? 'current' : options.scope
    if (scope !== 'current' && scope !== 'planned') throw new RangeError('scope must be current or planned')
    const fraction = (key, max) => {
      const v = options[key] == null ? 0 : options[key]
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw new RangeError(key + ' out of range')
      return v
    }
    const priceDrop = fraction('priceDrop', 0.95), dividendCut = fraction('dividendCut', 1), hkdDrop = fraction('hkdDrop', 0.95)
    const target = options.incomeTargetCNY == null ? null : options.incomeTargetCNY
    if (target != null && (typeof target !== 'number' || !Number.isFinite(target) || target <= 0)) throw new RangeError('incomeTargetCNY must be positive or null')
    const holdings = Array.isArray(cfg.holdings) ? cfg.holdings : [], universe = Array.isArray(cfg.universe) ? cfg.universe : []
    const warnings = [], missingQuotes = [], missingDividend = [], contributors = []
    const warn = s => { if (!warnings.includes(s)) warnings.push(s) }
    const missing = (list, code) => { if (!list.includes(code)) list.push(code) }
    const nonnegative = v => typeof v === 'number' && Number.isFinite(v) && v >= 0
    let cash = 0, equity = 0, dividend = 0, loss = 0, dividendLoss = 0, assetsComplete = true, dividendComplete = true, allocationComplete = true, plannedAllocationPct = null
    let fx = fxOf(cfg, quotes)
    if (!(Number.isFinite(fx) && fx > 0)) fx = 0.8548
    const fxNote = () => {
      if (!(quotes.whHKDCNY && Number.isFinite(quotes.whHKDCNY.price) && quotes.whHKDCNY.price > 0)) warn('港币换算采用备用汇率，非实时汇率。')
    }
    const add = (item, value, annualDividend) => {
      const hk = item.market === 'HK' || !item.market && /\.HK$/.test(item.code || '')
      if (hk) fxNote()
      const assetFactor = (1 - priceDrop) * (hk ? 1 - hkdDrop : 1)
      const incomeFactor = (1 - dividendCut) * (hk ? 1 - hkdDrop : 1)
      const itemLoss = value == null ? null : value * (1 - assetFactor)
      const itemDividendLoss = annualDividend == null ? null : annualDividend * (1 - incomeFactor)
      if (value != null) { equity += value; loss += itemLoss }
      if (annualDividend != null) { dividend += annualDividend; dividendLoss += itemDividendLoss }
      contributors.push({ code: item.code || '', name: item.name || item.code || '', value, loss: itemLoss, dividendLoss: itemDividendLoss })
    }
    const dpsOf = (h, u) => h && h.dps != null ? h.dps : u && u.dps
    const checkDps = (code, dps, h) => {
      if (!nonnegative(dps)) {
        missing(missingDividend, code); dividendComplete = false; warn('部分普通每股股息缺失，股息结果仅为已覆盖估算。'); return false
      }
      if (h && h.dpsStale) { dividendComplete = false; warn('部分每股股息已标记过期，股息结果需复核。') }
      return true
    }
    if (scope === 'current') {
      const cashInput = cfg.investable != null ? cfg.investable : cfg.cash != null ? cfg.cash : 0
      if (nonnegative(cashInput)) cash = cashInput
      else { assetsComplete = false; warn('可投资金无效，未计入已覆盖资产。') }
      const seen = new Set()
      holdings.forEach(h => {
        if (!h || typeof h !== 'object') { assetsComplete = dividendComplete = false; warn('持仓记录无效。'); return }
        const code = h.code || h.qt || '未知持仓'
        if (seen.has(code)) { assetsComplete = dividendComplete = allocationComplete = false; warn('持仓成员重复：' + code); return }
        seen.add(code)
        if (!nonnegative(h.shares)) { assetsComplete = dividendComplete = false; warn('持股数量无效：' + code); return }
        if (h.shares === 0) return
        const q = quoteOf(h, quotes), v = q ? holdingValue(h, q, fx) : null
        if (!v || !nonnegative(v.mvCNY)) { missing(missingQuotes, code); assetsComplete = false; warn('部分持仓行情缺失，资产结果仅为已覆盖估算。') }
        else if (q.snapshot) warn('部分持仓采用备用价格，非实时行情。')
        const hk = h.market === 'HK', validDps = checkDps(code, h.dps, h)
        const tax = taxRateOf(h,options.now).r
        if (tax == null) { dividendComplete = false; warn('部分持仓税率依据缺失，股息仅显示已覆盖部分。') }
        const income = validDps && tax != null ? h.shares * h.dps * (hk ? fx : 1) * (1-tax) : null
        add(Object.assign({}, h, { market: h.market === 'HK' ? 'HK' : 'A' }), v && nonnegative(v.mvCNY) ? v.mvCNY : null, income)
      })
    } else {
      const capital = planningCapital(cfg)
      if (!nonnegative(capital) || capital <= 0) throw new RangeError('targetCapital must be positive')
      const seats = cfg.seats && Array.isArray(cfg.seats.list) ? cfg.seats.list : []
      const seen = new Set()
      let pctSum = 0, allocated = 0
      if (!seats.length) warn('未配置席位，目标本金全部按现金处理。')
      seats.forEach(seat => {
        if (!seat || !nonnegative(seat.pct)) { allocationComplete = false; warn('席位权重无效。'); return }
        pctSum += seat.pct
        const members = Array.isArray(seat.members) ? seat.members : []
        if (!members.length) { warn('空席位预算按现金处理。'); return }
        if (members.length > 1) warn('同席成员预算采用等分假设，非执行比例。')
        const per = capital * seat.pct / 100 / members.length
        if (per === 0) return
        members.forEach(code => {
          if (seen.has(code)) { allocationComplete = false; warn('规划成员重复：' + code); return }
          seen.add(code)
          const h = holdings.find(x => x && x.code === code), u = universe.find(x => x && x.code === code)
          if (!h && !u) { allocationComplete = false; warn('规划成员未知：' + code); return }
          allocated += per
          const item = Object.assign({}, u, h), dps = dpsOf(h, u), validDps = checkDps(code, dps, h)
          // 与网页版 dividendForBudget 保持同源：持仓 quoteOf；未持仓按股票池 px。
          const q = quoteOf(h || u, quotes)
          const px = q && q.price ? q.price : u && u.px != null ? u.px : null
          if (!(typeof px === 'number' && Number.isFinite(px) && px > 0)) {
            missing(missingQuotes, code); dividendComplete = false; warn('部分规划成员价格缺失，无法折算目标持股数及股息。')
          } else if (!q || q.snapshot) warn('部分规划成员采用股票池或持仓备用价格，非实时行情。')
          let income = null
          if (validDps && px > 0) income = dps === 0 ? 0 : dividendForBudget({ holdings, universe, hkdcnyFallback: fx }, quotes, code, per, false, false)
          if (validDps && income == null) dividendComplete = false
          add(item, per, income)
        })
      })
      plannedAllocationPct = pctSum
      if (pctSum > 100) { allocationComplete = false; warn('席位权重超过100%，不能形成有效满配结论。') }
      if (pctSum < 100) warn('未分配预算按现金处理。')
      cash = Math.max(0, capital - allocated)
      if (!allocationComplete) { assetsComplete = dividendComplete = false; warn('规划配置不完整或冲突，以下仅为可识别部分，不能作为完整组合结论。') }
    }
    const known = {
      baseAssets: cash + equity, baseEquity: equity, baseDividend: dividend, assetLoss: loss,
      assetLossPct: cash + equity > 0 ? loss / (cash + equity) : 0,
      stressedAssets: cash + equity - loss, stressedDividend: dividend - dividendLoss, dividendLoss,
      incomeGap: target == null ? null : Math.max(0, target - (dividend - dividendLoss)),
      incomeCoverage: target == null ? null : (dividend - dividendLoss) / target
    }
    const result = { scope, cash, contributors, warnings, missingQuotes, missingDividend, plannedAllocationPct,
      complete: { assets: assetsComplete, dividend: dividendComplete, allocation: allocationComplete },
      valid: assetsComplete && dividendComplete && allocationComplete, known }
    ;['baseAssets', 'baseEquity', 'assetLoss', 'assetLossPct', 'stressedAssets'].forEach(key => { result[key] = assetsComplete ? known[key] : null })
    ;['baseDividend', 'stressedDividend', 'dividendLoss', 'incomeGap', 'incomeCoverage'].forEach(key => { result[key] = dividendComplete ? known[key] : null })
    // 极端但有限的输入也可能溢出；不将 Infinity / NaN 交给界面当成结果。
    let overflow = false
    const sanitize = obj => Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'number' && !Number.isFinite(obj[key])) { obj[key] = null; overflow = true; warn('输入规模导致数值溢出，请检查配置。') }
      else if (obj[key] && typeof obj[key] === 'object') sanitize(obj[key])
    })
    sanitize(result)
    if (overflow) {
      result.valid = false
      result.complete.assets = result.complete.dividend = false
      ;['baseAssets', 'baseEquity', 'assetLoss', 'assetLossPct', 'stressedAssets', 'baseDividend', 'stressedDividend', 'dividendLoss', 'incomeGap', 'incomeCoverage'].forEach(key => { result[key] = null })
    }
    return result
  }

  function dividendSummary (cfg, quotes, options) {
    options = options || {}; const missing = [], rows = []; let knownDividend = 0, covered = 0, total = 0
    if (options.scope === 'planned') {
      const capital = planningCapital(cfg), seats = cfg && cfg.seats && cfg.seats.list || []
      seats.forEach(st => { const members = st.members || [], amount = capital != null && nonnegative(st.pct) && members.length ? capital*st.pct/100/members.length : null
        members.forEach(code => { total++; const value = amount == null ? null : dividendForBudget(cfg,quotes,code,amount,!!options.withSpecial,!!options.gross)
          if (value == null) missing.push(code); else { knownDividend += value; covered++ } rows.push({code,value,amountCNY:amount}) }) })
      if (capital == null || !seats.length) missing.push('规划本金/席位缺失')
    } else items(cfg,'holdings').filter(h => h.shares > 0).forEach(h => {
      total++; const hk = h.market === 'HK' || /\.HK$/.test(h.code || ''), rate = hk ? fxOf(cfg,quotes) : 1, tax = options.gross ? 0 : taxRateOf(h,options.now).r
      const value = !h.dpsStale && nonnegative(h.dps) && finite(rate) && rate > 0 && tax != null ? h.shares*h.dps*rate*(1-tax) : null
      if (value == null) missing.push(h.code); else {knownDividend+=value;covered++} rows.push({code:h.code,value})
    })
    return {value:missing.length?null:knownDividend,knownDividend,complete:missing.length===0,covered,total,missing,rows,
      cashInterest:cfg && nonnegative(cfg.investable != null?cfg.investable:cfg.cash) && nonnegative(cfg.cashYield) ? (cfg.investable!=null?cfg.investable:cfg.cash)*cfg.cashYield/100 : null}
  }
  function tradeActivity (cfg, code, now) {
    const codes=issuerCodes(cfg,code), at=clock(now), trades=items(cfg,'trades').filter(t=>codes.includes(t.code) && finite(stamp(t.date)) && stamp(t.date)<=at && at-stamp(t.date)<=3*86400000)
    const executions=items(cfg,'actionExecutions').filter(a=>{const u=items(cfg,'universe').find(u=>u.code===a.code)||{},p=u.executionPolicy||{};return codes.includes(a.code)&&a.status==='completed'&&text(a.actionId)&&text(a.source)&&a.policyVersion===p.version&&a.dataRevision===cfg.decisionDataRevision&&text(a.dataRevision)&&finite(stamp(a.completedAt))&&stamp(a.completedAt)<=at&&Array.isArray(p.tranches)&&p.tranches.some(t=>t.id===a.actionId)})
    return {trades,shares:trades.reduce((n,t)=>n+(nonnegative(t.shares)?t.shares:0),0),hasRecent:trades.length>0,
      completedActionIds:executions.map(a=>a.actionId),label:executions.length?'有已核行动记录':trades.length?'有近期成交，未核实本档完成':'无近期成交记录'}
  }
  function ledgerSummary (cfg) {
    const l=cfg&&cfg.budgetLedger||{}, blockers=[]
    if(l.status!=='reconciled')blockers.push('尚无已对账总账')
    for(const [key,label] of [['openingVerified','期初余额'],['positionsVerified','持仓'],['cashFlowsVerified','完整现金流'],['cashVerified','现金余额']]) if(l[key]!==true)blockers.push(label+'未核')
    if(!text(l.source)||!text(l.dataRevision)||!finite(stamp(l.asOf)))blockers.push('缺对账凭证/版本/日期')
    if (l.dataRevision !== (cfg||{}).decisionDataRevision) blockers.push('总账数据版本不一致')
    const holdings=items(cfg,'holdings'), positions=Array.isArray(l.positions)?l.positions:[]
    if (positions.length!==holdings.length || new Set(positions.map(h=>h.code)).size!==positions.length || holdings.some(h=>!positions.some(p=>p.code===h.code&&p.shares===h.shares))) blockers.push('总账持仓数量未勾稽')
    if (!cents(l.cashAvailableCNYFen) || l.cashAvailableCNYFen!==fen(cfg&&(cfg.investable!=null?cfg.investable:cfg.cash))) blockers.push('总账现金未勾稽')
    const trades=items(cfg,'trades'), keys=new Set(), duplicateCandidates=[]
    trades.forEach((t,i)=>{const key=[t.date,t.code,t.price,t.shares,t.side||''].join('|');if(keys.has(key))duplicateCandidates.push(i);keys.add(key)})
    const withoutProof=trades.filter(t=>!text(t.tradeId)||!text(t.source)||!text(t.side)||!finite(stamp(t.date))).length
    return {complete:!blockers.length,label:blockers.length?'待对账':'总账已核',blockers,tradeCount:trades.length,withoutProof,duplicateCandidates,
      realizedReturn:null,totalReturn:null,source:l.source||null,asOf:l.asOf||null}
  }
  function quoteMillis (q) {
    const t=q&&q.time;if(typeof t!=='string'||!/^\d{14}$/.test(t))return NaN
    const iso=t.slice(0,4)+'-'+t.slice(4,6)+'-'+t.slice(6,8)+'T'+t.slice(8,10)+':'+t.slice(10,12)+':'+t.slice(12,14)+'+08:00'
    const n=Date.parse(iso);return finite(n)&&new Date(n+8*3600000).toISOString().replace(/[-:TZ.]/g,'').slice(0,14)===t?n:NaN
  }
  function decisionBudget (cfg, quotes, code, options) {
    cfg=cfg||{};quotes=quotes||{};options=options||{};const at=clock(options.now), u=items(cfg,'universe').find(x=>x.code===code)||{}, st=seatOf(cfg,code), capital=planningCapital(cfg)
    const blockers=[], block=s=>{if(!blockers.includes(s))blockers.push(s)}, codes=issuerCodes(cfg,code), p=u.executionPolicy||{}, a=u.executionApproval||{}, l=cfg.budgetLedger||{}, r=researchState(u)
    const supplement=cfg._researchSupplement
    if(supplement&&supplement.status==='unavailable')block('研究补充包不可用，最新证据版本无法核实')
    if(supplement&&supplement.presentationOnly===true&&Array.isArray(supplement.records)&&supplement.records.some(row=>(row.codes||[]).includes(code))&&(!text(supplement.version)||(u.audit||{}).researchSupplementVersion!==supplement.version||a.researchSupplementVersion!==supplement.version))block('最新研究补充版本尚未纳入审计和批准记录')
    const key=text(u.issuerId)?u.issuerId:codes.slice().sort()[0], holdings=items(cfg,'holdings'), limits=positionLimit(cfg,code)
    let issuerValue=0,seatValue=0,issuerComplete=true,seatComplete=true
    holdings.forEach(h=>{const x=holdingValue(h,quoteOf(h,quotes),fxOf(cfg,quotes));if(!x||!finite(x.mvCNY)||fen(x.mvCNY)==null){block('部分持仓缺少有效且可安全计算的估值行情');if(codes.includes(h.code))issuerComplete=false;if(st&&(st.members||[]).some(cd=>issuerCodes(cfg,cd).includes(h.code)))seatComplete=false;return}if(codes.includes(h.code))issuerValue+=x.mvCNY;if(st&&(st.members||[]).some(cd=>issuerCodes(cfg,cd).includes(h.code)))seatValue+=x.mvCNY})
    const seatBudget=capital!=null&&st&&nonnegative(st.pct)?capital*st.pct/100:null
    const out={code,seatKey:st&&st.key||null,seatName:st&&st.name||null,planningCapital:capital,issuerValueCNY:issuerComplete?issuerValue:null,seatValueCNY:seatComplete?seatValue:null,seatBudgetCNY:seatBudget,seatRoomCNY:seatBudget==null||!seatComplete?null:Math.max(0,seatBudget-seatValue),researchRoomCNY:issuerComplete&&capital!=null&&limits.pct!=null?Math.max(0,capital*limits.pct/100-issuerValue):null,approvedCNY:0,approvedCNYFen:0,blockers,checks:{},status:'blocked',quoteTime:quotes[u.qt]&&quotes[u.qt].time||null,policyVersion:p.version||null,dataRevision:cfg.decisionDataRevision||null}
    if(fen(issuerValue)==null||fen(seatValue)==null)block('组合金额超出安全整数范围');if(holdings.some(h=>!Number.isSafeInteger(h.shares)||h.shares<0))block('持股数量不是有效整数');r.blockers.forEach(block); if(cfg.decisionInputsChanged)block('数据编辑后尚未重新对账与审批');if(!finite(at))block('核验时钟无效');if(stamp((u.research||{}).asOf)>at||stamp((u.audit||{}).asOf)>at)block('研究或审计日期位于未来');if(!st)block('未归入有效共享席位');if(capital==null||seatBudget==null)block('规划本金/席位预算未确认')
    if(!['A','B'].includes(u.grade))block('质量等级未达到A/B门槛')
    const validWindow=x=>finite(stamp(x.validFrom||x.approvedAt))&&finite(stamp(x.validUntil))&&stamp(x.validFrom||x.approvedAt)<=at&&at<=stamp(x.validUntil)
    if(p.status!=='approved'||!text(p.version)||!validWindow(p)||p.seatKey!==(st&&st.key)||p.denominator!=='planningCapital'||!cents(p.planningCapitalCNYFen)||fen(capital)==null||p.planningCapitalCNYFen!==fen(capital)||!cents(p.issuerMaxCNYFen)||!cents(p.feeReserveCNYFen))block('缺有效且分母一致的正式执行政策')
    if(a.status!=='approved'||!text(a.source)||!validWindow(a)||a.policyVersion!==p.version||a.researchVersion!==r.version||a.auditVersion!==(u.audit||{}).version||a.dataRevision!==cfg.decisionDataRevision||!text(cfg.decisionDataRevision))block('缺对应政策、研究、审计和数据版本的批准记录')
    const ls=ledgerSummary(cfg);ls.blockers.forEach(block)
    if(stamp(l.asOf)>at)block('总账对账日期位于未来');if(l.dataRevision!==cfg.decisionDataRevision)block('对账数据版本不一致')
    if(!['no-release','reconciled-ledger'].includes(l.sellReleaseRule))block('卖出释放预算规则未确定')
    if(!cents(l.cashAvailableCNYFen)||!cents(l.reservedCashCNYFen)||l.cashAvailableCNYFen!==fen(cfg.investable!=null?cfg.investable:cfg.cash)||l.reservedCashCNYFen>l.cashAvailableCNYFen)block('现金/预留与对账记录不一致')
    const lp=Array.isArray(l.positions)?l.positions:[]
    if(lp.length!==holdings.length||new Set(lp.map(h=>h.code)).size!==lp.length||holdings.some(h=>!lp.some(x=>x.code===h.code&&x.shares===h.shares)))block('总账持仓与当前持仓不一致')
    if(holdings.some(h=>(h.market==='HK'||/\.HK$/.test(h.code||''))&&(h.costBasisStatus!=='verified'||!cents(h.settledCostCNYFen)||!text(h.costBasisSource))))block('港股历史人民币结算成本未核')
    const issuers=l.issuers||{}, seats=l.seats||{}, ci=issuers[key], cs=st&&seats[st.key]
    const goodRow=x=>x&&cents(x.netInvestedCNYFen)&&cents(x.reservedCNYFen)
    if(!goodRow(ci)||!goodRow(cs))block('缺已核发行人与全席累计投入/预留')
    const required=new Set(holdings.map(h=>{const g=issuerCodes(cfg,h.code);const hU=items(cfg,'universe').find(x=>x.code===h.code)||h;return text(hU.issuerId)?hU.issuerId:g.slice().sort()[0]}));required.add(key)
    if([...required].some(k=>!goodRow(issuers[k])))block('其他持仓发行人累计投入记录不完整')
    const ss=cfg.seats&&cfg.seats.list||[], memberships=new Set();let seatPct=0
    ss.forEach(seat=>{seatPct+=nonnegative(seat.pct)?seat.pct:101;const ks=[...new Set((seat.members||[]).map(cd=>{const g=issuerCodes(cfg,cd), it=items(cfg,'universe').find(x=>x.code===cd)||{};return text(it.issuerId)?it.issuerId:g.slice().sort()[0]}))]
      const row=seats[seat.key];if(!goodRow(row))block('全席预算对账记录不完整')
      let used=0,reserved=0;ks.forEach(k=>{if(memberships.has(k))block('同发行人被多个席位重复配置');memberships.add(k);if(goodRow(issuers[k])){used+=issuers[k].netInvestedCNYFen;reserved+=issuers[k].reservedCNYFen}else block('席位成员累计投入记录不完整')})
      if(goodRow(row)&&(row.netInvestedCNYFen!==used||row.reservedCNYFen!==reserved))block('席位与成员累计投入/预留不勾稽')})
    if(holdings.some(h=>!ss.some(s=>(s.members||[]).some(cd=>issuerCodes(cfg,cd).includes(h.code)))&&!items(cfg.seats,'transitional').includes(h.code)))block('持仓未归属席位或过渡仓');if(new Set(ss.map(s=>s.key)).size!==ss.length)block('席位标识重复');if(!u.qt||holdings.some(h=>!h.qt))block('证券行情标识缺失');if(seatPct>100.000001)block('席位权重合计超过100%')
    const allReserved=Object.values(issuers).reduce((n,x)=>n+(goodRow(x)?x.reservedCNYFen:0),0)
    if(Object.values(issuers).some(x=>!goodRow(x)))block('存在无效发行人账项');if(!cents(allReserved))block('预留汇总超出安全整数范围');if(cents(l.reservedCashCNYFen)&&allReserved!==l.reservedCashCNYFen)block('发行人与全账户现金预留不勾稽')
    const maxAge=finite(p.quoteMaxAgeMs)&&p.quoteMaxAgeMs>0&&p.quoteMaxAgeMs<=86400000?p.quoteMaxAgeMs:null
    const needed=[...new Set([u.qt,...holdings.map(h=>h.qt),...(holdings.some(h=>h.market==='HK'||/\.HK$/.test(h.code||''))||/\.HK$/.test(code)?['whHKDCNY']:[])].filter(Boolean))]
    needed.forEach(qt=>{const q=quotes[qt],ts=quoteMillis(q);if(!q||q.snapshot||!finite(q.price)||q.price<=0||!finite(ts)||maxAge==null||at-ts>maxAge||ts-at>60000)block('报价或汇率缺少有效时效依据：'+qt)})
    const tr=Array.isArray(p.tranches)?p.tranches:[];let tranche=null
    if(!tr.length||tr.some((t,i)=>!text(t.id)||!finite(t.price)||t.price<=0||!cents(t.cumulativeCostCNYFen)||i>0&&(t.price>=tr[i-1].price||t.cumulativeCostCNYFen<tr[i-1].cumulativeCostCNYFen))||new Set(tr.map(t=>t.id)).size!==tr.length)block('正式分档金额/价格/行动标识不完整')
    else tr.forEach(t=>{if(quotes[u.qt]&&quotes[u.qt].price<=t.price)tranche=t})
    if(!tranche)block('尚未进入正式行动档')
    if(finite(u.riskMaxPct)&&capital!=null&&p.issuerMaxCNYFen>fen(capital*u.riskMaxPct/100))block('正式政策超过显式个股风险上限');if(!p.issuerMaxCNYFen||seatBudget!=null&&p.issuerMaxCNYFen>fen(seatBudget))block('发行人限额超过共享席位预算或无效')
    out.checks={research:r.complete,audit:r.auditPassed,ledger:ls.complete,policy:!blockers.some(b=>b.includes('政策')),quote:!blockers.some(b=>b.includes('报价')),approval:!blockers.some(b=>b.includes('批准记录'))}
    if(!blockers.length){const parts=[tranche.cumulativeCostCNYFen-ci.netInvestedCNYFen-ci.reservedCNYFen,fen(seatBudget)-cs.netInvestedCNYFen-cs.reservedCNYFen,p.issuerMaxCNYFen-ci.netInvestedCNYFen-ci.reservedCNYFen,p.issuerMaxCNYFen-fen(issuerValue)-ci.reservedCNYFen,fen(seatBudget)-fen(seatValue)-cs.reservedCNYFen,l.cashAvailableCNYFen-l.reservedCashCNYFen-p.feeReserveCNYFen]
      const amount=Math.max(0,Math.min(...parts));if(Number.isSafeInteger(amount)){out.approvedCNYFen=amount;out.approvedCNY=amount/100;out.status=amount>0?'approved':'blocked';out.actionId=tranche.id;if(!amount)block('预算或现金没有可用余量')}else block('金额计算超出安全整数范围')}
    return out
  }
  return { planningCapital, issuerCodes, positionLimit, taxRateOf, modelFlows, priceAt, irrOf, researchState, modelReturn, dividendSummary, tradeActivity, ledgerSummary, decisionBudget, toFen:fen, fromFen:v=>cents(v)?v/100:null, parseQuotes, missingSymbols, ladderState, positionRoom, applyDivUpdate, quoteOf, fxOf, holdingValue, dividendForBudget, irrAt, dataQuality, displayQuoteTime, researchSummary, stressPortfolio }
})
