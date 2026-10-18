const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { fixture: residentFixture } = require('./resident-test.cjs')
const { presentLife, townScene, buildingLife } = require('../miniapp/utils/town-life')
const { townPlots, describeBuilding } = require('../miniapp/utils/town')
const { fakeClock } = require('./town-stroll-test.cjs')

const tap = dataset => ({ currentTarget: { dataset } })
function fixture() {
  return {
    wallet: { coins: 25, bricks: 18 }, buildings: ['医院', '消防站'], unlocked_count: 2,
    pets: [{ id: 'dog', name: '小狗豆豆', icon: '🐶', price: 20, owned: false, description: '会摇尾巴的伙伴' }, { id: 'cat', name: '小猫团团', icon: '🐱', price: 20, owned: false }],
    event: { id: 7, kind: 'small_fire', title: '厨房冒出一阵烟', description: '邻居做饭时发现锅边有小火苗，大家已离开厨房，等消防员来帮忙。', building: '消防站', icon: '🚒', cost: 1, action: '拨打小镇消防电话', outcome: '消防员扑灭了小火苗。' }, recent: []
  }
}
async function harness(options = {}) {
  const filename = path.resolve('miniapp/pages/index/index.js'), localRequire = createRequire(filename)
  const strollClock = fakeClock()
  let definition
  const server = options.server || fixture(), calls = [], errors = [], navigation = []
  const storage = { token: 'test', userInfo: { coins: 999, bricks: 999, nickname: '账号' } }
  const api = {
    get: async url => {
      calls.push({ method: 'GET', url })
      if (options.get) return options.get(url, server)
      if (url === '/town-life') return structuredClone(server)
      if (url === '/resident') return residentFixture()
      return { town_data: { coins: 100, bricks: 100 }, buildings: server.buildings.map((name, i) => ({ id: i + 1, name })) }
    },
    post: async (url, body) => {
      calls.push({ method: 'POST', url, body })
      if (options.post) return options.post(url, body, server)
      if (url.includes('/pets/')) {
        const pet = server.pets.find(pet => pet.id === body.pet_id)
        if (!pet.owned) { server.wallet.coins -= pet.price; pet.owned = true }
      } else if (server.event) {
        server.wallet.coins -= server.event.cost
        server.recent.unshift({ ...server.event, resolved_at: '2026-10-17T12:00:00+08:00' })
        server.event = null
      }
      return structuredClone(server)
    }
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: name => name === '../../utils/api' ? api : name === '../../utils/util' ? { showError: message => errors.push(message) } : name === '../../utils/resident' ? { ...localRequire(name), saveWallet: wallet => Object.assign(storage.userInfo, wallet) } : name === '../../utils/town-stroll' ? { ...localRequire(name), createStroll: onChange => localRequire(name).createStroll(onChange, strollClock, () => .2) } : localRequire(name),
    Page: value => { definition = value }, wx: {
      getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value }, removeStorageSync: key => { delete storage[key] },
      redirectTo() {}, stopPullDownRefresh() {}, switchTab: options => navigation.push(options.url), navigateTo: options => navigation.push(options.url)
    }, console
  }, { filename })
  const page = { ...definition, data: structuredClone(definition.data), setData(patch, done) { Object.assign(this.data, patch); if (done) done() } }
  page.onLoad(); page.onShow()
  if (!options.pending) await page._loadPromise
  return { page, server, calls, errors, navigation, storage, api, strollClock }
}
module.exports = { fixture, harness, tap }

if (require.main === module) {
  test('town uses the latest life wallet and leaves account identity intact', async () => {
    const h = await harness()
    assert.equal(h.page.data.town.coins, 25)
    assert.equal(h.page.data.growth.wallet.coins, 25)
    assert.equal(h.storage.userInfo.coins, 25)
    assert.equal(h.storage.userInfo.nickname, '账号')
    assert.equal(h.page.data.life.event.affordable, true)
    h.page.onGoLife()
    assert.equal(h.page.data.townAnchor, 'town-life-panel')
  })
  test('pet preview is free, and duplicate purchase taps and closing are locked during a request', async () => {
    let finish
    const h = await harness({ post: () => new Promise(resolve => { finish = resolve }) })
    h.page.onSelectPet(tap({ id: 'dog' }))
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    const pending = h.page.onBuyPet()
    h.page.onBuyPet(); h.page.onClosePet(); h.page.onSelectPet(tap({ id: 'cat' }))
    assert.equal(h.page.data.selectedPet.id, 'dog')
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1)
    const result = fixture(); result.wallet.coins = 5; result.pets[0].owned = true
    finish(result); await pending
    assert.equal(h.page.data.selectedPet, null)
    assert.equal(h.page.data.life.companions[0].id, 'dog')
    assert.equal(h.storage.userInfo.coins, 5)
  })
  test('pet shop entry leads to the selected pet purchase and adds it to town immediately', async () => {
    const h = await harness()
    await h.page.onGoPets()
    assert.equal(h.page.data.townAnchor, 'town-pets-panel')
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    h.page.onSelectPet(tap({ id: 'cat' }))
    assert.equal(h.page.data.selectedPet.name, '小猫团团')
    assert.equal(h.page.data.selectedPet.art.y, -100)
    await h.page.onBuyPet()
    const purchases = h.calls.filter(call => call.method === 'POST')
    assert.equal(purchases.length, 1)
    assert.equal(purchases[0].url, '/town-life/pets/purchase')
    assert.equal(purchases[0].body.pet_id, 'cat')
    assert.equal(h.page.data.town.coins, 5)
    assert.equal(h.page.data.life.pets.find(pet => pet.id === 'dog').owned, false)
    assert.equal(h.page.data.life.companions[0].id, 'cat')
    assert.equal(h.page.data.walkers.filter(actor => actor.type === 'pet').length, 1)
    assert.equal(h.page.data.walkers.find(actor => actor.type === 'pet').id, 'pet-cat')
    assert.equal(h.page.data.lifeFeedback.art.y, -100)
    h.page.onCloseFeedback()
    h.page.onSelectPet(tap({ id: 'cat' }))
    assert.equal(h.page.data.selectedPet, null)
    h.page.onUnload()
  })
  test('one event submits its ID once, uses server coins, and shows its outcome', async () => {
    const h = await harness()
    const pending = h.page.onResolveLife(); h.page.onResolveLife(); await pending
    const calls = h.calls.filter(call => call.method === 'POST')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/town-life/events/resolve')
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].body)), { event_id: 7 })
    assert.equal(h.page.data.life.event, null)
    assert.equal(h.storage.userInfo.coins, 24)
    assert.equal(h.page.data.lifeFeedback.outcome, '消防员扑灭了小火苗。')
  })
  test('lost service and pet responses refresh state without retrying charges', async () => {
    for (const purchase of [false, true]) {
      const h = await harness({ post: async (_, body, server) => {
        server.wallet.coins -= purchase ? 20 : 1
        if (purchase) server.pets[0].owned = true
        else { server.recent = [server.event]; server.event = null }
        throw Error('网络超时')
      } })
      if (purchase) { h.page.onSelectPet(tap({ id: 'dog' })); await h.page.onBuyPet() }
      else await h.page.onResolveLife()
      assert.equal(h.calls.filter(call => call.method === 'POST').length, 1)
      assert.equal(h.storage.userInfo.coins, purchase ? 5 : 24)
      assert.equal(h.page.data.lifeFeedback, null)
      assert.equal(h.page.data.lifeBusy, false)
      assert.equal(h.page.data.selectedPet, null)
      assert.deepEqual(h.errors, ['网络超时'])
    }
  })
  test('zero coins route paid actions to learning while free life remains available', async () => {
    const server = fixture(); server.wallet.coins = 0
    const h = await harness({ server })
    await h.page.onResolveLife()
    h.page.onSelectPet(tap({ id: 'dog' })); await h.page.onBuyPet()
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    assert.equal(h.navigation.length, 2)
    h.page.onClosePet(); server.event.cost = 0; h.page.applyLife(server)
    await h.page.onResolveLife()
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1)
    assert.equal(h.storage.userInfo.coins, 0)
  })
  test('life read failures keep the map usable and a refresh recovers', async () => {
    const h = await harness({ get: async url => {
      if (url === '/town-life') throw Error('离线')
      if (url === '/resident') return residentFixture()
      return { buildings: [{ id: 1, name: '医院' }] }
    } })
    assert.equal(h.page.data.lifeFailed, true)
    assert.equal(h.page.data.failed, false)
    assert.equal(h.page.data.buildings.length, 1)
    h.api.get = async url => url === '/town-life' ? fixture() : url === '/resident' ? residentFixture() : { buildings: [] }
    await h.page.onGoPets()
    assert.equal(h.page.data.lifeFailed, false)
    assert.equal(h.page.data.townAnchor, 'town-pets-panel')
  })
  test('refreshes share a request and late results cannot update an unloaded page', async () => {
    let finish
    const h = await harness({ post: () => new Promise(resolve => { finish = resolve }) })
    const pending = h.page.onResolveLife(); await h.page.loadTown()
    assert.equal(h.calls.filter(call => call.url === '/town-life' && call.method === 'GET').length, 1)
    h.page.onHide(); assert.equal(h.page.data.sceneActive, false)
    h.page.onUnload(); const state = fixture(); state.wallet.coins = 1
    finish(state); await pending
    assert.equal(h.storage.userInfo.coins, 25)
  })
  test('failed reconciliation disables spending until a successful state read', async () => {
    const h = await harness({ post: async () => { throw Error('超时') } })
    h.api.get = async () => { throw Error('离线') }
    await h.page.onResolveLife()
    assert.equal(h.page.data.lifeFailed, true)
    assert.equal(h.page.data.life, null)
    await h.page.onResolveLife()
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1)
  })
  test('building previews explain unlocks and day scenes reflect owned locations', () => {
    assert.match(buildingLife['宠物医院'], /同时拥有宠物/)
    assert.match(describeBuilding({ name: '消防站' }, {}).lifeHint, /1 金币/)
    assert.match(townPlots([{ id: 1, name: '医院' }]).buildings[0].lifeHint, /感冒/)
    assert.match(townScene(['公园'], 12).description, /公园/)
    assert.equal(townScene([], 22).evening, true)
    assert.equal(presentLife(fixture()).hasVet, false)
    const sick = fixture(); sick.event.kind = 'pet_sick'
    assert.equal(presentLife(sick).petResting, true)
    sick.event = null
    assert.equal(presentLife(sick).petResting, false)
  })

  test('map walking follows pet ownership and page visibility without changing resources', async () => {
    const server = fixture(); server.pets.forEach(pet => { pet.owned = true })
    const h = await harness({ server })
    assert.equal(h.page.data.walkers.filter(a => a.type === 'pet').length, 2)
    const before = structuredClone(h.page.data.walkers)
    h.strollClock.tick(10000)
    assert.notDeepEqual(h.page.data.walkers, before)
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    assert.equal(h.page.data.town.coins, 25)
    h.page.onHide()
    assert.equal(h.strollClock.pending(), 0)
    const hidden = structuredClone(h.page.data.walkers)
    h.strollClock.tick(60000)
    assert.deepEqual(h.page.data.walkers, hidden)
    h.page.onShow(); await h.page._loadPromise
    assert.ok(h.strollClock.pending() > 0)
    server.event.kind = 'pet_sick'; h.page.applyLife(server)
    assert.equal(h.page.data.walkers.filter(a => a.type === 'pet').length, 0)
    server.event = null; h.page.applyLife(server)
    assert.equal(h.page.data.walkers.filter(a => a.type === 'pet').length, 2)
    h.page.onUnload()
    assert.equal(h.strollClock.pending(), 0)
  })
}
