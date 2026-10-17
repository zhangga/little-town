const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function harness(version = 'develop', storage = {}, changeConfig) {
  const calls = [], redirects = [], cloudInit = []
  let response = { statusCode: 200, data: { ok: true } }
  let failure
  const invoke = (kind, options) => {
    calls.push({ kind, options })
    if (failure) options.fail({ errMsg: failure })
    else options.success(response)
  }
  const wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }),
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    removeStorageSync: key => { delete storage[key] },
    redirectTo: options => redirects.push(options.url),
    request: options => invoke('http', options),
    cloud: { init: options => cloudInit.push(options), callContainer: options => invoke('cloudrun', options) }
  }
  const load = (name, require) => {
    const filename = path.resolve('miniapp/utils/' + name + '.js')
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require, wx, console, getCurrentPages: () => [] }, { filename })
    return module.exports
  }
  const config = load('config')
  if (changeConfig) changeConfig(config)
  const api = load('api', () => config)
  return { api, config, wx, calls, storage, redirects, cloudInit, respond: value => { response = value }, fail: value => { failure = value } }
}

test('local requests preserve existing login and do not initialize cloud SDK', async () => {
  const h = harness('develop', { token: 'local-token', userInfo: { id: 1 } })
  h.storage.apiBackend = 'http:' + h.config.TARGETS.local.baseURL
  await h.api.get('/learn/daily-words', { grade: 2 })
  assert.equal(h.cloudInit.length, 0)
  assert.equal(h.calls[0].kind, 'http')
  assert.equal(h.calls[0].options.url, h.config.TARGETS.local.baseURL + '/learn/daily-words')
  assert.equal(h.calls[0].options.header.Authorization, 'Bearer local-token')
  assert.equal(h.storage.userInfo.id, 1)
})

for (const version of ['trial', 'release']) {
  test(version + ' routes to the supplied environment and encodes GET query parameters', async () => {
    const h = harness(version, { token: 'old-local-token', userInfo: { id: 1 } })
    h.api.initialize()
    assert.equal(h.storage.token, undefined)
    h.api.setToken('cloud-token')
    await h.api.get('/learn/daily-words', { grade: 2, q: 'ice cream & 苹果', missing: undefined })
    await h.api.post('/buildings/build', { building_id: 2 })
    assert.equal(h.cloudInit.length, 1)
    const get = h.calls[0].options
    assert.equal(get.config.env, 'prod-d4g0vweip50ea1139')
    assert.equal(get.header['X-WX-SERVICE'], 'golang-y91h')
    assert.equal(get.header.Authorization, 'Bearer cloud-token')
    assert.equal(get.path, '/api/v1/learn/daily-words?grade=2&q=ice%20cream%20%26%20%E8%8B%B9%E6%9E%9C')
    assert.equal(get.data, undefined)
    assert.equal(get.timeout, 60000)
    assert.equal(h.calls[1].options.data.building_id, 2)
    assert.equal(h.calls[1].options.method, 'POST')
  })
}

test('self-hosted release uses HTTPS and keeps the common login/error contract', async () => {
  const h = harness('release', {}, config => {
    config.ENV.release = 'server'
    config.TARGETS.server.baseURL = 'https://town.example.com/api/v1/'
  })
  h.api.initialize(); h.api.setToken('server-token')
  await h.api.put('/user/profile', { nickname: '小镇' })
  assert.equal(h.calls[0].options.url, 'https://town.example.com/api/v1/user/profile')
  assert.equal(h.calls[0].options.method, 'PUT')
  assert.equal(h.cloudInit.length, 0)
  h.respond({ statusCode: 401, data: { error: 'expired' } })
  await assert.rejects(h.api.get('/user/profile'), /登录已过期/)
  assert.equal(h.storage.token, undefined)
  assert.equal(h.redirects[0], '/pages/login/login')
})

test('invalid production configuration never falls back to localhost', async () => {
  const h = harness('release', {}, config => { config.ENV.release = 'server' })
  await assert.rejects(h.api.get('/user/profile'), /后端地址/)
  assert.equal(h.calls.length, 0)
  h.config.TARGETS.server.baseURL = 'http://localhost:8080/api/v1'
  await assert.rejects(h.api.get('/user/profile'), /HTTPS/)
  assert.equal(h.calls.length, 0)
  assert.throws(() => h.config.resolveConfig('unknown'), /未配置/)
})

test('cloud writes fail once without falling back or retrying the spend', async () => {
  const h = harness('trial')
  h.api.initialize(); h.api.setToken('cloud-token'); h.fail('callContainer:fail timeout')
  await assert.rejects(h.api.post('/buildings/build', { building_id: 1 }), /超时/)
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].kind, 'cloudrun')
})

test('cloud requires SDK capability while local remains usable without it', async () => {
  const cloud = harness('trial'); delete cloud.wx.cloud
  await assert.rejects(cloud.api.get('/buildings'), /微信版本/)
  assert.equal(cloud.calls.length, 0)
  const local = harness(); delete local.wx.cloud
  await local.api.get('/buildings')
  assert.equal(local.calls.length, 1)
})

test('login requests omit the cached authorization header in either transport', async () => {
  for (const version of ['develop', 'trial']) {
    const h = harness(version); h.api.initialize(); h.api.setToken('unused')
    await h.api.post('/auth/login', { code: 'one-use-code' }, false)
    assert.equal(h.calls[0].options.header.Authorization, undefined)
  }
})

test('a phone with unreadable environment metadata never connects to localhost', async () => {
  const h = harness('release')
  h.wx.getAccountInfoSync = () => { throw new Error('SDK error') }
  h.wx.getDeviceInfo = () => ({ platform: 'ios' })
  await assert.rejects(h.api.get('/buildings'), /无法识别/)
  assert.equal(h.calls.length, 0)
  h.wx.getDeviceInfo = () => ({ platform: 'devtools' })
  await h.api.get('/buildings')
  assert.equal(h.calls[0].kind, 'http')
})
