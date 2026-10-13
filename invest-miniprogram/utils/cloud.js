/* 云数据库客户端：WorkBuddy 官方小程序 SDK → 共享固定网关 mp-api.app.workbuddy.host
 * （publishableKey 鉴权，不拦 MicroMessenger UA），直读投资平台应用的 app_config 表。
 * publishableKey 为公开密钥（设计上嵌入前端），无泄密风险；endpoint/密钥由 build.js 从
 * investment-platform/publicConfig.json 注入，源码不落字面量。 */
const CONF = require('./config')
let cloud = null
try {
  const sdk = require('../libs/workbuddy-cloud.js')
  cloud = sdk.createMiniProgramWorkBuddyCloud({
    endpoint: CONF.MP_ENDPOINT,
    publishableKey: CONF.PUB_KEY
  })
} catch (e) { cloud = null }
module.exports = cloud
