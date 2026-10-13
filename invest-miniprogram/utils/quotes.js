/* 行情直拉：腾讯行情源 qt.gtimg.cn（与投资平台 server.js 同一数据源、同一解析口径）。
 * 平台 WAF 拦 MicroMessenger UA（403），故行情不经平台 API，由小程序直连行情源。
 * gtimg 返回 GBK：小程序无 TextDecoder('gbk')，按 latin1 逐字节解码——
 * 数字字段全为 ASCII 不受影响，中文名字段弃用（名称以 config 为准）。 */
const GTIMG = 'https://qt.gtimg.cn/q='

/* 与 server.js parseQuotes 完全同源 */
function parseQuotes (text) {
  const out = {}
  const re = /v_([A-Za-z0-9_]+)="([^"]*)"/g
  let m
  while ((m = re.exec(text))) {
    const f = m[2].split('~')
    let price = parseFloat(f[3])
    if (!isFinite(price) || price <= 0) {
      for (let i = 3; i < 12; i++) { const v = parseFloat(f[i]); if (isFinite(v) && v > 0 && v < 10) { price = v; break } }
    }
    out[m[1]] = {
      name: '',
      price: (isFinite(price) && price > 0) ? price : null,
      prevClose: parseFloat(f[4]) || null,
      pct: (f[32] !== undefined && f[32] !== '' && isFinite(parseFloat(f[32]))) ? parseFloat(f[32]) : null,
      time: (f[30] || '').slice(0, 14)
    }
  }
  return out
}

function latin1 (buf) {
  const u8 = (buf && buf.byteLength != null) ? new Uint8Array(buf) : null
  if (!u8) return ''
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return s
}

function fetchQuotes (symbols) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: GTIMG + encodeURIComponent(symbols),
      responseType: 'arraybuffer',
      timeout: 15000,
      success (r) {
        if (r.statusCode !== 200) return reject({ type: 'qhttp', status: r.statusCode })
        const q = parseQuotes(latin1(r.data))
        if (!Object.keys(q).length) return reject({ type: 'quotes', body: latin1(r.data).slice(0, 60) })
        resolve(q)
      },
      fail (e) { reject({ type: 'network', msg: (e && e.errMsg) || '' }) }
    })
  })
}

module.exports = { fetchQuotes, parseQuotes, GTIMG }
