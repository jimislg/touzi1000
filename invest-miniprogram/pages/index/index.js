const store = require('../../utils/store')

Page({
  data: { model: {} },
  _expanded: {},

  onLoad () {
    this.unsub = store.onUpdate(() => this.render())
    this.render()
  },
  onUnload () { if (this.unsub) this.unsub() },
  onShow () { store.maybeReload() },
  onPullDownRefresh () { store.reload().then(() => wx.stopPullDownRefresh()) },

  // 郎刚10-25晚：首页承载观察清单，点按展开策略/逻辑（与原观察页同源 watchModel）
  toggle (e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    this._expanded[code] = !this._expanded[code]
    this.render()
  },

  render () {
    this.setData({
      model: Object.assign(store.indexModel(), { watch: store.watchModel(this._expanded, 'all') })
    })
  }
})
