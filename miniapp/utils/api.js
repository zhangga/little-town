// utils/api.js
const { API_BASE_URL, REQUEST_TIMEOUT } = require('./config')

// 获取存储的 token
function getToken() {
  return wx.getStorageSync('token') || ''
}

// 设置 token
function setToken(token) {
  wx.setStorageSync('token', token)
}

// 清除 token
function clearToken() {
  wx.removeStorageSync('token')
}

// 判断是否已登录
function isLoggedIn() {
  return !!getToken()
}

// 统一请求封装
function request(options) {
  const needAuth = options.needAuth !== false
  const header = Object.assign(
    { 'Content-Type': 'application/json' },
    options.header || {}
  )

  if (needAuth) {
    const token = getToken()
    if (token) {
      header.Authorization = 'Bearer ' + token
    }
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header,
      timeout: REQUEST_TIMEOUT,

      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        if (res.statusCode === 401) {
          // 登录态失效：清 token 并回登录页
          clearToken()
          wx.removeStorageSync('userInfo')

          const pages = getCurrentPages()
          const current = pages.length ? pages[pages.length - 1].route : ''
          if (current !== 'pages/login/login') {
            wx.redirectTo({ url: '/pages/login/login' })
          }
          reject(new Error('登录已过期，请重新进镇'))
          return
        }

        const msg = (res.data && res.data.error) || '请求失败（' + res.statusCode + '）'
        reject(new Error(msg))
      },

      fail: (err) => {
        // 区分「连不上」和「被拦下」，这两种情况的解决办法不一样
        const raw = (err && err.errMsg) || ''
        let msg = '网络连接失败'

        if (raw.indexOf('timeout') > -1) {
          msg = '请求超时，请检查后端是否已启动'
        } else if (raw.indexOf('domain') > -1 || raw.indexOf('not in domain list') > -1) {
          msg = '域名未配置：开发者工具需勾选「不校验合法域名」'
        } else if (raw.indexOf('fail') > -1) {
          msg = '连不上后端，请确认服务已启动且地址正确'
        }

        console.warn('[api] 请求失败', options.url, raw)
        reject(new Error(msg))
      }
    })
  })
}

function get(url, data, needAuth) {
  return request({ url, method: 'GET', data, needAuth })
}

function post(url, data, needAuth) {
  return request({ url, method: 'POST', data, needAuth })
}

function put(url, data, needAuth) {
  return request({ url, method: 'PUT', data, needAuth })
}

function del(url, data, needAuth) {
  return request({ url, method: 'DELETE', data, needAuth })
}

module.exports = {
  API_BASE_URL,
  getToken,
  setToken,
  clearToken,
  isLoggedIn,
  request,
  get,
  post,
  put,
  del
}
