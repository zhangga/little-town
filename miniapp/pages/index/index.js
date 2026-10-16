const api = require('../../utils/api')
const { townSprite } = require('../../utils/assets')
const { townPlots } = require('../../utils/town')
const { showError } = require('../../utils/util')
const { presentResident, saveWallet } = require('../../utils/resident')

Page({
  data: {
    town: { coins: 0, bricks: 0, level: 1, total_buildings: 0 },
    buildings: [], plots: [], selected: null, loading: true, failed: false, growth: null, growthFailed: false,
    brickSprite: townSprite('砖块'), coinSprite: townSprite('金币'),
    treeSprite: townSprite('树林'), flagSprite: townSprite('旗帜')
  },

  onLoad() {
    if (!wx.getStorageSync('token')) wx.redirectTo({ url: '/pages/login/login' })
  },

  onShow() {
    if (wx.getStorageSync('token')) this.loadTown()
  },

  onUnload() { this._disposed = true },

  onPullDownRefresh() {
    return this.loadTown().finally(() => wx.stopPullDownRefresh())
  },

  loadTown() {
    if (this._loadPromise) return this._loadPromise
    this.setData({ loading: !this.data.plots.length, failed: false })
    this._loadPromise = this.fetchTown().finally(() => { this._loadPromise = null })
    return this._loadPromise
  },

  async fetchTown() {
    try {
      const [res, resident] = await Promise.all([
        api.get('/buildings/my-town'), api.get('/resident').catch(() => null)
      ])
      if (this._disposed) return
      const growth = resident ? presentResident(resident) : null
      const recent = wx.getStorageSync('lastBuiltBuilding')
      const layout = townPlots(res.buildings || [], recent && recent.name, !!growth)
      const town = Object.assign({}, res.town_data || this.data.town, growth ? growth.wallet : {})
      this.setData(Object.assign({ town, growth, growthFailed: !growth, loading: false }, layout))
      if (growth) saveWallet(growth.wallet)
      if (recent && layout.buildings.some(item => item.isNew)) wx.removeStorageSync('lastBuiltBuilding')
    } catch (err) {
      if (this._disposed) return
      this.setData({ loading: false, failed: !this.data.plots.length })
      showError(err.message || '小镇数据加载失败')
    }
  },

  onPlotTap(e) {
    const plot = this.data.plots[e.currentTarget.dataset.index]
    if (!plot) return
    if (!plot.occupied) { this.onGoBuild(); return }
    this.setData({ selected: plot })
  },

  onCloseDetail() { this.setData({ selected: null }) },
  onNoop() {},
  onGoLearn() { wx.switchTab({ url: '/pages/learn/learn' }) },
  onGoBuild() { wx.switchTab({ url: '/pages/build/build' }) },
  onGoResident() { wx.navigateTo({ url: '/pages/resident/resident' }) },
  onDailyTask() { if (this.data.growth && this.data.growth.daily.done) this.onGoResident(); else this.onGoLearn() },
  onShareAppMessage() {
    return { title: '学单词，建一座自己的方块小镇', path: '/pages/index/index' }
  }
})
