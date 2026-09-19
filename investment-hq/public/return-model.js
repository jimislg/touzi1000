/* 年末税后股息 + 末年出售；纯计算模块供页面和校验共用。 */
(function (root) {
  'use strict';
  function scenario(model, mode) {
    const m = { ...model };
    if (mode === 'stress') {
      m.eps *= 0.9;
      m.growth = Math.max(0, m.growth - 0.03);
      m.exitPE *= 0.8;
    } else if (mode === 'eps26' && model.label === '腾讯控股') {
      m.eps = 26;
    }
    return m;
  }
  function flows(m, years) {
    return Array.from({ length: years }, (_, i) => {
      const eps = m.eps * (1 + m.growth) ** (i + 1) / m.fx;
      return eps * m.payout * (1 - m.tax) + (i === years - 1 ? eps * m.exitPE : 0);
    });
  }
  function presentValue(cashFlows, rate) {
    return cashFlows.reduce((sum, value, i) => sum + value / (1 + rate) ** (i + 1), 0);
  }
  function irr(cashFlows, price) {
    if (!(price > 0) || !Number.isFinite(price)) return null;
    let low = -0.9999, high = 1;
    while (presentValue(cashFlows, high) > price && high < 1e8) high *= 2;
    for (let i = 0; i < 140; i++) {
      const mid = (low + high) / 2;
      if (presentValue(cashFlows, mid) > price) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }
  function result(model, price, years) {
    if (!(price > 0) || !Number.isFinite(price)) return null;
    const cashFlows = flows(model, years);
    const terminalCash = cashFlows.reduce((a, b) => a + b, 0);
    const wealth = terminalCash / price;
    return { irr: irr(cashFlows, price), wealth, cagr: wealth ** (1 / years) - 1, terminalCash };
  }
  const api = { scenario, flows, presentValue, irr, result };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReturnModel = api;
})(typeof window === 'undefined' ? globalThis : window);
