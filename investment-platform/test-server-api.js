/* 隔离执行HTTP处理器：不监听端口、不访问云库、不写正式文件。 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict')
const { EventEmitter } = require('events')
let passed = 0
function check (name, ok) { assert.ok(ok, name); passed++; console.log('PASS ' + name) }
function runtime () {
  let handler
  const state = { cfg: { accessKey: 'fixture-only', holdings: [], universe: [] }, saves: 0, missing: false }
  const context = vm.createContext({
    __dirname, Buffer, URL, console, TextDecoder, process: { env: { PORT: '18307' } }, setInterval: () => ({ unref () {} }),
    require: name => {
      if (name === 'http') return { createServer: fn => { handler = fn; return {} } }
      if (name === 'https') return {}
      if (name === 'path') return path
      if (name === 'fs') return { readFileSync: () => { if (state.missing) throw new Error('missing'); return JSON.stringify(state.cfg) } }
      if (name === './decision-preview') return require('./decision-preview')
      if (name === './public/investment-core') return require('./public/investment-core')
      if (name === './cloud-store') return {}
      if (name === './config-service') return { createConfigService: () => ({ read: async () => ({ holdings: [], universe: [] }), save: async () => { state.saves++; return { ok: true } }, retry: async () => {} }) }
      throw new Error('unavailable module')
    }
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').split('\nserver.listen(')[0], context)
  return {
    state,
    request: async ({ headers = {}, body = '{}', method = 'POST', url = '/api/config' } = {}) => {
      const req = new EventEmitter()
      Object.assign(req, { method, url, headers: { host: 'localhost:18307', cookie: 'ak=fixture-only', 'content-type': 'application/json', ...headers } })
      let done
      const result = new Promise(resolve => { done = resolve })
      const res = { status: 200, headers: {}, setHeader (k, v) { this.headers[k] = v }, writeHead (status, headers) { this.status = status; Object.assign(this.headers, headers) }, end (data) { done({ status: this.status, body: data ? JSON.parse(data) : null, headers: this.headers }) } }
      await handler(req, res)
      if (method === 'POST') { req.emit('data', Buffer.from(body)); req.emit('end') }
      return result
    }
  }
}
;(async () => {
  const rt = runtime()
  let r = await rt.request({ headers: { origin: 'https://evil.invalid' } })
  check('跨站保存被拒绝且不写配置', r.status === 403 && rt.state.saves === 0)
  r = await rt.request({ headers: { 'sec-fetch-site': 'cross-site' } })
  check('浏览器跨站来源标识被拒绝', r.status === 403)
  r = await rt.request({ headers: { 'content-type': 'text/plain' } })
  check('非JSON保存被拒绝', r.status === 415)
  r = await rt.request({ body: '{bad' })
  check('畸形JSON返回400而不是500', r.status === 400)
  r = await rt.request({ body: 'x'.repeat(256 * 1024 + 1) })
  check('超大请求在解析前被拒绝', r.status === 413 && rt.state.saves === 0)
  r = await rt.request({ headers: { cookie: 'bad=%XX; ak=fixture-only', origin: 'http://localhost:18307' } })
  check('畸形其他Cookie不导致处理器崩溃', r.status === 200 && rt.state.saves === 1)
  r = await rt.request({ headers: { cookie: 'ak=%XX' }, method: 'GET' })
  check('畸形鉴权Cookie不能绕过口令', r.status === 401)
  delete rt.state.cfg.accessKey
  r = await rt.request({ method: 'GET' })
  check('对外监听时缺少口令默认拒绝访问', r.status === 503)
  rt.state.missing = true
  r = await rt.request({ method: 'GET' })
  check('访问配置损坏时默认拒绝访问', r.status === 503)
  rt.state.missing = false; rt.state.cfg.accessKey = 'fixture-only'
  r = await rt.request({ method: 'GET' })
  check('敏感响应禁缓存并禁止Referer传播', r.headers['Cache-Control'] === 'no-store' && r.headers['Referrer-Policy'] === 'no-referrer')
  console.log('HTTP安全回归全部通过: ' + passed)
})().catch(e => { console.error(e); process.exitCode = 1 })
