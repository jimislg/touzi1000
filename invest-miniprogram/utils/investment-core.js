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
    return Math.max(0, limitPct - weightPct) / 100 * capital
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
    if (!quote) return null
    const rate = h.market === 'HK' ? fx : 1
    const mvCNY = h.shares * quote.price * rate, costCNY = h.shares * h.cost * rate
    return { px: quote.price, mvCNY, costCNY, pl: mvCNY - costCNY, plPct: costCNY > 0 ? (mvCNY / costCNY - 1) * 100 : null, snap: !!quote.snapshot, dpsCNY: h.dps * rate }
  }
  function dividendForBudget (cfg, quotes, code, amountCNY, withSpecial, gross) {
    const h = cfg.holdings.find(x => x.code === code), u = cfg.universe.find(x => x.code === code)
    const dps = h && h.dps != null ? h.dps : u && u.dps != null ? u.dps : null
    const special = withSpecial && u && u.dpsSpecial != null ? u.dpsSpecial : 0
    const quote = h ? quoteOf(h, quotes) : null
    const px = quote && quote.price ? quote.price : u && u.px != null ? u.px : null
    const market = h && h.market ? h.market : u && u.code.endsWith('.HK') ? 'HK' : 'A'
    if (!(dps + special > 0) || !(px > 0)) return null
    const fx = fxOf(cfg, quotes), rate = market === 'HK' ? fx : 1
    return amountCNY / (px * rate) * (dps + special) * (gross ? 1 : market === 'HK' ? 0.8 : 0.9) * rate
  }
  function irrAt (px, prices) {
    const anchors = [0.10, 0.12, 0.15, 0.1746], n = prices.length
    if (!(px > 0) || n < 2 || n > 4 || prices.some((p, i) => !(p > 0) || i > 0 && p >= prices[i - 1])) return null
    const levels = anchors.slice(anchors.length - n)
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
  function researchSummary (company) {
    const text = (field, fallback) => typeof company[field] === 'string' && company[field].trim() ? company[field] : fallback
    return { thesis: text('thesisSummary', '持有逻辑摘要未录入，请核对研究报告'), breakers: text('thesisBreakers', '证伪条件未录入，不能仅凭价格触发行动'), reviewBy: text('reviewBy', '下次复核日期未录入'), evidenceGap: text('evidenceGap', '待核事项未单独录入，请核对研究报告') }
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
        const income = validDps ? h.shares * h.dps * (hk ? fx * 0.8 : 0.9) : null
        add(Object.assign({}, h, { market: h.market === 'HK' ? 'HK' : 'A' }), v && nonnegative(v.mvCNY) ? v.mvCNY : null, income)
      })
    } else {
      const capital = cfg.targetCapital || 10000000
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
          const q = h ? quoteOf(h, quotes) : null
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
  return { parseQuotes, missingSymbols, ladderState, positionRoom, applyDivUpdate, quoteOf, fxOf, holdingValue, dividendForBudget, irrAt, dataQuality, displayQuoteTime, researchSummary, stressPortfolio }
})
