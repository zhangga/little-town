const api = require('../../../utils/api')
const { withTapSounds } = require('../../../utils/sound-page')
const { showError } = require('../../../utils/util')
const { presentResident, saveWallet } = require('../../../utils/resident')
const { roomData, createHomeRoom } = require('../../utils/home-room-page')

Page(withTapSounds(Object.assign({}, createHomeRoom(api, wx, showError), {
  data: Object.assign({}, roomData, { loading: true, failed: false, state: null, busy: false, tab: 'room' }),
  onLoad() { if (!wx.getStorageSync('token')) wx.redirectTo({ url: '/pages/login/login' }) },
  onShow() {
    this._visible = true
    this._roomRequest = wx.getStorageSync('homeRoomRequested')
    if (wx.getStorageSync('token')) this.loadResident()
  },
  onHide() { this._visible = false; this.stopRoomWalk() },
  onUnload() { this._visible = false; this.stopRoomWalk(); this._disposed = true },
  onPullDownRefresh() { return this.loadResident().finally(() => wx.stopPullDownRefresh()) },
  applyState(response) {
    if (this._disposed) return
    this.stopRoomWalk()
    const state = presentResident(response)
    this.setData({ state, loading: false, failed: false })
    this.syncRoom(state)
    saveWallet(state.wallet)
    if (this._roomRequest && this.data.roomSupported) {
      const id = this._roomRequest
      this._roomRequest = null
      wx.removeStorageSync('homeRoomRequested')
      if (typeof id === 'string' && this.data.roomInventory.some(item => item.id === id)) {
        this.onRoomEdit()
        this.onRoomChoose({ currentTarget: { dataset: { id } } })
      }
    }
  },
  loadResident() {
    if (this._loadPromise) return this._loadPromise
    if (this.data.busy) return Promise.resolve()
    this.setData({ loading: !this.data.state, failed: false })
    this._loadPromise = api.get('/resident').then(state => this.applyState(state)).catch(err => {
      if (!this._disposed) { this.setData({ loading: false, failed: !this.data.state }); showError(err.message || '小家暂时没连上') }
    }).finally(() => { this._loadPromise = null })
    return this._loadPromise
  },
  onTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (this.data.busy || !['outfit', 'decoration', 'home'].includes(tab)) return
    wx.setStorageSync('residentTabRequested', tab)
    wx.switchTab({ url: '/pages/resident/resident' })
  },
  onNoop() {}
})))
