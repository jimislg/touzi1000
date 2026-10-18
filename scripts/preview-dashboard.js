/* 仅供本地布局验收：明确标记的合成五席数据，不访问任何上游或云库。 */
const http = require('http'), fs = require('fs'), path = require('path')
const { revisionOf } = require('../investment-platform/config-service')
const root = path.resolve(__dirname, '../investment-platform/public')
const names = ['品牌样例', '平台样例', '银行样例', '保险样例', '制造样例甲', '制造样例乙', '消费样例甲', '消费样例乙', '医疗样例']
const codes = ['600519.SH', '0700.HK', '600036.SH', '601318.SH', '300750.SZ', '600660.SH', '09992.HK', '02020.HK', '300760.SZ']
const symbols = ['sh600519', 'hk00700', 'sh600036', 'sh601318', 'sz300750', 'sh600660', 'hk09992', 'hk02020', 'sz300760']
const prices = [125, 95, 25, 45, 240, 50, 110, 75, 170]
const universe = codes.map((code, i) => ({ code, qt: symbols[i], name: names[i], market: code.endsWith('.HK') ? 'HK' : 'A', grade: i % 2 ? 'A' : 'B', px: prices[i], buyPrice: prices[i] * 0.9, dps: i + 1,
  tiers: [1, 0.85, 0.7].map((multiple, j) => ({ label: ['T0·首档', 'T1·下一档', 'T2·深档'][j], price: Math.round(prices[i] * (i % 3 === 1 ? 1.08 : 0.9) * multiple * 10) / 10, cur: code.endsWith('.HK') ? 'HKD' : 'CNY' })), tierPct: [3, 6, 10], plan: '合成场景，仅用于检查信息层级；不代表投资策略。' }))
const holdings = [1, 2, 5, 6, 7].map(i => ({ ...universe[i], shares: i % 2 ? 1000 : 2000, cost: prices[i] * 0.95, dpsAsOf: '2026-10-16' }))
const cfg = { investable: 1600000, cash: 1600000, cashYield: 1, targetCapital: 2000000, pathCAGR: 0.1746, hkdcnyFallback: 0.85, annualContribution: 0, holdings, universe,
  seats: { list: [
    { key: 'brand', name: '第一·品牌现金流', pct: 30, members: [codes[0]] },
    { key: 'platform', name: '第二·平台复利', pct: 25, members: [codes[1]] },
    { key: 'fin', name: '第三·金融股息', pct: 20, members: [codes[2], codes[3]] },
    { key: 'mfg', name: '第四·先进制造', pct: 15, members: [codes[4], codes[5]] },
    { key: 'open', name: '第五·开放竞争', pct: 10, members: [codes[6], codes[7], codes[8]] }
  ] }
}
cfg._revision = revisionOf(cfg); cfg._syncStatus = 'synced'
const quotes = Object.fromEntries(symbols.map((s, i) => [s, { price: prices[i], prevClose: prices[i], pct: 0, time: '20261016160000' }]))
quotes.whHKDCNY = { price: 0.85 }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json')
    if (req.method !== 'GET') { res.writeHead(403); res.end(JSON.stringify({ ok: false, err: '演示只读，不保存数据' })); return }
    if (url.pathname === '/api/config') res.end(JSON.stringify(cfg))
    else if (url.pathname === '/api/quotes') res.end(JSON.stringify({ ok: true, quotes }))
    else res.end(JSON.stringify({ ok: true, tag: 'fixture', dividends: Object.fromEntries(holdings.map(h => [h.code, { dps: h.dps, source: '合成测试输入', asOf: '2026-10-16' }])) }))
    return
  }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  if (!['index.html', 'investment-core.js'].includes(name)) { res.writeHead(404); res.end(); return }
  let content = fs.readFileSync(path.join(root, name), 'utf8')
  if (name === 'index.html') content = content.replace('<body>', '<body><div style="padding:8px;text-align:center;background:#fff4ce;color:#6b4f00;font-size:12px">演示数据 · 不代表真实账户、行情或投资建议</div>')
  res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8')
  res.end(content)
})
server.listen(18308, '127.0.0.1', () => console.log('合成数据布局预览 http://127.0.0.1:18308/#seats'))
