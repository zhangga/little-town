const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function harness() {
  const storage = {}, requests = [], errors = [], successes = [], navigation = []
  const app = { globalData: {} }
  let page, loading = false, loginCalls = 0
  const wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    getDeviceInfo: () => ({ platform: 'devtools' }),
    showLoading: () => { loading = true },
    hideLoading: () => { loading = false },
    login: options => { loginCalls++; options.success({ code: 'test-code' }) },
    switchTab: options => { navigation.push(options.url); if (options.success) options.success({}) }
  }
  const api = {
    post: async (...args) => { requests.push(args); return { token: 'test-token', user: { id: 1, nickname: '小镇长' } } }
  }
  const filename = path.resolve(__dirname, '../miniapp/pages/login/login.js')
  const localRequire = createRequire(filename)
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    wx, getApp: () => app, console,
    setTimeout: callback => { callback(); return 1 }, clearTimeout: () => {},
    Page: definition => { page = definition },
    require: name => name.endsWith('/sound-page') ? localRequire(name) : name.endsWith('/api') ? api : name.endsWith('/assets') ? { GRADES: [{ label: '一年级', value: 1 }] } : {
      showError: message => errors.push(message), showSuccess: message => successes.push(message)
    }
  }, { filename })
  page.data = { ...page.data, nickname: ' 小镇长 ' }
  page.setData = updates => Object.assign(page.data, updates)
  return { page, wx, api, storage, requests, errors, successes, navigation, app, loading: () => loading, loginCalls: () => loginCalls }
}

test('expired developer-tool login explains how to recover and allows retry', async () => {
  const h = harness()
  h.wx.login = options => options.fail({ errMsg: 'login:fail 需要重新登录,access_token missing [20261023 20:45:23]' })
  await h.page.onStart()
  assert.match(h.page.data.errorMessage || '', /开发者工具.*扫码/)
  assert.match(h.errors[0], /开发者工具.*扫码/)
  assert.equal(h.requests.length, 0)
  assert.equal(h.storage.token, undefined)
  assert.equal(h.page.data.submitting, false)
  assert.equal(h.loading(), false)
  h.wx.login = options => options.success({ code: 'fresh-code' })
  await h.page.onStart()
  assert.equal(h.requests[0][1].code, 'fresh-code')
  assert.equal(h.page.data.errorMessage, '')
  assert.equal(h.navigation[0], '/pages/index/index')
})

test('login submits the profile without stale authorization and stores session before navigation', async () => {
  const h = harness()
  await h.page.onStart()
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0][0], '/auth/login')
  assert.equal(h.requests[0][2], false)
  assert.equal(h.requests[0][1].nickname, '小镇长')
  assert.equal(h.storage.token, 'test-token')
  assert.equal(h.app.globalData.userInfo, h.storage.userInfo)
  assert.equal(h.navigation.length, 1)
  assert.equal(h.successes.length, 1)
  assert.equal(h.page.data.submitting, false)
  assert.equal(h.loading(), false)
})

test('failure to enter the town leaves a retryable button and no false success', async () => {
  const h = harness()
  h.wx.switchTab = options => { if (options.fail) options.fail({ errMsg: 'switchTab:fail timeout' }) }
  await h.page.onStart()
  assert.equal(h.page.data.submitting, false)
  assert.match(h.page.data.errorMessage || '', /小镇.*重试/)
  assert.equal(h.successes.length, 0)
  assert.equal(h.loading(), false)
})

test('backend login errors remain visible after the toast disappears', async () => {
  const h = harness()
  h.api.post = async () => { throw new Error('微信登录凭证已失效，请重新登录') }
  await h.page.onStart()
  assert.equal(h.page.data.errorMessage, '微信登录凭证已失效，请重新登录')
  assert.equal(h.storage.token, undefined)
  assert.equal(h.page.data.submitting, false)
})

test('repeated taps do not create parallel login requests', async () => {
  const h = harness()
  let completeLogin, calls = 0
  h.wx.login = options => { calls++; completeLogin = options.success }
  const pending = h.page.onStart()
  await h.page.onStart()
  assert.equal(calls, 1)
  completeLogin({ code: 'one-use-code' })
  await pending
  assert.equal(h.requests.length, 1)
})

test('blank names and missing WeChat codes never reach the backend', async () => {
  const h = harness()
  h.page.data.nickname = '   '
  await h.page.onStart()
  assert.equal(h.loginCalls(), 0)
  h.page.data.nickname = '小镇长'
  h.wx.login = options => options.success({})
  await h.page.onStart()
  assert.equal(h.requests.length, 0)
  assert.equal(h.page.data.submitting, false)
  assert.equal(h.loading(), false)
})

test('phone login failures never instruct users to use developer tools', async () => {
  const h = harness()
  h.wx.getDeviceInfo = () => ({ platform: 'ios' })
  h.wx.login = options => options.fail({ errMsg: 'login:fail timeout' })
  await h.page.onStart()
  assert.match(h.page.data.errorMessage || '', /微信登录.*超时/)
  assert.doesNotMatch(h.page.data.errorMessage, /开发者工具/)
})

test('WeChat login has a bounded timeout and success waits for navigation', async () => {
  const h = harness()
  let finishNavigation
  h.wx.login = options => {
    assert.ok(options.timeout > 0 && options.timeout <= 30000)
    options.success({ code: 'bounded-code' })
  }
  h.wx.switchTab = options => { finishNavigation = options.success }
  const pending = h.page.onStart()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.successes.length, 0)
  assert.equal(h.page.data.submitting, true)
  assert.equal(h.storage.token, 'test-token')
  finishNavigation({})
  await pending
  assert.equal(h.successes.length, 1)
  assert.equal(h.page.data.submitting, false)
  assert.equal(h.loading(), false)
})

test('an existing session can retry failed automatic navigation without logging in again', async () => {
  const h = harness()
  h.storage.token = 'existing-token'
  h.page.data.nickname = ''
  h.wx.switchTab = options => options.fail({ errMsg: 'switchTab:fail timeout' })
  await h.page.onLoad()
  assert.match(h.page.data.errorMessage, /小镇.*重试/)
  assert.equal(h.page.data.submitting, false)
  assert.equal(h.successes.length, 0)
  assert.equal(h.loading(), false)
  h.wx.switchTab = options => { h.navigation.push(options.url); options.success({}) }
  await h.page.onStart()
  assert.equal(h.loginCalls(), 0)
  assert.equal(h.requests.length, 0)
  assert.equal(h.storage.token, 'existing-token')
  assert.equal(h.page.data.errorMessage, '')
  assert.equal(h.navigation[0], '/pages/index/index')
  assert.equal(h.successes.length, 1)
})
