/* Standalone research mathematics. No account, approval, network or order writes. */
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.RepricingMath = api
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'
  const rates = [0.10, 0.12, 0.15, 0.1746]
  const finite = n => typeof n === 'number' && Number.isFinite(n)
  const need = (ok, message) => { if (!ok) throw Error(message) }
  const floorPrice = value => finite(value) && value > 0 ? Math.floor((value + 1e-10) * 10) / 10 : null
  function pv (flows, rate) {
    need(Array.isArray(flows) && flows.every(finite) && finite(rate) && rate > -1, 'invalid cash-flow PV')
    return flows.reduce((sum, value, i) => sum + value / Math.pow(1 + rate, i + 1), 0)
  }
  function irr (cost, flows) {
    need(finite(cost) && cost > 0 && Array.isArray(flows) && flows.every(x => finite(x) && x >= 0), 'IRR needs one initial outflow and nonnegative future proceeds')
    if (!flows.some(x => x > 0)) return null
    let lo = -0.999, hi = 1
    const residual = r => pv(flows, r) - cost
    while (residual(hi) > 0 && hi < 1e6) hi *= 2
    if (!(residual(lo) > 0 && residual(hi) < 0)) return null
    for (let i = 0; i < 180; i++) { const mid = (lo + hi) / 2; if (residual(mid) > 0) lo = mid; else hi = mid }
    return (lo + hi) / 2
  }
  function annualRows (model, c, tax = 0) {
    need(finite(tax) && tax >= 0 && tax < 1, 'invalid dividend tax')
    const rows = []
    let bps = c.bps0
    const method = model.method || model.type
    for (let t = 1; t <= 10; t++) {
      let eps = null, dividend, terminal = 0, bpsStart = null, bpsEnd = null
      if (method === 'bank') {
        need(finite(bps) && bps > 0 && finite(c.roe) && c.roe >= 0 && finite(c.payout) && c.payout >= 0 && c.payout <= 1, 'invalid bank capital model')
        bpsStart = bps; eps = bps * c.roe; dividend = eps * c.payout; bps += eps - dividend; bpsEnd = bps
        if (t === 10) terminal = bps * (c.exitPB ?? c.exit_pb)
      } else if (method === 'finite_dcf') {
        need(Array.isArray(c.annualCashPerShare) && c.annualCashPerShare.length === 10 && c.annualCashPerShare.every(x => finite(x) && x >= 0), 'finite-rights model requires ten nonnegative distributable cash amounts')
        need(c.residual == null || c.residual === 0, 'unapproved finite-rights residual')
        dividend = c.annualCashPerShare[t - 1]
      } else if (method === 'dividend_proxy') {
        need(finite(c.dividend0) && c.dividend0 >= 0 && finite(c.exitYield) && c.exitYield > 0, 'invalid dividend proxy')
        dividend = c.dividend0 * Math.pow(1 + c.g1, Math.min(t, 5)) * Math.pow(1 + c.g2, Math.max(t - 5, 0))
        if (t === 10) terminal = dividend / c.exitYield
      } else {
        need(finite(c.g1) && c.g1 > -1 && finite(c.g2) && c.g2 > -1 && finite(c.payout) && c.payout >= 0 && c.payout <= 1, 'invalid earnings assumptions')
        if (finite(c.epsYear1)) eps = c.epsYear1 * Math.pow(1 + c.g1, Math.min(t - 1, 4)) * Math.pow(1 + c.g2, Math.max(t - 5, 0))
        else { need(finite(c.eps0) && c.eps0 >= 0, 'missing normalized EPS'); eps = c.eps0 * Math.pow(1 + c.g1, Math.min(t, 5)) * Math.pow(1 + c.g2, Math.max(t - 5, 0)) }
        dividend = eps * c.payout
        if (t === 10) terminal = eps * (c.exitPE ?? c.exit_pe)
      }
      need(finite(dividend) && dividend >= 0 && finite(terminal) && terminal >= 0, 'invalid ordinary-share proceeds')
      rows.push({ t, year: 2026 + t, eps, bpsStart, bpsEnd, grossDividend: dividend, netDividend: dividend * (1 - tax), terminal })
    }
    return rows
  }
  function proceeds (rows, exitFee = 0) { return rows.map(row => row.netDividend + row.terminal * (1 - exitFee)) }
  function hurdlePrice (rows, rate, entryFee = 0, exitFee = 0) {
    need(entryFee >= 0 && entryFee < 1 && exitFee >= 0 && exitFee < 1, 'invalid friction assumption')
    return pv(proceeds(rows, exitFee), rate) / (1 + entryFee)
  }
  function ownerValue (c, rate) {
    if (!c) return null
    let cash
    if (Array.isArray(c.annualCashPerShare)) { need(c.annualCashPerShare.length === 10 && c.annualCashPerShare.every(finite), 'owner cash array needs ten years'); cash = c.annualCashPerShare.slice() }
    else { need(finite(c.cashYear1) && finite(c.g1) && finite(c.g2) && c.g1 > -1 && c.g2 > -1, 'invalid owner cash forecast'); cash = Array.from({ length: 10 }, (_, i) => c.cashYear1 * Math.pow(1 + c.g1, Math.min(i, 4)) * Math.pow(1 + c.g2, Math.max(i - 4, 0))) }
    const growth = c.terminalGrowth ?? 0
    need(finite(growth) && growth >= -0.02 && growth <= 0.02 && rate > growth, 'terminal growth outside explicit conservative bounds')
    const terminal = c.finite === true ? 0 : Math.max(0, cash[9]) * (1 + growth) / (rate - growth)
    const flows = cash.slice(); flows[9] += terminal
    const rawValue = pv(flows, rate)
    return { value: Math.max(0, rawValue), rawValue, annualCashPerShare: cash, terminal, terminalShare: rawValue > 0 ? terminal / Math.pow(1 + rate, 10) / rawValue : null, rate, growth }
  }
  function bankResidualValue (model, key, rate) {
    const c = model.crossCheck && model.crossCheck.cases && model.crossCheck.cases[key]
    if (!c || model.crossCheck.method !== 'residual_income') return null
    const bps = model.cases[key].bps0, growth = c.growth, roe = c.roe
    need(finite(bps) && finite(growth) && finite(roe) && growth >= 0 && growth < rate && roe >= growth, 'invalid residual-income capital/growth bridge')
    return { value: Math.max(0, bps * (roe - growth) / (rate - growth)), rate, growth, roe, impliedPB: (roe - growth) / (rate - growth) }
  }
  function economicValue (model, key, rate) {
    const owner = ownerValue(model.ownerCashCases && model.ownerCashCases[key], rate)
    if (owner) return { ...owner, method: '全部现金投资后的所有者现金DCF', independentCashModel: true }
    const bank = bankResidualValue(model, key, rate)
    if (bank) return { ...bank, method: '普通股资本剩余收益/Gordon交叉', independentCashModel: true }
    const rows = annualRows(model, model.cases[key], 0)
    return { value: pv(proceeds(rows), rate), rate, method: model.method === 'finite_dcf' ? '十年有限分配现金下限，零残值' : model.method === 'dividend_proxy' ? '股息与退出收益率条件代理，非NAV' : '盈利/退出条件估值；缺独立现金或NAV', independentCashModel: false }
  }
  function marketImpliedGrowth (model, key, cost, requiredReturn, entryFee, exitFee, tax = 0) {
    if (!['eps', 'operating_eps', 'operating_units'].includes(model.method)) return null
    const c = model.cases[key]
    const value = growth => hurdlePrice(annualRows(model, { ...c, g1: growth, g2: growth }, tax), requiredReturn, entryFee, exitFee)
    let lo = -0.5, hi = 1
    if (value(lo) > cost || value(hi) < cost) return null
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (value(mid) < cost) lo = mid; else hi = mid }
    return (lo + hi) / 2
  }
  return { rates, floorPrice, pv, irr, annualRows, proceeds, hurdlePrice, ownerValue, bankResidualValue, economicValue, marketImpliedGrowth }
})
