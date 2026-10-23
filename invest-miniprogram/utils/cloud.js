/* 配置数据客户端：自建服务器 HTTP 直读（2026-10-23 起）。
 * 旧链路（WorkBuddy 云 SDK → mp-api.app.workbuddy.host → 云数据库 app_config）
 * 随 WorkBuddy 云服务额度耗尽而下线；现改为直连 Vultr 服务器上的投资平台
 * /api/config（口令 Cookie 鉴权，服务端已做跨站保存防护与离线回退）。
 * 接口形态保持 supabase 风格链式调用（database.from().select().eq().limit()），
 * store.js 与回归测试无需改动。endpoint/密钥由 build.js 注入，源码不落字面量。 */
const CONF = require('./config')

function requestOnce () {
  return new Promise(resolve => {
    wx.request({
      url: CONF.MP_ENDPOINT + '/api/config',
      method: 'GET',
      header: { Cookie: 'ak=' + CONF.MP_KEY },
      timeout: 20000,
      success: r => {
        const ok = r.statusCode >= 200 && r.statusCode < 300
        const body = r.data
        const valid = ok && body && typeof body === 'object' && !Array.isArray(body) &&
          Array.isArray(body.holdings) && Array.isArray(body.universe)
        if (valid) { resolve({ data: [{ data: body }], status: r.statusCode }); return }
        const detail = typeof body === 'string' ? body.slice(0, 200) : (body && (body.err || body.message)) || '服务端返回结构异常'
        resolve({ error: { message: 'HTTP ' + r.statusCode + ' ' + detail }, status: r.statusCode })
      },
      fail: e => resolve({ error: { message: (e && e.errMsg) || 'request:fail' }, status: 0 })
    })
  })
}

function chain () {
  const q = { then (onFul, onRej) { return requestOnce().then(onFul, onRej) } }
  ;['eq', 'limit', 'retry', 'select', 'from'].forEach(m => { q[m] = () => q })
  return q
}

module.exports = {
  database: { from: () => chain() }
}
