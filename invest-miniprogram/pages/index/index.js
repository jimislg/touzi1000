const store = require('../../utils/store')

Page({
  data: { model: {} },
  _expanded: {},
  _filter: 'all', // 郎刚10-25晚：首页观察清单分类筛选，与原观察页同源（全部/已到参考价/接近/等待/持仓…）
  _bizFilter: 'all', // 郎刚11-01：生意分类筛选（与价格状态筛选并行叠加），与观察页同源

  onLoad () {
    this.unsub = store.onUpdate(() => this.render())
    this.render()
  },
  onUnload () { if (this.unsub) this.unsub() },
  onShow () {
    store.maybeReload()
    // 郎刚11-05：真机白屏诊断——显示app.js全局捕获的错误与当前版本号
    let lastError = null
    try { lastError = wx.getStorageSync('lgLastError') || null } catch (e) {}
    if (lastError && Date.now() - (lastError.at || 0) < 10 * 60 * 1000) {
      this._lastError = 'v1.12.25 错误: ' + lastError.msg
    } else { this._lastError = null }
    this.render()
  },
  onPullDownRefresh () { store.reload().then(() => wx.stopPullDownRefresh()) },

  // 郎刚10-25晚：首页承载观察清单，点按展开策略/逻辑（与原观察页同源 watchModel）
  toggle (e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    this._expanded[code] = !this._expanded[code]
    this.render()
  },

  // 分类筛选切换（参考原观察页呈现：按钮排+计数+提示语）
  setFilter (e) {
    const f = e.currentTarget.dataset.f
    if (!f) return
    this._filter = f
    this.render()
  },

  // 郎刚11-01：生意分类筛选切换（与价格状态筛选叠加生效）
  setBizFilter (e) {
    const b = e.currentTarget.dataset.b || 'all'
    this._bizFilter = b
    this.render()
  },

  render () {
    this.setData({
      model: Object.assign(store.indexModel(), {
        watch: store.watchModel(this._expanded, this._filter, this._bizFilter),
        lastError: this._lastError || '',
        ver: '1.12.25'
      })
    })
  }
})
