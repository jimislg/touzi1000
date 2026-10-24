#!/usr/bin/env node
/* Read-only website evidence reconciliation. Never infer a verified cash ledger from holdings. */
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const normalizeCode = code => String(code || '').replace(/^(\d+)\.HK$/, (_, n) => n.padStart(5, '0') + '.HK')
function reconcile (cfg, opening) {
  const trades = cfg.trades || [], groups = new Map()
  for (const [index, t] of trades.entries()) {
    const key = JSON.stringify([normalizeCode(t.code), t.date, t.time || '', t.shares, t.price, t.amtCNY])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(index + 1)
  }
  const byCode = new Map((opening.holdings || []).map(h => [normalizeCode(h.symbol), h]))
  const rows = (cfg.holdings || []).map(h => {
    const o = byCode.get(normalizeCode(h.code))
    const activity = trades.filter(t => normalizeCode(t.code) === normalizeCode(h.code))
    let unknownDirection = 0
    const net = activity.reduce((s, t) => {
      const side = String(t.side || t.direction || '').toLowerCase()
      if (['sell', '卖出'].includes(side)) return s - t.shares
      if (!['buy', '买入'].includes(side)) unknownDirection++
      return s + t.shares // legacy website labels these positive rows as buys; conditional only
    }, 0)
    const expected = o ? o.quantity + net : null
    const nativeGross = o && Number.isFinite(o.costPrice) && activity.every(t => Number.isFinite(t.price)) ? o.quantity * o.costPrice + activity.reduce((s,t) => s + (String(t.side || t.direction || '').toLowerCase() === 'sell' ? -1 : 1) * t.price * t.shares, 0) : null
    return { code: h.code, name: h.name, openingShares: o ? o.quantity : null, registeredNetBuys: net, currentShares: h.shares, expectedShares: expected, difference: expected == null ? null : h.shares - expected, inferredBuyRows: unknownDirection,
      nativeCostBridge: { openingPlusTradeGross: nativeGross, currentRecordedCost: Number.isFinite(h.cost) ? h.cost * h.shares : null, unexplainedDifferenceBeforeFees: nativeGross != null && Number.isFinite(h.cost) ? h.cost * h.shares - nativeGross : null, basis: '按期初原币成本加成交毛额；未补交易费用、股息成本调整、卖出成本法或其他公司行动。不是券商成本核验。' },
      cnyCostVerified: h.market !== 'HK' ? null : h.costBasisStatus === 'verified' && Number.isInteger(h.settledCostCNYFen),
      basis: '期初快照 + 网站正股数按买入解释；用户确认全部交易已登记；未独立核券商流水或公司行动' }
  })
  const heldCodes = new Set(rows.map(r => normalizeCode(r.code)))
  return { asOf: '2026-10-24', sourceRevision: cfg._revision || null,
    userAttestation: { date: '2026-10-24', statement: '用户确认所有交易均在网站体现', scope: '网站交易录入完整性；非券商独立核验' },
    openingDate: opening.snapshotDate, openingSource: opening.source, tradeCount: trades.length, holdingCount: rows.length, matchedHoldings: rows.filter(r => r.difference === 0).length,
    duplicateCandidates: [...groups.values()].filter(g => g.length > 1),
    missingStructuredSide: trades.filter(t => !t.side && !t.direction).length,
    missingBrokerTradeId: trades.filter(t => !t.brokerTradeId).length,
    orphanTradeCodes: [...new Set(trades.filter(t => !heldCodes.has(normalizeCode(t.code))).map(t => t.code))],
    rows, verifiedCashLedger: false,
    conclusions: [
      '全部登记交易按买入解释，期初股数加登记交易与当前持仓股数一致时，只能确认股数算术勾稽。',
      '字段完全相同的记录仅为重复候选；须保留，不能凭相似删除。删除其中一条会改变现有股数勾稽结果。',
      '现价汇率、交易所参考结算率与券商实际人民币扣款不同；历史人民币成本不自动补成已核。',
      '出入金、现金余额、税费和股息到账未由股数核对证明；不生成虚构现金账或审批。'
    ] }
}
module.exports = { reconcile, normalizeCode }
if (require.main === module) {
  const args = process.argv.slice(2)
  assert.equal(args.length, 3, 'Usage: node reconcile-research-account.js <website-json> <opening-json> <private-output-json>')
  const output = path.resolve(args[2])
  assert.ok(output.split(path.sep).includes('private'), 'Account evidence output must stay in an ignored private directory')
  const result = reconcile(JSON.parse(fs.readFileSync(args[0])), JSON.parse(fs.readFileSync(args[1])))
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 })
  fs.writeFileSync(output, JSON.stringify(result, null, 2), { mode: 0o600 })
  console.log('Account share reconciliation: ' + result.matchedHoldings + '/' + result.holdingCount + ' matched; ' + result.tradeCount + ' rows; private output only. Cash ledger remains unverified.')
}
