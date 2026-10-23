const { withTapSounds } = require('../../utils/sound-page')
// pages/login/login.js
const api = require('../../utils/api')
const { GRADES } = require('../../utils/assets')
const { showError, showSuccess } = require('../../utils/util')

function loginErrorMessage(err) {
  const message = (err && (err.errMsg || err.message)) || ''
  if (/login:fail/i.test(message)) {
    if (/timeout/i.test(message)) return '微信登录超时，请检查网络后重试'
    if (/access_token missing|需要重新登录/i.test(message)) {
      let devtools = false
      try {
        const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
        devtools = info.platform === 'devtools'
      } catch (_) {}
      return devtools
        ? '开发者工具登录已失效，请在工具中重新扫码登录后重试'
        : '微信登录状态已失效，请重新打开小程序后重试'
    }
    return '微信登录失败，请稍后重试'
  }
  return message || '进镇失败，请重试'
}

Page(withTapSounds({
  data: {
    nickname: '',
    avatarUrl: '',
    gradeIndex: 0,
    grades: GRADES,
    submitting: false,
    errorMessage: ''
  },

  onLoad() {
    // 已有登录态则直接进入小镇
    if (wx.getStorageSync('token')) {
      return this.onStart()
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
    const hasSession = !!wx.getStorageSync('token')

    if (!hasSession && (!nickname || !nickname.trim())) {
      const message = '先给自己取个名字吧'
      this.setData({ errorMessage: message })
      showError(message)
      return
    }

    this.setData({ submitting: true, errorMessage: '' })
    wx.showLoading({ title: '正在进镇…', mask: true })

    let entered = false
    try {
      if (!hasSession) {
        const loginRes = await new Promise((resolve, reject) => {
          wx.login({
            timeout: 10000,
            success: resolve,
            fail: reject
          })
        })

        if (!loginRes || !loginRes.code) {
          throw new Error('微信登录失败，请重试')
        }

        const res = await api.post('/auth/login', {
          code: loginRes.code,
          nickname: nickname.trim(),
          avatar: avatarUrl,
          grade: grades[gradeIndex].value
        }, false)

        wx.setStorageSync('token', res.token)
        wx.setStorageSync('userInfo', res.user)

        const app = getApp()
        if (app) app.globalData.userInfo = res.user
      }

      await new Promise((resolve, reject) => {
        wx.switchTab({
          url: '/pages/index/index',
          success: resolve,
          fail: () => reject(new Error('进入小镇失败，请重试'))
        })
      })
      entered = true
    } catch (err) {
      const message = loginErrorMessage(err)
      this.setData({ errorMessage: message })
      showError(message)
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
    if (entered) showSuccess('欢迎来到小小镇')
  }
}))
