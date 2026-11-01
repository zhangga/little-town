const api = require('../../../utils/api')
const { withTapSounds } = require('../../../utils/sound-page')
const { showError } = require('../../../utils/util')
const { saveWallet } = require('../../../utils/resident')
const { categories, presentFurniture } = require('../../utils/home-room')

Page(withTapSounds({
  data: { loading: true, failed: false, busy: false, state: null, categories, category: 'all', items: [], ownedCount: 0, selected: null, message: '' },
  onLoad() { if (!wx.getStorageSync('token')) wx.redirectTo({ url: '/pages/login/login' }) },
  onShow() { if (wx.getStorageSync('token')) this.loadMall() },
  onUnload() { this._disposed = true },
  onPullDownRefresh() { return this.loadMall().finally(() => wx.stopPullDownRefresh()) },
  applyState(state) {
    if (this._disposed) return
    const furniture = presentFurniture(state.furniture, state.wallet, state.room ? state.room.layout : [])
    const selected = this.data.selected && furniture.find(item => item.id === this.data.selected.id)
    this.setData({ state, furniture, loading: false, failed: !Array.isArray(state.furniture), items: furniture.filter(item => this.data.category === 'all' || item.category === this.data.category), ownedCount: furniture.filter(item => item.owned).length, selected: selected || null })
    saveWallet(state.wallet)
  },
  loadMall() {
    if (this._loadPromise) return this._loadPromise
    if (this.data.busy) return Promise.resolve()
    this.setData({ loading: !this.data.state, failed: false })
    this._loadPromise = api.get('/resident').then(state => this.applyState(state)).catch(err => {
      if (!this._disposed) { this.setData({ loading: false, failed: !this.data.state }); showError(err.message || '商场暂时没连上') }
    }).finally(() => { this._loadPromise = null })
    return this._loadPromise
  },
  onCategory(e) {
    const category = e.currentTarget.dataset.id
    if (!categories.some(item => item.id === category)) return
    this.setData({ category, items: this.data.furniture.filter(item => category === 'all' || item.category === category) })
  },
  onSelectFurniture(e) {
    if (this.data.busy) return
    const selected = this.data.furniture.find(item => item.id === e.currentTarget.dataset.id)
    if (selected) this.setData({ selected, message: '' })
  },
  onCloseFurniture() { if (!this.data.busy) this.setData({ selected: null }) },
  onNoop() {},
  async onBuyFurniture() {
    const item = this.data.selected
    if (!item || this.data.busy || this._loadPromise) return
    if (item.owned) { this.onGoHome(); return }
    if (!this.data.state.mall_available) { this.onBuildMall(); return }
    if (!item.affordable) { wx.switchTab({ url: '/pages/learn/learn' }); return }
    this.setData({ busy: true })
    try {
      const state = await api.post('/resident/purchase', { item_id: item.id })
      if (this._disposed) return
      this.applyState(state)
      this.setData({ message: '买好啦！已经放进你的家中背包。' })
    } catch (err) {
      if (this._disposed) return
      let recovered = false
      try {
        const state = await api.get('/resident')
        if (this._disposed) return
        this.applyState(state)
        recovered = (state.furniture || []).some(row => row.id === item.id && row.owned)
      } catch (_) {}
      if (!this._disposed) {
        if (recovered) this.setData({ message: '购买已经确认，家具在你的家中背包里。' })
        else showError(err.message || '购买尚未确认，稍后再看看')
      }
    } finally { if (!this._disposed) this.setData({ busy: false }) }
  },
  onGoHome() {
    if (this.data.busy) return
    wx.setStorageSync('homeRoomRequested', this.data.selected && this.data.selected.owned ? this.data.selected.id : true)
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1 && pages[pages.length - 2].route === 'home/pages/room/room') wx.navigateBack()
    else wx.redirectTo({ url: '/home/pages/room/room' })
  },
  onBuildMall() { if (!this.data.busy) wx.switchTab({ url: '/pages/build/build' }) }
}))
