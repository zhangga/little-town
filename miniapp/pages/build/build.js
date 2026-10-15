// pages/build/build.js
const api = require('../../utils/api')
const { buildingEmoji } = require('../../utils/assets')
const { showError, showSuccess, showConfirm } = require('../../utils/util')

Page({
  data: {
    loading: true,
    failed: false,
    buildings: [],
    user: { bricks: 0, coins: 0, level: 1 },
    building: false,
    builtCount: 0
  },

  onLoad() {
    if (!wx.getStorageSync('token')) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.loadBuildings()
  },

  onShow() {
    if (wx.getStorageSync('token')) {
      this.loadBuildings()
    }
  },

  onPullDownRefresh() {
    this.loadBuildings().then(() => wx.stopPullDownRefresh())
  },

  async loadBuildings() {
    this.setData({ loading: true, failed: false })
    try {
      const res = await api.get('/buildings')
      const raw = (res && res.buildings) || []

      const buildings = raw.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        emoji: buildingEmoji(item.name),
        image_url: item.image_url || '',
        cost_bricks: item.cost_bricks,
        unlock_level: item.unlock_level || 1,
        is_built: !!item.is_built,
        can_build: !!item.can_build
      }))

      const builtCount = buildings.filter((b) => b.is_built).length

      this.setData({
        buildings,
        user: (res && res.user) || this.data.user,
        builtCount,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false, failed: true })
      showError(err.message || '建筑清单加载失败')
    }
  },

  onBuildTap(e) {
    const { index } = e.currentTarget.dataset
    const item = this.data.buildings[index]

    if (item.is_built) return
    if (!item.can_build) {
      showError('砖块不够，先去学几个单词')
      return
    }
    if (this.data.building) return

    this.confirmBuild(item)
  },

  async confirmBuild(item) {
    const ok = await showConfirm({
      title: '建造' + item.name,
      content: '需要 ' + item.cost_bricks + ' 块砖。建好后它会出现在小镇地图上。',
      confirmText: '建'
    })
    if (!ok) return

    this.setData({ building: true })
    try {
      await api.post('/buildings/build', { building_id: item.id })
      wx.vibrateShort({ type: 'medium' })
      showSuccess(item.name + ' 建好了')

      // 同步本地资源
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        userInfo.bricks = Math.max(0, (userInfo.bricks || 0) - item.cost_bricks)
        wx.setStorageSync('userInfo', userInfo)
      }

      await this.loadBuildings()
    } catch (err) {
      showError(err.message || '建造失败，再试一次')
    } finally {
      this.setData({ building: false })
    }
  },

  onGoLearn() {
    wx.switchTab({ url: '/pages/learn/learn' })
  },

  onGoTown() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return {
      title: '我在小小镇盖房子，来看看我的小镇',
      path: '/pages/index/index'
    }
  }
})
