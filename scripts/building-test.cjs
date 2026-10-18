const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { catalogState, townPlots } = require('../miniapp/utils/town')
const { townSprite } = require('../miniapp/utils/assets')
const seed = require('../backend/data/buildings.json')
const event = data => ({ currentTarget: { dataset: data } })

async function pageHarness(options = {}) {
  const filename = path.resolve('miniapp/pages/build/build.js')
  const localRequire = createRequire(filename)
  const storage = { token: 'test', userInfo: { nickname: '测试', bricks: 999, coins: 20 } }
  const calls = [], errors = [], navigation = []
  const server = { bricks: options.bricks === undefined ? 12 : options.bricks, built: options.built || [] }
  const response = () => ({
    user: { bricks: server.bricks, coins: 20, level: 1 },
    buildings: seed.map((item, index) => ({ ...item, id: index + 1, is_built: server.built.includes(index + 1), can_build: !server.built.includes(index + 1) && server.bricks >= item.cost_bricks }))
  })
  const api = {
    get: async () => { calls.push({ method: 'GET' }); return options.get ? options.get(response) : response() },
    post: async (url, data) => {
      calls.push({ method: 'POST', url, data })
      if (options.post) return options.post(data, server)
      server.built.push(data.building_id)
      server.bricks -= seed[data.building_id - 1].cost_bricks
      return { remaining_bricks: server.bricks }
    }
  }
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: name => name === '../../utils/api' ? api : name === '../../utils/util' ? { showError: message => errors.push(message) } : localRequire(name),
    Page: value => { definition = value },
    wx: { getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value }, removeStorageSync: key => { delete storage[key] }, vibrateShort() {}, stopPullDownRefresh() {}, redirectTo() {}, switchTab: value => navigation.push(value.url) }, console
  }, { filename })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) }
  page.setData = patch => Object.assign(page.data, patch)
  page.onLoad()
  page.onShow()
  if (!options.pending) await page._loadPromise
  return { page, calls, storage, errors, server, api, navigation }
}

module.exports = { pageHarness, event, seed }

if (require.main === module) {
  test('catalog recommends the cheapest available blueprint and clamps material progress', () => {
    const raw = seed.map((item, index) => ({ ...item, id: index + 1, can_build: item.cost_bricks <= 12 }))
    const state = catalogState(raw, { bricks: 12 }, 'all')
    assert.equal(state.recommended.name, '商店')
    assert.equal(state.readyCount, 5)
    const shop = state.buildings.find(item => item.name === '商店')
    assert.equal(shop.progress, 100)
    assert.equal(shop.missing, 0)
    const stadium = state.buildings.find(item => item.name === '体育馆')
    assert.equal(stadium.missing, 13)
    assert.equal(stadium.progress, 48)
    assert.equal(catalogState(raw, { bricks: 0 }, 'ready').visibleBuildings.length, 0)
  })

  test('seeded buildings use local art, the vet reuses clinic art, and unknown names safely fall back', () => {
    assert.equal(new Set(seed.map(item => JSON.stringify(townSprite(item.name)))).size, 10)
    assert.deepEqual(townSprite('宠物医院'), townSprite('医院'))
    assert.deepEqual(townSprite('constructor'), townSprite('空地'))
    assert.deepEqual(townSprite('新建筑'), townSprite('空地'))
  })

  test('repeated shows share an in-flight load and synchronize the current warehouse balance', async () => {
    let resolve
    const h = await pageHarness({ pending: true, get: response => new Promise(done => { resolve = () => done(response()) }) })
    h.page.onShow(); h.page.loadBuildings()
    assert.equal(h.calls.length, 1)
    resolve(); await h.page._loadPromise
    assert.equal(h.storage.userInfo.bricks, 12)
    assert.equal(h.storage.userInfo.nickname, '测试')
  })

  test('preview spends nothing; rapid build taps submit once and use the server balance', async () => {
    let resolve
    const h = await pageHarness({ post: () => new Promise(done => { resolve = done }) })
    h.page.onSelect(event({ id: 2 }))
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    const pending = h.page.onBuild()
    h.page.onBuild(); h.page.onCloseDetail(); h.page.onSelect(event({ id: 1 }))
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1)
    assert.equal(h.page.data.selected.id, 2)
    resolve({ remaining_bricks: 6 }); await pending
    assert.equal(h.storage.userInfo.bricks, 6)
    assert.equal(h.page.data.user.bricks, 6)
    assert.equal(h.page.data.selected.is_built, true)
    assert.equal(h.page.data.completed.name, '商店')
    assert.equal(h.page.data.builtCount, 1)
    assert.equal(h.storage.lastBuiltBuilding.name, '商店')
    await h.page.onBuild()
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1)
  })

  test('a lost response reloads the town state without retrying the spend', async () => {
    const h = await pageHarness({ post: async (data, server) => {
      server.built.push(data.building_id); server.bricks = 7
      throw new Error('请求超时')
    } })
    h.page.onSelect(event({ id: 2 })); await h.page.onBuild()
    assert.equal(h.errors.length, 1)
    assert.equal(h.page.data.selected.is_built, true)
    assert.equal(h.page.data.completed, null)
    assert.equal(h.page.data.building, false)
    assert.equal(h.storage.userInfo.bricks, 7)
    await h.page.onBuild()
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1)
  })

  test('insufficient resources never submit and refreshing a preview updates its requirements', async () => {
    const h = await pageHarness({ bricks: 2 })
    h.page.onSelect(event({ id: 2 })); await h.page.onBuild()
    assert.equal(h.page.data.selected.missing, 3)
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    h.server.bricks = 15
    await h.page.loadBuildings()
    assert.equal(h.page.data.selected.id, 2)
    assert.equal(h.page.data.selected.can_build, true)
    h.page.onGoLearn()
    assert.equal(h.navigation[0], '/pages/learn/learn')
  })

  test('filters reflect a successful construction and all-built catalog has no recommendation', async () => {
    const h = await pageHarness()
    h.page.onFilter(event({ filter: 'ready' }))
    h.page.onSelect(event({ id: 2 })); await h.page.onBuild()
    assert.equal(h.page.data.visibleBuildings.some(item => item.id === 2), false)
    h.page.onCloseDetail(); h.page.onFilter(event({ filter: 'built' }))
    assert.equal(h.page.data.visibleBuildings.length, 1)
    assert.equal(h.page.data.visibleBuildings[0].name, '商店')
    h.server.built = seed.map((_, index) => index + 1)
    await h.page.loadBuildings()
    assert.equal(h.page.data.recommended, null)
  })

  test('town layout keeps every old building and fills complete three-column rows', () => {
    const raw = seed.map((item, index) => ({ ...item, id: index + 1, position_x: 60 + (index % 4) * 180, position_y: 60 + Math.floor(index / 4) * 200, built_at: '2026-10-16 12:00:00' }))
    const snapshot = JSON.stringify(raw)
    const layout = townPlots(raw, '体育馆')
    assert.equal(layout.buildings.length, 11)
    assert.equal(layout.plots.length, 18)
    assert.equal(layout.plots.filter(item => item.next).length, 1)
    assert.equal(layout.buildings.filter(item => item.isNew).length, 1)
    assert.equal(layout.buildings[0].builtDate, '2026-10-16')
    assert.equal(JSON.stringify(raw), snapshot)
    assert.equal(townPlots([], '').plots.length, 18)
  })
}
