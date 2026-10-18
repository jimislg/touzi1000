/* 固定合成数据、独立手算期望；不访问配置、网络或数据库。 */
const assert = require('node:assert/strict')
const core = require('./public/investment-core')
let checks = 0
function eq (actual, expected, label) { assert.equal(actual, expected, label); checks++; console.log('PASS ' + label) }
function close (actual, expected, label) { assert.ok(typeof actual === 'number' && Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`); checks++; console.log('PASS ' + label) }
function ok (value, label) { assert.ok(value, label); checks++; console.log('PASS ' + label) }
function throws (options) { assert.throws(() => core.stressPortfolio({}, {}, options), RangeError); checks++; console.log('PASS 拒绝非法情景参数 ' + JSON.stringify(options)) }
const cfg = {
  investable: 1000, cash: 9999, targetCapital: 10000, hkdcnyFallback: 0.8,
  holdings: [
    { code: 'A', name: '合成A', market: 'A', qt: 'qa', shares: 10, cost: 80, dps: 4 },
    { code: 'B.HK', name: '合成港股', market: 'HK', qt: 'qb', shares: 20, cost: 80, dps: 5 }
  ],
  universe: [{ code: 'A', px: 100, dps: 4, dpsSpecial: 100 }, { code: 'B.HK', px: 100, dps: 5, dpsSpecial: 100 }],
  seats: { list: [{ pct: 40, members: ['A'] }, { pct: 40, members: ['B.HK'] }] }
}
const quotes = { qa: { price: 100 }, qb: { price: 100 }, whHKDCNY: { price: 0.8 } }
const before = JSON.stringify({ cfg, quotes })
let r = core.stressPortfolio(cfg, quotes, { priceDrop: 0.2, hkdDrop: 0.1, dividendCut: 0.25, incomeTargetCNY: 80 })
// 当前股票 A=1000、港股=1600、现金=1000；港股联合冲击28%。
close(r.baseAssets, 3600, '现金优先 investable')
close(r.baseEquity, 2600, '股票市值')
close(r.assetLoss, 648, '1000×20%+1600×28%')
close(r.stressedAssets, 2952, '现金缓冲后资产')
close(r.assetLossPct, 0.18, '总资产损失18%')
close(r.contributors[1].loss / r.contributors[1].value, 0.28, 'HK乘法冲击')
close(r.baseDividend, 100, 'A普通税后36+港股普通税后64')
close(r.stressedDividend, 70.2, '36×75%+64×75%×90%')
close(r.dividendLoss, 29.8, '股息损失')
close(r.incomeGap, 9.8, '税后收入目标缺口')
close(r.incomeCoverage, 0.8775, '税后收入覆盖率')
ok(r.valid, '完整合成数据有效')
eq(JSON.stringify({ cfg, quotes }), before, '不改输入')
const priceOnly = core.stressPortfolio(cfg, quotes, { priceDrop: 0.5 })
close(priceOnly.stressedDividend, 100, '价格下跌不自动改变普通DPS')
eq(priceOnly.incomeGap, null, '没有默认百万元收入目标')
eq(priceOnly.incomeCoverage, null, '未设目标不出覆盖率')
eq(core.stressPortfolio(cfg, quotes, { dividendCut: 1 }).stressedDividend, 0, '全减派为零')
eq(core.stressPortfolio(cfg, quotes, { incomeTargetCNY: 50 }).incomeGap, 0, '达标不产生负缺口')
r = core.stressPortfolio(cfg, quotes, { scope: 'planned', priceDrop: 0.2, hkdDrop: 0.1, dividendCut: 0.25 })
close(r.cash, 2000, '未分配20%按现金')
close(r.baseAssets, 10000, '规划目标本金')
close(r.baseEquity, 8000, '规划股票预算')
close(r.assetLoss, 1920, '4000×20%+4000×28%')
close(r.baseDividend, 304, '4000/100×4×90%+4000/(100×0.8)×5×80%×0.8')
close(r.stressedDividend, 216, '144×75%+160×75%×90%')
eq(r.plannedAllocationPct, 80, '规划权重')
ok(r.warnings.some(x => x.includes('未分配')), '未分配假设可见')
close(r.baseDividend, cfg.seats.list.reduce((sum, s) => sum + core.dividendForBudget(cfg, quotes, s.members[0], 10000 * s.pct / 100, false, false), 0), '规划股息与网页共用函数一致')
const copy = () => JSON.parse(JSON.stringify(cfg))
const zero = copy(); zero.holdings.forEach(h => { h.dps = 0 }); zero.universe.forEach(u => { u.dps = 0 })
eq(core.stressPortfolio(zero, quotes).baseDividend, 0, '已知零分红不是缺失')
ok(core.stressPortfolio(zero, quotes, { scope: 'planned' }).valid, '规划零股息仍完整')
const absent = copy(); delete absent.holdings[0].dps
r = core.stressPortfolio(absent, quotes)
eq(r.baseDividend, null, '当前持仓缺DPS不能报完整零收入')
close(r.known.baseDividend, 64, '保留已覆盖收入')
ok(r.missingDividend.includes('A'), '缺DPS清单')
const missingQuote = core.stressPortfolio(cfg, { qb: quotes.qb, whHKDCNY: quotes.whHKDCNY })
eq(missingQuote.baseAssets, null, '缺行情不呈现完整资产')
eq(missingQuote.known.baseAssets, 2600, '已覆盖资产')
close(missingQuote.baseDividend, 100, '已知股数DPS的收入独立于缺行情')
ok(missingQuote.missingQuotes.includes('A'), '缺行情清单')
const fallback = copy(); fallback.holdings[0].px = 95
r = core.stressPortfolio(fallback, { qb: quotes.qb })
close(r.baseAssets, 3550, '备用价格沿用holdingValue与quoteOf')
ok(r.warnings.some(x => x.includes('备用价格')), '备用价格警示')
ok(r.warnings.some(x => x.includes('备用汇率')), '备用汇率警示')
const empty = core.stressPortfolio({}, {})
eq(empty.baseAssets, 0, '空组合')
eq(empty.assetLossPct, 0, '零资产损失比不为NaN')
eq(empty.baseDividend, 0, '空组合已知零股息')
const cashOnly = core.stressPortfolio({ cash: 100, holdings: [] }, {}, { priceDrop: 0.95, dividendCut: 1 })
eq(cashOnly.stressedAssets, 100, '现金不承受股价压力')
const emptySeat = copy(); emptySeat.seats.list = [{ pct: 100, members: [] }]
r = core.stressPortfolio(emptySeat, {}, { scope: 'planned' })
eq(r.cash, 10000, '空席位按现金')
eq(r.baseEquity, 0, '空席位无股票')
const split = copy(); split.seats.list = [{ pct: 100, members: ['A', 'B.HK'] }]
r = core.stressPortfolio(split, quotes, { scope: 'planned' })
eq(r.contributors[0].value, 5000, '同席等分')
close(r.baseDividend, 380, '等分普通税后股息')
ok(r.warnings.some(x => x.includes('等分')), '等分警示')
for (const seats of [
  [{ pct: 100, members: ['unknown'] }],
  [{ pct: 100, members: ['A', 'A'] }],
  [{ pct: 110, members: ['A'] }]
]) {
  const broken = copy(); broken.seats.list = seats
  r = core.stressPortfolio(broken, quotes, { scope: 'planned' })
  eq(r.complete.allocation, false, '未知/重复/超配显式不完整')
  eq(r.baseAssets, null, '错误规划不能完整结论')
  ok(r.warnings.length > 0, '错误规划警示')
}
const noPlanQuote = copy(); noPlanQuote.holdings = []; delete noPlanQuote.universe[0].px
r = core.stressPortfolio(noPlanQuote, {}, { scope: 'planned' })
eq(r.baseAssets, 10000, '规划预算已知不依赖价格')
eq(r.baseDividend, null, '缺规划价格不能算完整股息')
ok(r.missingQuotes.includes('A'), '规划缺价清单')
const stale = copy(); stale.holdings[0].dpsStale = true
eq(core.stressPortfolio(stale, quotes).baseDividend, null, '过期分红需复核')
const notHeld = copy(); notHeld.holdings = []; notHeld.universe[0].qt = 'qa'
close(core.stressPortfolio(notHeld, { qa: { price: 200 } }, { scope: 'planned' }).baseDividend, 304, '未持仓规划沿用股票池px口径')
const zeroShares = copy(); zeroShares.holdings = [{ code: 'empty', shares: 0 }]
ok(core.stressPortfolio(zeroShares, {}).valid, '零持仓不要求行情及DPS')
const huge = { cash: Number.MAX_VALUE, holdings: [{ code: 'huge', market: 'A', shares: Number.MAX_VALUE, px: 1, dps: 1 }] }
r = core.stressPortfolio(huge, {})
eq(r.valid, false, '资产求和溢出显式无效')
eq(r.baseAssets, null, '溢出不输出Infinity')
const flat = core.stressPortfolio(cfg, quotes)
eq(flat.assetLoss, 0, '默认零压力')
eq(flat.scope, 'current', '默认当前实况')
for (const options of [{ scope: 'other' }, { priceDrop: -0.01 }, { priceDrop: 0.96 }, { priceDrop: NaN }, { priceDrop: '0.2' }, { hkdDrop: 1 }, { dividendCut: 1.1 }, { incomeTargetCNY: 0 }, { incomeTargetCNY: -1 }, { incomeTargetCNY: Infinity }]) throws(options)
const allFinite = obj => Object.values(obj).every(v => typeof v === 'number' ? Number.isFinite(v) : v && typeof v === 'object' ? allFinite(v) : true)
ok(allFinite(core.stressPortfolio(cfg, quotes, { priceDrop: 0.95, hkdDrop: 0.95, dividendCut: 1 })), '所有输出数值有限')
console.log(`压力情景纯计算：${checks} 项通过（固定合成数据，无网络/真实配置）`)
