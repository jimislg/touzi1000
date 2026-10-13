const store = require('../../utils/store')

Page({
  data: { model: {} },
  _expanded: {},
  _filter: 'all',

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
  toggle (e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    this._expanded[code] = !this._expanded[code]
    this.render()
  },

  render () { this.setData({ model: store.watchModel(this._expanded, this._filter) }) }
})
