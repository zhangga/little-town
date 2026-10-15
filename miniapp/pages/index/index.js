// pages/index/index.js
const api = require('../../utils/api')
const { buildingEmoji } = require('../../utils/assets')
const { showError } = require('../../utils/util')

// 地图单元格：4 列网格，与后端建造时的布局算法保持一致
const COL_W = 172
const ROW_H = 210
const PAD = 24

Page({
  data: {
    userInfo: null,
    town: { coins: 0, bricks: 0, level: 1, total_buildings: 0 },
    buildings: [],
    mapHeight: 900,
    selected: null,
    loading: true,
    failed: false,
    firstDropDone: false
  },

  onLoad() {
    if (!this.checkAuth()) return
    this.loadTown()
  },

  onShow() {
    if (!this.checkAuth()) return
    // 从学习/建造页返回时刷新
    if (!this.data.loading) {
      this.loadTown()
    }
  },

  onPullDownRefresh() {
    this.loadTown().then(() => wx.stopPullDownRefresh())
  },

  checkAuth() {
    const token = wx.getStorageSync('token')
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' })
      return false
    }
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) this.setData({ userInfo })
    return true
  },

  async loadTown() {
    this.setData({ loading: true, failed: false })
    try {
      const res = await api.get('/buildings/my-town')
      const raw = (res && res.buildings) || []

      // 后端返回的建筑缺少展示用字段，这里补齐 emoji 与旋转角
      const buildings = raw.map((item, index) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        image_url: item.image_url || '',
        emoji: buildingEmoji(item.name),
        word_count: item.word_count || 0,
        built_at: item.built_at || '',
        left: PAD + (item.position_x || 0),
        top: PAD + (item.position_y || 0),
        // 固定角度，避免每次渲染都晃动
        rotate: ((index % 3) - 1) * 1.5,
        delay: index * 90
      }))

      const rows = Math.ceil(buildings.length / 4)
      const mapHeight = Math.max(760, PAD * 2 + rows * ROW_H + 60)

      this.setData({
        town: res.town_data || this.data.town,
        buildings,
        mapHeight,
        loading: false,
        firstDropDone: true
      })
    } catch (err) {
      this.setData({ loading: false, failed: true })
      showError(err.message || '小镇数据加载失败')
    }
  },

  onBuildingTap(e) {
    const { index } = e.currentTarget.dataset
    this.setData({ selected: this.data.buildings[index] })
  },

  onCloseDetail() {
    this.setData({ selected: null })
  },

  // 阻止点穿：详情卡内部的点击不应关闭弹层
  onNoop() {},

  onGoLearn() {
    wx.switchTab({ url: '/pages/learn/learn' })
  },

  onGoBuild() {
    wx.switchTab({ url: '/pages/build/build' })
  },

  onShareAppMessage() {
    return {
      title: '我在小小镇盖房子，来看看我的小镇',
      path: '/pages/index/index'
    }
  }
})
