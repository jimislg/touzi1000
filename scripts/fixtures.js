/* 全部为合成测试数据，不代表账户、真实成本或投资建议。 */
const config = {
  investable: 1000000, cash: 1000000, targetCapital: 1200000, cashYield: 1, pathCAGR: 0.1746, annualContribution: 0, hkdcnyFallback: 0.85,
  holdings: [
    { code: '600000.SH', qt: 'sh600000', name: '合成A股', market: 'A', grade: 'B', shares: 1000, cost: 10, dps: 0.5 },
    { code: '0700.HK', qt: 'hk00700', name: '合成港股', market: 'HK', grade: 'A', shares: 100, cost: 100, dps: 2 }
  ],
  universe: [
    { code: '600000.SH', qt: 'sh600000', name: '合成A股', grade: 'B', buyPrice: 10, px: 11, dps: 0.5, tiers: [{ label: 'T0', price: 10 }, { label: 'T1', price: 8 }, { label: 'T2', price: 6 }], tierPct: [1, 2, 3] },
    { code: '0700.HK', qt: 'hk00700', name: '合成港股', grade: 'A', buyPrice: 100, px: 110, dps: 2 },
    { code: '600519.SH', qt: 'sh600519', name: '合成报价解析样本', grade: 'B', buyPrice: 1200, px: 1300, dps: 10 },
    { code: '300750.SZ', qt: 'sz300750', name: '合成特别股息样本', grade: 'A', px: 200, dps: 2.178, dpsSpecial: 4.779 }
  ],
  seats: { list: [{ key: 'sample', name: '合成席位', pct: 100, members: ['600000.SH', '0700.HK'] }] }
}
const snapshot = { savedAt: '2026-10-16T08:00:00Z', cfg: config, quotes: {
  sh600000: { price: 11, prevClose: 10, pct: 10, time: '20261016150000' }, hk00700: { price: 110, prevClose: 100, pct: 10, time: '20261016160000' },
  sh600519: { price: 1300, prevClose: 1290, pct: 0.78, time: '20261016150000' }, sz300750: { price: 200, prevClose: 200, pct: 0, time: '20261016150000' }, whHKDCNY: { price: 0.85 }
} }
module.exports = { config, snapshot, miniConfig: { MP_ENDPOINT: 'https://mp-api.app.workbuddy.host', PUB_KEY: 'wbpk_fixture_only_not_a_real_key' } }
