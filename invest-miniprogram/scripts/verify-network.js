/* 用真实 SDK 在无浏览器全局对象的隔离环境复现手机网络失败；--live 只读连通线上。 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const assert = require('assert/strict')
const ROOT = path.join(__dirname, '..')
let passed = 0
function check (name, ok) { assert.ok(ok, name); passed++; console.log('PASS ' + name) }

function runtime (request) {
  const storage = new Map()
  const context = vm.createContext({
    console, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimeout,
    wx: {
      request,
      getStorageSync: k => storage.get(k),
      setStorageSync: (k, v) => storage.set(k, v),
      removeStorageSync: k => storage.delete(k)
    }
  })
  const cache = new Map()
  function load (file) {
    if (!path.extname(file)) file += '.js'
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }
    cache.set(file, mod)
    const fn = vm.runInContext('(function(require,module,exports){' + fs.readFileSync(file, 'utf8') + '\n})', context, { filename: file })
    fn(p => load(path.resolve(path.dirname(file), p)), mod, mod.exports)
    return mod.exports
  }
  return { load: p => load(path.join(ROOT, p)), context }
}

function respond (o, statusCode, data) {
  o.success({ statusCode, data, header: { 'content-type': 'application/json' } })
}
function quoteBuffer (symbols, mode) {
  const list = symbols.split(',')
  if (mode === 'partial') list.pop()
  const text = list.map((symbol, i) => {
    const price = symbol === 'whHKDCNY' ? '0.8542' : symbol === 'sh600519' ? '1300' : '50'
    const f = ['1', 'test', symbol, mode === 'invalid' && i === 0 ? '0' : price, '5']
    f[30] = '20261014090000'; f[32] = '0.78'
    return 'v_' + symbol + '="' + f.join('~') + '";'
  }).join('')
  return Uint8Array.from(Buffer.from(text)).buffer
}

;(async () => {
  const original = runtime(o => { o.fail({ errMsg: 'request:fail url not in domain list' }); return { abort () {} } })
  check('测试环境不借用 Node 的 URL / Headers / fetch', vm.runInContext('typeof URL === "undefined" && typeof Headers === "undefined" && typeof fetch === "undefined"', original.context))
  const envelope = await original.load('utils/cloud').database.from('app_config').select('data').limit(1).retry(false)
  check('真实SDK把本机域名拒绝包装为error且status=0', envelope.error && envelope.status === 0 && /url not in domain list/.test(envelope.error.message))
  const store = original.load('utils/store')
  await store.reload()
  check('完整保留域名错误并正确分类', store.state.error.type === 'domain' && /url not in domain list/.test(store.state.error.body))
  check('域名提示包含两个正确的域名且不包含行情路径', store.indexModel().errorMsg.includes('https://qt.gtimg.cn 加入') && store.indexModel().errorMsg.includes('https://mp-api.app.workbuddy.host'))
  check('失败仍显示快照', store.state.source === 'snapshot' && !store.state.loading)
  check('总览与持仓浮盈百分比一致', store.indexModel().plPct + '%' === store.positionsModel().plPct)

  for (const [message, kind] of [['request:fail timeout', 'network'], ['request:fail ssl hand shake error', 'network']]) {
    const rt = runtime(o => { o.fail({ errMsg: message }); return { abort () {} } })
    const s = rt.load('utils/store'); await s.reload()
    check(message + '不再误报数据库错误', s.state.error.type === kind && s.state.error.body.includes(message))
  }
  for (const status of [401, 403, 503]) {
    const rt = runtime(o => { respond(o, status, { message: 'gateway denied', code: 'test-code' }); return { abort () {} } })
    const s = rt.load('utils/store'); await s.reload()
    check('HTTP ' + status + '保留服务端状态', s.state.error.type === 'db' && s.state.error.status === status && s.indexModel().errorMsg.includes('HTTP ' + status))
  }

  let phase = 'quotes-fail', dbCalls = 0, nextCFG, keyedRead = false
  const rt = runtime(o => {
    queueMicrotask(() => {
      if (o.url.includes('qt.gtimg.cn')) {
        if (phase === 'quotes-fail') o.fail({ errMsg: 'request:fail timeout' })
        else respond(o, 200, quoteBuffer(decodeURIComponent(o.url.split('/q=')[1]), phase))
      } else {
        dbCalls++
        keyedRead = o.url.includes('key=eq.config')
        if (phase === 'db-fail') o.fail({ errMsg: 'request:fail timeout' })
        else respond(o, 200, [{ data: nextCFG }])
      }
    })
    return { abort () {} }
  })
  const s = rt.load('utils/store'), oldCFG = s.state.CFG, oldQ = s.state.Q
  nextCFG = JSON.parse(JSON.stringify(oldCFG)); nextCFG.cash = 123
  await s.reload()
  check('行情失败不混用新配置与旧行情', s.state.CFG === oldCFG && s.state.Q === oldQ && s.state.source === 'snapshot')
  for (const mode of ['partial', 'invalid']) {
    phase = mode; await s.reload()
    check(mode + '行情不能冒充实时且保留完整快照', s.state.source === 'snapshot' && s.state.CFG === oldCFG && s.state.Q === oldQ && s.state.error.type === 'quotes')
  }
  phase = 'ok'; dbCalls = 0
  const a = s.reload(), b = s.reload()
  check('同时刷新共用一次请求', a === b)
  await a
  check('两条链路成功才进入实时状态', s.state.source === 'live' && s.state.error === null && dbCalls === 1 && s.state.Q.sh600519.price === 1300)
  check('云配置按key=config读取，避免任意首行', keyedRead)
  const liveCFG = s.state.CFG, liveQ = s.state.Q, fetchedAt = s.state.lastFetch
  phase = 'partial'; await s.reload()
  check('曾成功后遇到部分行情保留上次完整配置与行情及成功时间', s.state.source === 'stale' && s.state.CFG === liveCFG && s.state.Q === liveQ && s.state.lastFetch === fetchedAt)
  phase = 'db-fail'; await s.reload()
  check('实时刷新失败标记为上次成功数据', s.state.source === 'stale' && s.state.lastFetch === fetchedAt && s.state.CFG === liveCFG && s.state.Q === liveQ && s.indexModel().statusText.includes('刷新失败'))
  phase = 'ok'; await s.reload()
  check('网络恢复后清除错误并恢复实时状态', s.state.source === 'live' && !s.state.error)
  const errors = rt.load('utils/errors')
  check('错误诊断遮蔽密钥与token', !errors.clean('wbpk_secret Bearer secret access_token=secret').includes('secret'))

  if (process.argv.includes('--live')) {
    let calls = 0
    const live = runtime(o => {
      calls++
      const headers = Object.assign({}, o.header, { 'User-Agent': 'Mozilla/5.0 MicroMessenger/8.0.64', Referer: 'https://servicewechat.com/wx0cdb62df524d010e/1.2.0/page-frame.html' })
      fetch(o.url, { method: o.method || 'GET', headers, signal: AbortSignal.timeout(20000) })
        .then(async r => o.success({ statusCode: r.status, header: Object.fromEntries(r.headers), data: o.responseType === 'arraybuffer' ? await r.arrayBuffer() : await r.text() }))
        .catch(e => o.fail({ errMsg: 'request:fail ' + e.message }))
      return { abort () {} }
    })
    const s = live.load('utils/store'); await s.reload()
    check('线上只读链路成功（模拟微信UA/Referer，非真机）', s.state.source === 'live' && !s.state.error)
    console.log('线上请求数:', calls, '持仓:', s.state.CFG.holdings.length, '观察池:', s.state.CFG.universe.length, '行情:', Object.keys(s.state.Q).length)
  }
  console.log('网络回归全部通过:', passed)
})().catch(e => { console.error(e.message); process.exitCode = 1 })
