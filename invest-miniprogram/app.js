/* 郎刚投资平台小程序：快照秒开 → 实时覆盖 */
const store = require('./utils/store')

App({
  onLaunch () {
    store.init()
  }
})
