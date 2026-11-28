/* 诊断：按小程序生产链路（utils/cloud.js 同款）实测 /api/config
 * 2026-11-28 重写：旧版走已下线的 mp-api SDK 路径，且固定用 https 模块请求 http 端点必然失败，
 * 无法反映真实状态。现直接复现 wx.request：GET {MP_ENDPOINT}/api/config + Cookie ak。
 * 用法：node diag-mp-cloud.js
 */
const CONF = require('./utils/config')

const https = require('https')
const http = require('http')

function get (url, headers) {
  return new Promise(resolve => {
    let u
    try { u = new URL(url) } catch (e) { resolve({ status: 0, err: 'URL 非法: ' + e.message }); return }
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(u, { method: 'GET', headers: headers || {} }, res => {
      let b = ''
      res.on('data', c => { b += c })
      res.on('end', () => resolve({ status: res.statusCode, body: b, proto: u.protocol }))
    })
    req.setTimeout(20000, () => { req.destroy(new Error('timeout 20s')) })
    req.on('error', e => resolve({ status: 0, err: e.message, proto: u.protocol }))
    req.end()
  })
}

;(async () => {
  console.log('端点:', CONF.MP_ENDPOINT)
  console.log('协议:', new URL(CONF.MP_ENDPOINT).protocol, '（微信真机仅在「开发调试」模式下允许 http）')
  console.log('口令前缀:', String(CONF.MP_KEY).slice(0, 2) + '***')

  const t0 = Date.now()
  const r = await get(CONF.MP_ENDPOINT + '/api/config', { Cookie: 'ak=' + CONF.MP_KEY })
  const ms = Date.now() - t0

  if (!r.status) { console.log('✗ 网络失败:', r.err, `(${ms}ms)`); process.exit(1) }
  if (r.status === 401) { console.log('✗ 鉴权失败 401：口令与服务端 accessKey 不一致'); process.exit(2) }
  if (r.status === 302) { console.log('✗ 被重定向 302：说明请求未带 Cookie，走了 ?key= 跳转'); process.exit(3) }
  if (r.status !== 200) { console.log('✗ HTTP', r.status, String(r.body || '').slice(0, 160)); process.exit(4) }

  let d
  try { d = JSON.parse(r.body) } catch (e) {
    console.log('✗ 返回非 JSON（多为门禁 HTML）:', String(r.body || '').slice(0, 160)); process.exit(5)
  }
  const okShape = d && Array.isArray(d.holdings) && Array.isArray(d.universe)
  console.log(okShape ? '✓ 链路正常' : '✗ 结构异常', `耗时 ${ms}ms`)
  if (!okShape) { console.log('返回键:', Object.keys(d || {}).slice(0, 10)); process.exit(6) }
  console.log('  持仓', d.holdings.length, '只 | 观察池', d.universe.length, '只 | 交易', (d.trades || []).length, '笔')
  console.log('  现金', d.cash, '| 快照', d.asOfNote || '(无)')
  const cd = (d.universe || []).find(u => u.code === '000848.SZ')
  if (cd) console.log('  承德露露: bp', cd.buyPrice, '档位', (cd.tiers || []).map(t => t.price).join('/'))
})()
