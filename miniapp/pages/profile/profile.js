const { withTapSounds } = require('../../utils/sound-page')
// pages/profile/profile.js
const api = require('../../utils/api')
const { showConfirm, showError } = require('../../utils/util')

const GRADE_LABELS = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级']

Page(withTapSounds({
  onGoResident() { wx.switchTab({ url: '/pages/resident/resident' }) },
  data: {
    userInfo: null,
    gradeLabel: '',
    stats: null,
    loading: true
  },

  onLoad() {
    if (!wx.getStorageSync('token')) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.loadProfile()
  },

  onShow() {
    if (wx.getStorageSync('token')) {
      this.loadProfile()
    }
  },

  async loadProfile() {
    const cached = wx.getStorageSync('userInfo') || null
    if (cached) {
      this.setData({
        userInfo: cached,
        gradeLabel: GRADE_LABELS[(cached.grade || 1) - 1] || ''
      })
    }

    try {
      const user = await api.get('/user/profile')
      wx.setStorageSync('userInfo', user)
      this.setData({
        userInfo: user,
        gradeLabel: GRADE_LABELS[(user.grade || 1) - 1] || '',
        loading: false
      })
    } catch (err) {
      // 有缓存就继续显示，没有才报错
      if (!cached) {
        showError('个人信息加载失败')
      }
      this.setData({ loading: false })
    }

    this.loadStats()
  },

  async loadStats() {
    try {
      const res = await api.get('/learn/stats')
      this.setData({ stats: (res && res.stats) || null })
    } catch (err) {
      console.warn('学习统计加载失败', err)
    }
  },

  onGoParent() {
    wx.navigateTo({ url: '/pages/parent/parent' })
  },

  onGoTown() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onGoBuild() {
    wx.switchTab({ url: '/pages/build/build' })
  },

  async onLogout() {
    const ok = await showConfirm({
      title: '退出登录',
      content: '退出后需要重新进镇，小镇里的东西不会丢失。',
      confirmText: '退出'
    })
    if (!ok) return

    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('parentVerified')

    wx.redirectTo({ url: '/pages/login/login' })
  },

  onShareAppMessage() {
    return {
      title: '我在小小镇学单词，还能盖房子',
      path: '/pages/index/index'
    }
  }
}))
