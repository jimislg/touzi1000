/* 诊断：完整模拟小程序 SDK → mp-api 网关 → 云数据库链路 */
const sdk = require('./libs/workbuddy-cloud.js')

globalThis.wx = {
  request(o) {
    try {
      const u = new URL(o.url)
      const req = require('https').request(u, { method: o.method || 'GET', headers: o.header || {} }, res => {
        let b = ''
        res.on('data', c => b += c)
        res.on('end', () => { o.success && o.success({ statusCode: res.statusCode, data: b }) })
      })
      req.on('error', e => o.fail && o.fail({ errMsg: 'request:fail ' + e.message }))
      if (o.data) req.write(typeof o.data === 'string' ? o.data : JSON.stringify(o.data))
      req.end()
    } catch (e) { o.fail && o.fail({ errMsg: 'request:fail ' + e.message }) }
  },
  getStorageSync() { return null },
  setStorageSync() {},
  removeStorageSync() {}
}

const CONF = require('./utils/config')
console.log('端点:', CONF.MP_ENDPOINT)

const cloud = sdk.createMiniProgramWorkBuddyCloud({
  endpoint: CONF.MP_ENDPOINT,
  publishableKey: CONF.PUB_KEY
})
console.log('SDK创建成功, 类型:', typeof cloud.database)

const db = cloud.database
console.log('db方法:', Object.keys(db).slice(0, 10).join(', '))

;(async () => {
  const t0 = Date.now()
  try {
    const r = await db.from('app_config').select('data').eq('key', 'config').limit(1)
    console.log('✓ 读库成功 耗时', Date.now() - t0, 'ms')
    const rows = Array.isArray(r) ? r : (r.data || r.rows || [r])
    const d = rows[0]
    if (d && d.data) {
      const c = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
      console.log('  trades:', (c.trades || []).length, '/ 腾讯shares:', (c.holdings || []).find(h => h.code === '0700.HK').shares, '/ universe:', (c.universe || []).length)
    } else {
      console.log('  返回结构:', JSON.stringify(r).slice(0, 250))
    }
  } catch (e) {
    console.log('✗ 读库失败:', e.message || e)
    if (e.stack) console.log(e.stack.split('\n').slice(1, 4).join('\n'))
  }
})()
