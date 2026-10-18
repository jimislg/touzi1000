/* 行情直拉：腾讯行情源 qt.gtimg.cn（与投资平台 server.js 同一数据源、同一解析口径）。
 * 平台 WAF 拦 MicroMessenger UA（403），故行情不经平台 API，由小程序直连行情源。
 * gtimg 返回 GBK：小程序无 TextDecoder('gbk')，按 latin1 逐字节解码——
 * 数字字段全为 ASCII 不受影响，中文名字段弃用（名称以 config 为准）。 */
const GTIMG = 'https://qt.gtimg.cn/q='

/* 与服务端共用解析器；中文名称以配置为准。 */
const CORE = require('./investment-core')
function parseQuotes (text) {
  const quotes = CORE.parseQuotes(text)
  Object.keys(quotes).forEach(s => { quotes[s].name = '' })
  return quotes
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
        const missing = CORE.missingSymbols(q, symbols)
        if (missing.length) return reject({ type: 'quotes', body: '行情不完整或现价无效：' + missing.join(', ') })
        resolve(q)
      },
      fail (e) { reject({ type: 'network', msg: (e && e.errMsg) || '' }) }
    })
  })
}

module.exports = { fetchQuotes, parseQuotes, GTIMG }
