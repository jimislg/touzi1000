/* 郎刚投资平台小程序：快照秒开 → 实时覆盖 */
const store = require('./utils/store')

App({
  onLaunch () {
    store.init()
  },
  /* 郎刚11-05：总览页真机白屏排查——全局错误捕获落地到 storage，首页顶部显示 */
  onError (msg) {
    try { wx.setStorageSync('lgLastError', { at: Date.now(), msg: String(msg).slice(0, 600) }) } catch (e) {}
  },
  onUnhandledRejection (res) {
    try {
      const r = res && res.reason
      wx.setStorageSync('lgLastError', { at: Date.now(), msg: ('未处理Promise拒绝: ' + ((r && (r.body || r.msg || r.message)) || JSON.stringify(r) || '未知')).slice(0, 600) })
    } catch (e) {}
  },
  onPageNotFound () {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
