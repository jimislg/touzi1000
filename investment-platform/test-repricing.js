/* Independent cash mathematics, complete scope and proposal/approval boundaries. */
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), { execFileSync } = require('child_process')
const M = require('./public/repricing/model-core'), root = path.resolve(__dirname, '..')
const base = path.join(root, 'research/20261024-all-pool-repricing'), pack = JSON.parse(fs.readFileSync(path.join(base, 'proposals.json')))
let n = 0
function check (name, ok) { assert.ok(ok, name); n++; console.log('PASS ' + name) }
const close = (a, b, tol = 1e-7) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < tol
const annuity = (amount, rate, years) => amount * (1 - Math.pow(1 + rate, -years)) / rate
const plain = { method: 'eps' }, c = { eps0: 2, g1: 0, g2: 0, payout: .5, exitPE: 10 }
const annual = M.annualRows(plain, c, 0), taxed = M.annualRows(plain, c, .2)
check('flat EPS/dividend valuation matches independent annuity plus year-ten sale', close(M.hurdlePrice(annual, .1), annuity(1, .1, 10) + 20 / Math.pow(1.1, 10)))
check('dividend tax applies to ten dividends, not the terminal equity sale', close(M.hurdlePrice(taxed, .1), annuity(.8, .1, 10) + 20 / Math.pow(1.1, 10)))
check('entry fee raises cost and exit fee only reduces final sale', close(M.hurdlePrice(taxed, .12, .003, .003), (annuity(.8, .12, 10) + 20 * .997 / Math.pow(1.12, 10)) / 1.003))
check('EPS0 grows once in year one', close(M.annualRows(plain, { ...c, g1: .1 }, 0)[0].eps, 2.2))
check('explicit first-year EPS is not grown before the first dividend', close(M.annualRows(plain, { ...c, epsYear1: 2, g1: .1 }, 0)[0].eps, 2))
check('only year ten contains terminal value', annual.slice(0, 9).every(r => r.terminal === 0) && annual[9].terminal === 20)
check('IRR is independently zero for ten equal repayments of principal', close(M.irr(10, Array(10).fill(1)), 0))
check('no future proceeds yields unknown IRR, not a fake zero return', M.irr(10, Array(10).fill(0)) === null)
const finiteModel = { method: 'finite_dcf' }, finiteCase = { annualCashPerShare: Array(10).fill(.5), residual: 0 }
check('finite concessions have only an annuity and no invented perpetuity', close(M.hurdlePrice(M.annualRows(finiteModel, finiteCase), .12), annuity(.5, .12, 10)))
assert.throws(() => M.annualRows(finiteModel, { ...finiteCase, residual: 10 }), /residual/); n++; console.log('PASS unapproved finite concession residual is rejected')
const bank = M.annualRows({ method: 'bank' }, { bps0: 10, roe: .1, payout: .4, exitPB: 1 })
check('bank capital retains only earnings less dividends', close(bank[0].bpsEnd, 10.6) && close(bank[1].eps, 1.06) && close(bank[9].bpsEnd, 10 * Math.pow(1.06, 10)))
check('bank residual-income value recomputes from capital, ROE and growth', close(M.bankResidualValue({ cases: { base: { bps0: 10 } }, crossCheck: { method: 'residual_income', cases: { base: { roe: .12, growth: .03 } } } }, 'base', .1).value, 10 * .09 / .07))
check('constant owner cash with zero growth equals an independent perpetuity', close(M.ownerValue({ cashYear1: 2, g1: 0, g2: 0, terminalGrowth: 0 }, .12).value, 2 / .12))
const negative = M.ownerValue({ annualCashPerShare: [-100, -100, -100, -100, -100, -100, -100, -100, -100, 1], terminalGrowth: 0 }, .12)
check('negative owner cash PV remains visible and terminal share becomes inapplicable', negative.rawValue < 0 && negative.value === 0 && negative.terminalShare === null)
const recovery = M.ownerValue({ annualCashPerShare: [-2, -1, 0, 1, 1, 2, 2, 2, 3, 3], terminalGrowth: 0 }, .12)
check('negative initial owner cash is discounted rather than removed', close(recovery.rawValue, [-2, -1, 0, 1, 1, 2, 2, 2, 3, 28].reduce((v, x, i) => v + x / Math.pow(1.12, i + 1), 0)))
check('full scope contains 34 issuers, 37 pool securities and one comparison', pack.issuerCount === 34 && pack.poolSecurityCount === 37 && pack.comparisonSecurityCount === 1 && pack.rows.length === 38 && new Set(pack.rows.map(r => r.id)).size === 34)
check('proposal package never grants execution or writes account data', pack.status === 'awaiting_user_confirmation' && !pack.executionApproved && !pack.accountDataTouched)
check('issued date is separate from evidence freeze and market source dates', pack.issuedOn === '2026-10-25' && pack.asOf === '2026-10-24' && pack.rows.every(r => /^20261023/.test(r.quote.time)))
for (const r of pack.rows) {
  const m = r.model, ids = new Set(m.sources.map(s => s.id))
  check(r.code + ': new estimates have three cases and source-linked normalization/change bridges', ['bear', 'base', 'bull'].every(k => m.cases[k]) && m.estimateBridge.length > 0 && m.changes.length > 0 && [...m.estimateBridge, ...m.changes].every(x => (x.sourceIds || []).every(id => ids.has(id))))
  check(r.code + ': all future assumptions remain proposals with named activation and missing evidence', !r.activated && !r.executionApproved && r.requiresUserConfirmation && m.activationConditions.length > 0 && m.missingEvidence.length > 0)
  for (const key of ['bear', 'base', 'bull']) {
    const sc = r.scenarios[key]
    check(r.code + ' ' + key + ': discounted independent flow sum reproduces quoted-price IRR', close(sc.annualFlowsSecurityCurrency.reduce((sum, cash, i) => sum + cash / Math.pow(1 + sc.irrAtSpot, i + 1), 0), r.quote.price * 1.003, 1e-5))
    check(r.code + ' ' + key + ': higher return thresholds strictly reduce price', sc.hurdlePrices.every((x, i, a) => Number.isFinite(x.price) && x.price > 0 && (!i || x.price < a[i - 1].price)))
    check(r.code + ' ' + key + ': terminal sale appears at most once', sc.annualRows.slice(0, 9).every(y => y.terminal === 0))
  }
  check(r.code + ': suggestion obeys all four price caps and rounding is downward', r.suggestions.every(s => s.conservativeProposalPrice <= s.mathematicalPrice + 1e-8 && s.conservativeProposalPrice <= r.economicRange.lower + 1e-8 && s.conservativeProposalPrice <= r.bearNoNominalLossCeiling + 1e-8 && (!r.ah || s.conservativeProposalPrice <= r.ah.maxHPriceAt25PctDiscount + 1e-8)))
  check(r.code + ': first-price downside IRR is calculated and nominal recovery guard holds', r.irrAtProposedFirstPrice.bear != null && r.irrAtProposedFirstPrice.bear >= -1e-8 && Number.isFinite(r.bearEconomicValueLossAtFirstPrice))
  check(r.code + ': missing cash, quality or valuation divergence cannot silently activate a buy', (r.economicRange.independentCashModel && Math.abs(r.crossGap || 0) <= .2 && m.quality !== '暂停新增') || r.blockers.length > 0)
  check(r.code + ': fee sensitivity reduces price monotonically', r.feesSensitivity.every((x, i, a) => !i || x.h12 < a[i - 1].h12))
}
const a = pack.rows.find(r => r.code === '600941.SH'), h = pack.rows.find(r => r.code === '0941.HK')
const catlSources = pack.rows.find(r => r.id === 'catl').model.sources
check('CATL earnings call source is the actual IR document rather than a duplicate quarterly report', catlSources.find(s=>s.id==='catl-ir').url.endsWith('/1225613436.PDF') && catlSources.find(s=>s.id==='catl-ir').url !== catlSources.find(s=>s.id==='catl-q3').url)
check('A/H shared cash value converts once; H return price reflects dividend tax', close(h.economic.base.value * pack.market.fx.cnyPerHKD, a.economic.base.value) && h.scenarios.base.hurdlePrices[1].price * pack.market.fx.cnyPerHKD < a.scenarios.base.hurdlePrices[1].price)
check('China Mobile 28% remains a conditional sensitivity below the 20% base', h.tax === .2 && h.tax28Sensitivity.h12 < h.scenarios.base.hurdlePrices[1].price && h.tax28Sensitivity.condition.includes('不是'))
check('CNOOC H uses A quote only as comparison, not an extra pool member', pack.rows.find(r => r.id === 'cnooc').ah && !pack.rows.some(r => r.code === '600938.SH'))
check('concession and property proxy remain labelled and blocked', pack.rows.filter(r => ['ninghu', 'crland'].includes(r.id)).every(r => !r.economicRange.independentCashModel && r.blockers.length > 0))
const html = fs.readFileSync(path.join(__dirname, 'public/repricing/index.html'), 'utf8')
check('all security-to-issuer detail anchors resolve', [...html.matchAll(/href="#(detail-[^"]+)"/g)].every(match => html.includes('id="' + match[1] + '"')))
check('property exit yield is displayed as percent', html.includes('6.5%') && html.includes('股息代理，非NAV'))
check('negative cash budgets do not display an absurd terminal percentage', !html.includes('10285135071') && !html.includes('489300849'))
check('confirmation export cannot become execution approval', html.includes("purpose:'研究假设与条件价格确认；不构成执行批准'") && html.includes('executionApproved:false') && !/fetch\(|XMLHttpRequest|sendBeacon|\/api\//.test(html))
const files = ['investment-platform/public/repricing/index.html', 'investment-platform/public/repricing/proposals.json', 'research/20261024-all-pool-repricing/proposals.json']
const before = files.map(f => fs.readFileSync(path.join(root, f)))
execFileSync(process.execPath, [path.join(root, 'scripts/build-all-pool-repricing.js')], { cwd: root, stdio: 'pipe' })
// V8/libm versions can differ at the final binary bit of Math.pow. Require
// identical visible prices/text and tightly equivalent numeric audit data
// across runtimes, then byte-for-byte reproducibility within one runtime.
function equivalent (a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isInteger(a) && Number.isInteger(b)) return a === b
    return Math.abs(a - b) <= 1e-11 * Math.max(1, Math.abs(a), Math.abs(b))
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b
  if (Array.isArray(a) !== Array.isArray(b) || Object.keys(a).length !== Object.keys(b).length) return false
  return Object.keys(a).every(key => Object.prototype.hasOwnProperty.call(b, key) && equivalent(a[key], b[key]))
}
const after = files.map(f => fs.readFileSync(path.join(root, f)))
check('cross-runtime model outputs preserve numeric values within machine precision', [1, 2].every(i => equivalent(JSON.parse(before[i]), JSON.parse(after[i]))))
const visible = buffer => buffer.toString('utf8').replace(/(<script id="proposal-data" type="application\/json">)[\s\S]*?(<\/script>)/, '$1$2')
check('cross-runtime investor-visible prices and report text are identical', visible(before[0]) === visible(after[0]))
execFileSync(process.execPath, [path.join(root, 'scripts/build-all-pool-repricing.js')], { cwd: root, stdio: 'pipe' })
check('repeated builds in the same runtime are byte-for-byte reproducible', files.every((f, i) => after[i].equals(fs.readFileSync(path.join(root, f)))))
console.log('All-pool repricing acceptance: ' + n + ' checks passed; no production/account/approval writes.')
