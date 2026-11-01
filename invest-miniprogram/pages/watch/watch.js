const store = require('../../utils/store')

Page({
  data: { model: {} },
  _expanded: {},
  _filter: 'all',
  _bizFilter: 'all',

  onLoad () {
    this.unsub = store.onUpdate(() => this.render())
    this.render()
  },
  onUnload () { if (this.unsub) this.unsub() },
  onShow () { store.maybeReload() },
  onPullDownRefresh () { store.reload().then(() => wx.stopPullDownRefresh()) },

  setFilter (e) {
    this._filter = e.currentTarget.dataset.f || 'all'
    this.render()
  },
  setBizFilter (e) {
    // 郎刚11-01：生意分类与价格状态两套逻辑并行，叠加生效
    this._bizFilter = e.currentTarget.dataset.b || 'all'
    this.render()
  },
  toggle (e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    this._expanded[code] = !this._expanded[code]
    this.render()
  },

  render () { this.setData({ model: store.watchModel(this._expanded, this._filter, this._bizFilter) }) }
})
