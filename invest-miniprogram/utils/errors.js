/* SDK 的 error 信封也可能来自本机网络失败，不能据此判定请求已到达数据库。 */
function clean (value) {
  return String(value == null ? '' : value)
    .replace(/wbpk_[A-Za-z0-9_-]+/g, '[已隐藏]')
    .replace(/Bearer\s+[^\s"',]+/gi, 'Bearer [已隐藏]')
    .replace(/((?:access_token|refresh_token|accessKey|token|ak)=)[^&\s]+/gi, '$1[已隐藏]')
}

function databaseError (result) {
  const e = result.error || {}
  const message = clean(e.message || e.errMsg || '未知错误')
  const status = result.status || e.status || 0
  let type = 'db'
  if (/url not in domain list|不在.*合法域名/i.test(message)) type = 'domain'
  else if (e.kind === 'network' || /wx\.request failed|request:fail/i.test(message)) type = 'network'
  return {
    type, status,
    body: [e.kind && clean(e.kind), e.code && clean(e.code), message, e.hint && clean(e.hint)].filter(Boolean).join(' · ')
  }
}

module.exports = { databaseError, clean }
