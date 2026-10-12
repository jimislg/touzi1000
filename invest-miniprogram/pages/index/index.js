const store = require('../../utils/store')

Page({
  data: { model: {} },

  onLoad () {
    this.unsub = store.onUpdate(() => this.render())
    this.render()
  },
  onUnload () { if (this.unsub) this.unsub() },
  onShow () { store.maybeReload() },
  onPullDownRefresh () { store.reload().then(() => wx.stopPullDownRefresh()) },

  render () { this.setData({ model: store.indexModel() }) }
})
