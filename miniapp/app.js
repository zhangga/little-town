// app.js
const api = require('./utils/api')

App({
  globalData: {
    userInfo: null,
    systemInfo: null
  },

  onLaunch() {
    try {
      api.initialize()
    } catch (err) {
      console.error('服务初始化失败', err)
    }

    // 读取本地缓存的用户信息
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
    }

    try {
      this.globalData.systemInfo = wx.getSystemInfoSync()
    } catch (err) {
      console.warn('获取系统信息失败', err)
    }
  },

  // 供各页面调用的登录态判断
  isLoggedIn() {
    return !!wx.getStorageSync('token')
  }
})
