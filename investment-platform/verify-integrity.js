/* 离线真实服务处理器回归：HTTP/云库/磁盘均为桩，不监听端口、不写个人配置。 */
const fs = require('fs'), path = require('path'), vm = require('vm')
const { EventEmitter } = require('events')
const assert = require('assert/strict')
const CORE = require('./public/investment-core')
let passed = 0
function check (name, ok) { assert.ok(ok, name); passed++; console.log('PASS ' + name) }
function rawQuote (symbol, price, prev = '5') {
  const f = ['1', 'sample', symbol, price, prev]
  f[30] = '20261016150000'; f[32] = '0'
  return 'v_' + symbol + '="' + f.join('~') + '";'
}

function runtime () {
  let handler
  const state = { status: 200, quote: rawQuote('sh600000', '10'), dividend: { result: { data: [] } }, requests: 0, writes: 0 }
  const config = { hkdcnyFallback: 0.85, holdings: [{ code: '600000.SH', market: 'A' }] }
  function remote (kind, args) {
    state.requests++
    const response = new EventEmitter()
    response.statusCode = state.status
    response.resume = () => {}
    const request = new EventEmitter()
    request.setTimeout = () => request
    request.destroy = e => request.emit('error', e)
    queueMicrotask(() => {
      args[args.length - 1](response)
      response.emit('data', Buffer.from(kind === 'quotes' ? state.quote : JSON.stringify(state.dividend)))
      response.emit('end')
    })
    return request
  }
  const context = vm.createContext({
    __dirname, Buffer, TextDecoder, URL, console, setTimeout, clearTimeout, setInterval: () => ({ unref () {} }),
    process: { env: {} },
    require: name => {
      if (name === 'http') return { createServer: fn => { handler = fn; return {} }, get: (...args) => remote('quotes', args) }
      if (name === 'https') return { get: (...args) => remote('dividend', args) }
      if (name === 'fs') return { readFileSync: () => JSON.stringify(config), appendFileSync: () => { state.writes++ } }
      if (name === 'path') return path
      if (name === './config-service') return require('./config-service')
      if (name === './decision-preview') return require('./decision-preview')
      if (name === './public/investment-core') return CORE
      if (name === './cloud-store') return { read: () => { throw new Error('本测试不允许访问云库') }, write: () => { throw new Error('本测试不允许写云库') } }
      throw new Error('未允许依赖 ' + name)
    }
  })
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').split('\nserver.listen(')[0]
  vm.runInContext(source, context)
  return {
    state, config,
    dividends: () => vm.runInContext('fetchDividends()', context),
    api: async url => {
      let status, data
      await handler({ url, headers: {}, method: 'GET' }, { writeHead: s => { status = s }, end: body => { data = JSON.parse(body) } })
      return { status, data }
    }
  }
}

;(async () => {
  const q = CORE.parseQuotes(rawQuote('sh600000', '0') + rawQuote('hk00700', 'NaN') + rawQuote('whHKDCNY', '', '0.85'))
  check('股票现价为零或缺失时不挪用昨收', q.sh600000.price === null && q.hk00700.price === null)
  check('外汇仍支持特殊字段回退', q.whHKDCNY.price === 0.85)
  check('0%涨跌幅不会被转成缺失', q.sh600000.pct === 0)
  check('非法数值后缀不能被当成现价', CORE.parseQuotes(rawQuote('sh600000', '12bad')).sh600000.price === null)
  const tiers = [{ price: 100 }, { price: 80 }, { price: 60 }]
  check('档位未触发时最近档为第一档', CORE.ladderState(tiers, 110).next === tiers[0])
  check('仅到第一档时下一档仍存在', CORE.ladderState(tiers, 90).next === tiers[1])
  check('边界等于档位算到档', CORE.ladderState(tiers, 80).deepIndex === 1)
  check('到最深档才不再显示下一档', CORE.ladderState(tiers, 60).next === null)
  check('仓位空间pct转金额正确', CORE.positionRoom(17, 20, 10000000) === 300000)

  const h = { dps: 5.3, dpsAsOf: '2026-10-01' }
  for (const d of [null, {}, { dps: null }, { dps: 0, err: 'timeout' }, { dps: 0, tag: 'stale' }, { dps: '' }, { dps: 'bad' }]) {
    CORE.applyDivUpdate(h, d)
    check('分红失败或陈旧不清零或改写成功日期 ' + JSON.stringify(d), h.dps === 5.3 && h.dpsStale && h.dpsAsOf === '2026-10-01')
  }
  CORE.applyDivUpdate(h, { dps: 0, source: '有效空列表', asOf: '2026-10-16' })
  check('有效零分红可覆盖旧正值且不冒充停派公告', h.dps === 0 && !h.dpsStale && !h.dpsSource.includes('已确认停派'))
  h.dpsManual = true; h.dps = 3
  CORE.applyDivUpdate(h, { dps: 0 })
  check('手工DPS不受自动更新覆盖', h.dps === 3)

  const rt = runtime()
  let result = await rt.api('/api/quotes?symbols=sh600000,whHKDCNY')
  check('服务端部分行情返回ok=false及缺失代码', !result.data.ok && result.data.missing[0] === 'whHKDCNY')
  rt.state.quote += rawQuote('whHKDCNY', '0.85')
  result = await rt.api('/api/quotes?symbols=sh600000,whHKDCNY')
  check('服务端完整行情才能ok=true', result.data.ok && result.data.missing.length === 0)
  const calls = rt.state.requests
  result = await rt.api('/api/quotes?symbols=sh600000%26other=1')
  check('异常行情代码在请求上游之前拒绝', result.status === 400 && rt.state.requests === calls)
  rt.state.status = 503
  result = await rt.api('/api/quotes?symbols=sh600000')
  check('上游HTTP失败不作为成功行情', result.status === 500 && !result.data.ok)
  let div = (await rt.dividends()).dividends['600000.SH']
  check('分红上游HTTP失败返回null并附错误', div.dps === null && !!div.err)
  rt.state.status = 200
  for (const envelope of [{ success: false }, {}, { result: { data: null } }]) {
    rt.state.dividend = envelope
    div = (await rt.dividends()).dividends['600000.SH']
    check('分红异常结构不能误报为零 ' + JSON.stringify(envelope), div.dps === null && !!div.err)
  }
  rt.state.dividend = { result: { data: [] } }
  div = (await rt.dividends()).dividends['600000.SH']
  check('合法空列表才能确认近12月零分红', div.dps === 0 && !div.err)
  const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10) + ' 00:00:00'
  rt.state.dividend.result.data = [{ EX_DIVIDEND_DATE: date, PRETAX_BONUS_RMB: 20, ASSIGN_PROGRESS: '实施分配' }]
  div = (await rt.dividends()).dividends['600000.SH']
  check('A股每10股20元换算每股2元', div.dps === 2)
  rt.state.dividend.result.data[0].PRETAX_BONUS_RMB = null
  div = (await rt.dividends()).dividends['600000.SH']
  check('缺失分红金额不冒充零分红', div.dps === null && !!div.err)
  rt.config.holdings[0] = { code: '0700.HK', market: 'HK' }
  rt.state.dividend.result.data = [{ EX_DIVIDEND_DATE: date, PLAN_EXPLAIN: '无法识别的币种' }]
  div = (await rt.dividends()).dividends['0700.HK']
  check('无法解析港股金额时保留旧值', div.dps === null && !!div.err)
  rt.state.dividend.result.data[0].PLAN_EXPLAIN = '每股派港币5.3'
  div = (await rt.dividends()).dividends['0700.HK']
  check('港股DPS保持港币口径', div.dps === 5.3)
  rt.state.dividend.result.data[0].EX_DIVIDEND_DATE = new Date(Date.now() + 30 * 86400000).toISOString()
  div = (await rt.dividends()).dividends['0700.HK']
  check('未来除息不计入已实施分红', div.dps === 0)
  check('回归测试未写本地文件', rt.state.writes === 0)
  console.log('数据完整性回归全部通过: ' + passed)
})().catch(e => { console.error(e); process.exitCode = 1 })
