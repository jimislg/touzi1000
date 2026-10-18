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
  return { parseQuotes, missingSymbols, ladderState, positionRoom, applyDivUpdate, quoteOf, fxOf, holdingValue, dividendForBudget, irrAt, dataQuality, displayQuoteTime, researchSummary }
})
