const { withTapSounds } = require('../../utils/sound-page')
const sound = require('../../utils/sound')
const api = require('../../utils/api')
const { townSprite } = require('../../utils/assets')
const { catalogState } = require('../../utils/town')
const { showError } = require('../../utils/util')

Page(withTapSounds({
  data: {
    loading: true, refreshing: false, failed: false,
    buildings: [], visibleBuildings: [],
    user: { bricks: 0, coins: 0, level: 1 },
    filter: 'all', builtCount: 0, readyCount: 0,
    recommended: null, selected: null, completed: null, building: false,
    brickSprite: townSprite('砖块'), coinSprite: townSprite('金币'), toolSprite: townSprite('工具')
  },

  onLoad() {
    this._visible = true
    if (!wx.getStorageSync('token')) wx.redirectTo({ url: '/pages/login/login' })
  },

  onShow() {
    this._visible = true
    if (wx.getStorageSync('token') && !this.data.building) this.loadBuildings()
  },

  onHide() { this._visible = false },
  onUnload() { this._visible = false; this._disposed = true },

  onPullDownRefresh() {
    return this.loadBuildings().finally(() => wx.stopPullDownRefresh())
  },

  loadBuildings() {
    if (this.data.building) return Promise.resolve()
    if (this._loadPromise) return this._loadPromise
    this.setData({ loading: !this.data.buildings.length, refreshing: true, failed: false })
    this._loadPromise = this.fetchBuildings().finally(() => { this._loadPromise = null })
    return this._loadPromise
  },

  async fetchBuildings() {
    try {
      const res = await api.get('/buildings')
      if (this._disposed) return
      const user = res.user || this.data.user
      this.setData(Object.assign({ user, loading: false, refreshing: false },
        catalogState(res.buildings || [], user, this.data.filter, this.data.selected && this.data.selected.id)))
      this.syncResources(user)
    } catch (err) {
      if (this._disposed) return
      this.setData({ loading: false, refreshing: false, failed: !this.data.buildings.length })
      showError(err.message || '建筑清单加载失败')
    }
  },

  syncResources(user) {
    const cached = wx.getStorageSync('userInfo')
    if (cached) wx.setStorageSync('userInfo', Object.assign({}, cached, user))
  },

  onFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (!['all', 'ready', 'built'].includes(filter)) return
    this.setData(Object.assign({ filter }, catalogState(this.data.buildings, this.data.user, filter)))
  },

  onSelect(e) {
    if (this.data.building) return
    const selected = this.data.buildings.find(item => item.id === Number(e.currentTarget.dataset.id))
    if (selected) this.setData({ selected, completed: null })
  },

  onCloseDetail() {
    if (!this.data.building) this.setData({ selected: null, completed: null })
  },

  onNoop() {},

  async onBuild() {
    const item = this.data.selected
    if (!item || !item.can_build || this.data.building || this.data.refreshing || this.data.completed) return
    // 在等待请求前锁住操作，连续点击只会提交一次。
    this.setData({ building: true })
    try {
      const res = await api.post('/buildings/build', { building_id: item.id })
      const remaining = Number.isFinite(res.remaining_bricks) ? res.remaining_bricks : Math.max(0, this.data.user.bricks - item.cost_bricks)
      const user = Object.assign({}, this.data.user, { bricks: remaining })
      this.syncResources(user)
      wx.setStorageSync('lastBuiltBuilding', { name: item.name })
      if (this._disposed) return
      const raw = this.data.buildings.map(building => Object.assign({}, building, {
        is_built: building.id === item.id || building.is_built
      }))
      this.setData(Object.assign({ user, completed: item }, catalogState(raw, user, this.data.filter, item.id)))
      if (this._visible) { try { sound.playEffect('success') } catch (_) {} }
      wx.vibrateShort({ type: 'medium' })
    } catch (err) {
      if (this._disposed) return
      const messages = { 'not enough bricks': '砖块已变化，正在重新清点', 'building already exists': '这座建筑已经落成啦' }
      showError(messages[err.message] || err.message || '建造失败，再试一次')
      // 请求可能已成功但响应丢失，重新读取可防止再次提交同一座建筑。
      this.setData({ building: false })
      await this.loadBuildings()
    } finally {
      if (!this._disposed) this.setData({ building: false })
    }
  },

  onGoLearn() { this.onCloseDetail(); wx.switchTab({ url: '/pages/learn/learn' }) },
  onGoTown() { this.onCloseDetail(); wx.switchTab({ url: '/pages/index/index' }) },
  onShareAppMessage() {
    return { title: '学单词，建一座自己的方块小镇', path: '/pages/index/index' }
  }
}))
