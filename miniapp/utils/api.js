const { resolveConfig } = require('./config')

let initializedFor = ''

function getToken() { return wx.getStorageSync('token') || '' }
function setToken(token) { wx.setStorageSync('token', token) }
function clearToken() { wx.removeStorageSync('token') }
function isLoggedIn() { return !!getToken() }

function identity(config) {
  return config.transport === 'cloudrun'
    ? 'cloudrun:' + config.env + ':' + config.service + ':' + config.apiPrefix
    : 'http:' + config.baseURL
}

// App.onLaunch 和请求共用初始化；本地开发无需云能力。
function initialize() {
  const config = resolveConfig()
  const key = identity(config)
  if (initializedFor === key) return config

  if (config.transport === 'cloudrun') {
    if (!wx.cloud || !wx.cloud.init || !wx.cloud.callContainer) {
      throw new Error('微信版本过低，请更新后再试')
    }
    wx.cloud.init({ env: config.env, traceUser: true })
  }

  // 切换数据库/后端时，不复用另一环境的用户资料和登录凭证。
  const previous = wx.getStorageSync('apiBackend')
  const legacyLocal = 'http:http://localhost:8080/api/v1'
  if ((previous && previous !== key) || (!previous && key !== legacyLocal)) {
    clearToken()
    wx.removeStorageSync('userInfo')
  }
  wx.setStorageSync('apiBackend', key)
  initializedFor = key
  return config
}

function queryString(data) {
  return Object.keys(data || {})
    .filter(key => data[key] !== undefined && data[key] !== null)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(String(data[key])))
    .join('&')
}

function request(options) {
  return new Promise((resolve, reject) => {
    let config
    try {
      config = initialize()
    } catch (err) {
      reject(err)
      return
    }

    const method = (options.method || 'GET').toUpperCase()
    const header = Object.assign({ 'Content-Type': 'application/json' }, options.header || {})
    if (options.needAuth !== false && getToken()) header.Authorization = 'Bearer ' + getToken()

    const success = res => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res.data)
        return
      }
      if (res.statusCode === 401 && options.needAuth !== false) {
        clearToken()
        wx.removeStorageSync('userInfo')
        const pages = getCurrentPages()
        const current = pages.length ? pages[pages.length - 1].route : ''
        if (current !== 'pages/login/login') wx.redirectTo({ url: '/pages/login/login' })
        reject(new Error('登录已过期，请重新进镇'))
        return
      }
      const error = new Error((res.data && res.data.error) || '请求失败（' + res.statusCode + '）')
      error.statusCode = res.statusCode
      reject(error)
    }
    const fail = err => {
      const raw = (err && err.errMsg) || (err && err.message) || ''
      let message = '暂时连不上服务，请稍后重试'
      if (/timeout/i.test(raw)) {
        message = '连接超时，请稍后重试'
      } else if (config.envVersion === 'develop' && /domain/i.test(raw)) {
        message = '域名未配置：开发者工具需勾选「不校验合法域名」'
      } else if (config.target === 'local') {
        message = '连不上后端，请确认服务已启动且地址正确'
      }
      console.warn('[api] 请求失败', config.target, options.url, raw)
      reject(new Error(message))
    }
    const common = { method, header, timeout: config.timeout, success, fail }

    // 写操作不自动重试，避免重复扣砖、发奖或建造。
    try {
      if (config.transport === 'cloudrun') {
        let path = config.apiPrefix.replace(/\/+$/, '') + options.url
        let data = options.data || {}
        if (method === 'GET' || method === 'HEAD') {
          const query = queryString(data)
          if (query) path += (path.indexOf('?') >= 0 ? '&' : '?') + query
          data = undefined
        }
        wx.cloud.callContainer(Object.assign({}, common, {
          config: { env: config.env },
          path,
          data,
          header: Object.assign({}, header, { 'X-WX-SERVICE': config.service })
        }))
      } else {
        wx.request(Object.assign({}, common, {
          url: config.baseURL + options.url,
          data: options.data || {}
        }))
      }
    } catch (err) {
      fail(err)
    }
  })
}

function get(url, data, needAuth) { return request({ url, method: 'GET', data, needAuth }) }
function post(url, data, needAuth) { return request({ url, method: 'POST', data, needAuth }) }
function put(url, data, needAuth) { return request({ url, method: 'PUT', data, needAuth }) }
function del(url, data, needAuth) { return request({ url, method: 'DELETE', data, needAuth }) }

const subscription = {
  info: () => get('/subscription/info'),
  grant: accepted => post('/subscription/grant', { accepted }),
  testPush: () => post('/subscription/test-push')
}

module.exports = { initialize, getToken, setToken, clearToken, isLoggedIn, request, get, post, put, del, subscription }
