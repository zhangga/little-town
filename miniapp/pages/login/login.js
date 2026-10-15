// pages/login/login.js
const api = require('../../utils/api')
const { GRADES } = require('../../utils/assets')
const { showError, showSuccess } = require('../../utils/util')

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    gradeIndex: 0,
    grades: GRADES,
    submitting: false
  },

  onLoad() {
    // 已有登录态则直接进入小镇
    if (wx.getStorageSync('token')) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  // 微信头像选择
  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  // 年级选择
  onGradeChange(e) {
    this.setData({ gradeIndex: Number(e.detail.value) })
  },

  onGradeTap(e) {
    this.setData({ gradeIndex: Number(e.currentTarget.dataset.index) })
  },

  // 开始建镇
  async onStart() {
    const { nickname, avatarUrl, gradeIndex, grades, submitting } = this.data
    if (submitting) return

    if (!nickname || !nickname.trim()) {
      showError('先给自己取个名字吧')
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '正在进镇…', mask: true })

    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      })

      if (!loginRes.code) {
        throw new Error('微信登录失败，请重试')
      }

      const res = await api.post('/auth/login', {
        code: loginRes.code,
        nickname: nickname.trim(),
        avatar: avatarUrl,
        grade: grades[gradeIndex].value
      })

      wx.setStorageSync('token', res.token)
      wx.setStorageSync('userInfo', res.user)

      const app = getApp()
      if (app) app.globalData.userInfo = res.user

      wx.hideLoading()
      showSuccess('欢迎来到小小镇')
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 800)
    } catch (err) {
      wx.hideLoading()
      showError(err.message || '进镇失败，请重试')
      this.setData({ submitting: false })
    }
  }
})
