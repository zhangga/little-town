const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRun, controlRun, stepRun, jumpHeight, runView } = require('../miniapp/subway/utils/runner')
const { createSubwayFixture } = require('./subway-fixture.cjs')
const { createEconomy } = require('../miniapp/subway/utils/runner-economy')
const { createRunnerPage } = require('../miniapp/subway/utils/runner-page')
const { presentBuilding } = require('../miniapp/utils/town-shop')
const { createBuildingInterior } = require('../miniapp/utils/building-interior')

function advance(run, seconds, random = () => 0.5) {
  for (let t = 0; t < seconds - 0.000001; t += 1 / 60) stepRun(run, Math.min(1 / 60, seconds - t), random)
}
function running() { const run = createRun(); controlRun(run, 'start'); run.objects = []; return run }
function seededRandom(seed = 1729) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) }
function harness(options = {}) {
  const storage = { token: 'session-a', apiBackend: 'local', userInfo: { id: 7 }, ...options.storage }
  const server = options.server || createSubwayFixture({ locked: options.locked, tokens: options.tokens })
  const frames = new Map(), calls = [], navigation = [], writes = []
  let nextFrame = 0, canvasMissing = !!options.canvasMissing
  const ctx = new Proxy({}, { get(target, key) { return target[key] || (key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}) } })
  const canvas = {
    getContext: () => ctx,
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id },
    cancelAnimationFrame(id) { frames.delete(id) }
  }
  const wxApi = {
    getStorageSync: key => storage[key],
    setStorageSync(key, value) { if (options.storageFails) throw Error('full'); writes.push(key); storage[key] = value },
    getWindowInfo: () => ({ pixelRatio: 2 }),
    createSelectorQuery: () => ({
      selections: [], in() { return this }, select(selector) { this.selections.push(selector); return this }, fields() { return this },
      exec(fn) {
        fn(canvasMissing ? [] : this.selections.map(selector => selector === '#runner-canvas'
          ? { node: canvas, width: options.canvasHidden ? 0 : 375, height: options.canvasHidden ? 0 : 470 }
          : { width: 375, height: 470 }))
      }
    }),
    showModal: args => args.success({ confirm: true }),
    navigateBack: value => navigation.push(value), switchTab: value => navigation.push(value), redirectTo: value => navigation.push(value)
  }
  const api = { get(url) { calls.push(url); return options.get ? options.get(url) : server.get(url) }, post(url, body) { calls.push(url); return options.post ? options.post(url, body, server) : server.post(url, body) } }
  const definition = createRunnerPage(api, wxApi, { random: seededRandom() })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), updates: 0, setData(patch) { this.updates++; Object.assign(this.data, patch) } }
  const loaded = page.onLoad()
  page.onReady(); page.onShow()
  return { page, loaded, storage, frames, calls, writes, navigation, server,
    frame(time) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)) },
    canvasMissing(value) { canvasMissing = value }
  }
}

module.exports = { harness, seededRandom }

if (require.main === module) {
  test('station is buildable, has its own local art and opens only from an active station', () => {
    const seed = require('../backend/data/buildings.json')
    const station = seed.find(item => item.name === '地铁站')
    assert.equal(station.cost_bricks, 15)
    const sprite = require('../miniapp/utils/assets').townSprite(station.name)
    assert.ok(fs.existsSync(path.resolve(__dirname, '../miniapp' + sprite.image)))
    assert.equal(presentBuilding(station, null).interior.theme, 'subway')
    const navigation = []
    const page = { data: { sceneActive: true, selected: station }, ...createBuildingInterior({}, { navigateTo: value => navigation.push(value) }, () => {}) }
    page.onOpenSubwayRunner(); page.onOpenSubwayRunner()
    assert.equal(navigation.length, 1)
    assert.equal(navigation[0].url, '/subway/pages/run/run')
    navigation[0].complete()
    for (const patch of [{ lifeBusy: true }, { refreshing: true }, { sceneActive: false }, { selected: { name: '学校' } }]) {
      page.data = { sceneActive: true, selected: station, ...patch }; page.onOpenSubwayRunner()
    }
    assert.equal(navigation.length, 1)
  })

  test('lane boundaries, jump and slide inputs are gated by game phase', () => {
    const run = createRun()
    controlRun(run, 'left'); assert.equal(run.lane, 1)
    controlRun(run, 'start')
    for (let i = 0; i < 5; i++) controlRun(run, 'left')
    assert.equal(run.lane, 0)
    for (let i = 0; i < 5; i++) controlRun(run, 'right')
    assert.equal(run.lane, 2)
    controlRun(run, 'jump'); advance(run, 0.35)
    assert.ok(jumpHeight(run) > 0.8)
    const remaining = run.actionTime
    controlRun(run, 'jump'); controlRun(run, 'slide')
    assert.equal(run.actionTime, remaining)
    advance(run, 0.7); controlRun(run, 'slide'); assert.equal(run.action, 'slide')
    advance(run, 1); assert.equal(run.action, '')
  })

  test('jump clears barriers, duck clears signs, vehicles capture immediately', () => {
    for (const [kind, action, result] of [['barrier','jump','safe'],['sign','slide','safe'],['barrier','slide','stumble'],['sign','jump','stumble'],['train','jump','caught'],['truck','slide','caught']]) {
      const run = running(); controlRun(run, action); advance(run, 0.3)
      run.objects.push({ id: 90, kind, lane: 1, z: 0.5 }); advance(run, 0.05)
      assert.equal(run.status, result === 'caught' ? 'caught' : 'running', kind + ' / ' + action)
      assert.equal(run.chase > 0, result === 'stumble')
    }
  })
  test('changing lanes avoids trains, but an unfinished lane change still collides', () => {
    const run = running(); controlRun(run, 'left'); advance(run, 0.25)
    run.objects.push({ id: 90, kind: 'train', lane: 1, z: 0.5 }); advance(run, 0.05)
    assert.equal(run.status, 'running')
    const late = running(); controlRun(late, 'left')
    late.objects.push({ id: 90, kind: 'train', lane: 1, z: 0.05 }); advance(late, 0.02)
    assert.equal(late.status, 'caught')
  })
  test('one stumble brings the chaser close, a second captures, eight safe seconds recover', () => {
    const hit = (run, kind = 'barrier') => { run.objects = [{ id: 99, kind, lane: 1, z: 0.1 }]; advance(run, 0.02) }
    const run = running(); hit(run)
    assert.ok(run.stun > 0 && run.chase > 7); assert.equal(run.status, 'running')
    hit(run); assert.equal(run.status, 'running', 'same-impact grace prevents a duplicate hit')
    advance(run, 1); hit(run, 'sign'); assert.equal(run.status, 'caught')
    const distance = run.distance, elapsed = run.elapsed
    advance(run, 1); assert.equal(run.status, 'caught'); assert.equal(run.distance, distance); assert.equal(run.elapsed, elapsed)
    controlRun(run, 'pause'); const time = run.captureTime; advance(run, 1); assert.equal(run.captureTime, time)
    controlRun(run, 'resume'); advance(run, 1.3); assert.equal(run.status, 'over')
    const recovered = running(); hit(recovered); advance(recovered, 8.1); hit(recovered)
    assert.equal(recovered.status, 'running'); assert.ok(recovered.chase > 7)
  })
  test('a skateboard absorbs one vehicle or sign collision and restores safety', () => {
    for (const kind of ['train', 'truck', 'barrier', 'sign']) {
      const run = running(); run.chase = 4; controlRun(run, 'board')
      assert.equal(run.boards, 0); assert.equal(run.boardTime, 12)
      run.objects = [{ id: 90, kind, lane: 1, z: 0.1 }]; advance(run, 0.02)
      assert.equal(run.status, 'running'); assert.equal(run.boardTime, 0); assert.equal(run.chase, 0)
      advance(run, 1.4); run.objects = [{ id: 91, kind: 'train', lane: 1, z: 0.1 }]; advance(run, 0.02)
      assert.equal(run.status, 'caught', kind)
    }
    const run = running(); controlRun(run, 'board'); advance(run, 12.1)
    assert.equal(run.boardTime, 0); controlRun(run, 'board'); assert.equal(run.boardTime, 0)
  })
  test('springboard launches above trains to collect airborne stars', () => {
    const run = running()
    run.objects = [{ id: 90, kind: 'spring', lane: 1, z: 0.1 }, { id: 91, kind: 'star', lane: 1, z: 17, height: 1.3 }, { id: 92, kind: 'train', lane: 1, z: 19 }]
    advance(run, 0.02); assert.equal(run.action, 'spring')
    advance(run, 1.1); assert.equal(run.stars, 1); assert.equal(run.status, 'running'); assert.ok(jumpHeight(run) > 1.2)
    const ground = running(); ground.objects = [{ id: 90, kind: 'star', lane: 1, z: 0.1, height: 1.3 }]; advance(ground, 0.1); assert.equal(ground.stars, 0)
  })
  test('coins and stars count once; magnets pull coins across lanes; boards cap at three', () => {
    const run = running(); run.objects = [{ id: 90, kind: 'coin', lane: 1, z: 0.1 }, { id: 91, kind: 'star', lane: 1, z: 0.1 }]
    advance(run, 0.2); assert.equal(run.coins, 1); assert.equal(run.stars, 1)
    assert.equal(run.score, Math.floor(run.distance) + 55); assert.equal(runView(run).runTokens, 6)
    run.objects = [{ id: 92, kind: 'magnet', lane: 1, z: 0.1 }, { id: 93, kind: 'coin', lane: 0, z: 5 }, { id: 94, kind: 'coin', lane: 2, z: 10 }]
    advance(run, 0.1); assert.equal(run.coins, 3); assert.ok(run.magnet > 7)
    run.objects = [95,96,97,98].map(id => ({ id, kind: 'board', lane: 1, z: 0.1 })); advance(run, 0.1); assert.equal(run.boards, 3)
  })

  test('pause freezes the full simulation and frame stalls cannot skip rows', () => {
    const run = running(); advance(run, 1); controlRun(run, 'pause')
    const saved = JSON.stringify(run); advance(run, 5); controlRun(run, 'left')
    assert.equal(JSON.stringify(run), saved)
    controlRun(run, 'resume'); stepRun(run, 100)
    assert.ok(run.distance < 21)
    const distance = run.distance
    stepRun(run, NaN); stepRun(run, -1); assert.equal(run.distance, distance)
  })

  test('procedural rows always have a clear lane and bounded object counts as speed increases', () => {
    const run = running(), random = seededRandom(), kinds = new Set()
    run.immune = 1e6
    let previousID = 6, rows = 0
    for (let i = 0; i < 18000; i++) {
      stepRun(run, 1 / 60, random)
      const fresh = run.objects.filter(item => item.id > previousID)
      if (!fresh.length) continue
      previousID = run.nextID - 1; rows++
      const hazards = fresh.filter(item => ['train','truck','sign','barrier'].includes(item.kind)), stars = fresh.filter(item => item.kind === 'star')
      assert.ok(new Set(hazards.map(item => item.lane)).size < 3)
      assert.ok(stars.every(star => hazards.every(hazard => hazard.lane !== star.lane)))
      hazards.forEach(item => kinds.add(item.kind))
      assert.ok(run.objects.length < 45)
    }
    assert.ok(rows > 100)
    assert.equal(run.speed, 32)
    assert.deepEqual([...kinds].sort(), ['barrier','sign','train','truck'])
  })

  test('simulation stays consistent across 30 and 60 FPS', () => {
    const a = running(), b = running()
    a.immune = b.immune = 100
    const randomA = seededRandom(), randomB = seededRandom()
    for (let i = 0; i < 900; i++) stepRun(a, 1 / 30, randomA)
    for (let i = 0; i < 1800; i++) stepRun(b, 1 / 60, randomB)
    assert.ok(Math.abs(a.distance - b.distance) < 0.001)
    assert.equal(a.stars, b.stars); assert.equal(a.score, b.score)
  })

  test('page requires ownership, shows a build route, and retries network errors', async () => {
    const locked = harness({ locked: true }); await locked.loaded
    assert.equal(locked.page.data.phase, 'locked'); locked.page.onStart(); assert.equal(locked.frames.size, 0)
    locked.page.onGoBuild(); assert.equal(locked.navigation[0].url, '/pages/build/build')
    let fail = true
    const retry = harness({ get: async url => { if (fail) throw Error('offline'); return createSubwayFixture().get(url) } }); await retry.loaded
    assert.equal(retry.page.data.phase, 'error'); fail = false; await retry.page.onRetry()
    assert.equal(retry.page.data.phase, 'ready')
    const login = harness({ storage: { token: '' } }); await login.loaded
    assert.equal(login.page.data.phase, 'login'); assert.equal(login.calls.length, 0)
  })

  test('touch gestures and buttons control the same run, one action per swipe', async () => {
    const h = harness(); await h.loaded; await h.page.onStart()
    const gesture = (x, y) => ({ changedTouches: [{ clientX: x, clientY: y }] })
    h.page.onTouchStart(gesture(100,200)); h.page.onTouchMove(gesture(150,200)); h.page.onTouchEnd(gesture(200,200))
    assert.equal(h.page._run.lane, 2)
    h.page.onControl({ currentTarget: { dataset: { action: 'left' } } }); assert.equal(h.page._run.lane, 1)
    h.page.onTouchStart(gesture(100,200)); h.page.onTouchEnd(gesture(100,130)); assert.equal(h.page._run.action, 'jump')
    h.page.onHide()
    h.page.onControl({ currentTarget: { dataset: { action: 'right' } } }); assert.equal(h.page._run.lane, 1)
  })

  test('a canvas hidden behind the start or pause card initializes from the stage dimensions', async () => {
    const h = harness({ canvasHidden: true }); await h.loaded
    assert.equal(h.page.data.canvasReady, true)
    assert.equal(h.page.data.canvasError, '')
    assert.equal(h.page._width, 375)
    assert.equal(h.page._height, 470)
    await h.page.onStart(); h.frame(1000); h.frame(1017)
    assert.equal(h.page.data.phase, 'running')
    assert.ok(h.page._run.distance > 0)
    h.page.onPause(); h.page.onResize()
    assert.equal(h.page.data.phase, 'paused')
    assert.equal(h.page.data.canvasReady, true)
    h.page.onResume(); h.frame(2000); h.frame(2017)
    assert.equal(h.page.data.phase, 'running')
    assert.ok(h.page._run.distance > 0.3)
    h.page.onUnload()
  })

  test('hide cancels frames, resume has no background time jump, unload prevents stale callbacks', async () => {
    const h = harness(); await h.loaded; await h.page.onStart(); h.frame(1000); h.frame(1017)
    const stale = [...h.frames.values()][0], distance = h.page._run.distance
    h.page.onHide(); assert.equal(h.frames.size, 0); assert.equal(h.page.data.phase, 'paused')
    stale(50000); assert.equal(h.page._run.distance, distance)
    h.page.onShow(); assert.equal(h.frames.size, 0)
    h.page.onResume(); h.frame(60000); assert.equal(h.page._run.distance, distance)
    h.frame(60017); assert.ok(h.page._run.distance - distance < 1)
    h.page.onUnload(); const updates = h.page.updates; stale(90000)
    assert.equal(h.frames.size, 0); assert.equal(h.page.updates, updates)
  })

  test('ending and restarting settles collected tokens once, resets play and keeps best', async () => {
    const h = harness(); await h.loaded; await h.page.onStart()
    h.page._run.distance = 123; h.page._run.elapsed = 7; h.page._run.score = 298; h.page._run.stars = 3; h.page._run.coins = 5
    await h.page.onEndRun()
    assert.equal(h.page.data.phase, 'over'); assert.equal(h.frames.size, 0)
    assert.equal(h.page.data.awarded, 20); assert.equal(h.page.data.economy.tokens, 20)
    const best = h.page.data.best
    await h.page.onSettle(); assert.equal(h.page.data.economy.tokens, 20)
    await h.page.onStart(); assert.equal(h.page._run.boards, 1); assert.equal(h.page._run.stars, 0); assert.equal(h.page._run.distance, 0)
    assert.equal(h.page.data.best, best)
    assert.ok(h.writes.every(key => /^subway(Record:v1|Pending:v2):local:7$/.test(key)))
    h.page.onUnload()
  })

  test('account changes ignore old ownership responses and isolate scores', async () => {
    const resolvers = []
    const h = harness({ get: () => new Promise(resolve => resolvers.push(resolve)) })
    await Promise.resolve()
    h.storage.userInfo = { id: 8 }; h.storage.token = 'session-b'
    h.storage['subwayRecord:v1:local:8'] = { best: 500 }
    const newer = h.page.onShow(); await Promise.resolve()
    resolvers[0]({ buildings: [{ name: '地铁站' }] }); await h.loaded
    assert.equal(h.page.data.phase, 'loading'); assert.equal(h.page.data.best, 500)
    resolvers[1]({ buildings: [] }); await newer; assert.equal(h.page.data.phase, 'locked')
    await h.page.onStart(); assert.equal(h.frames.size, 0)
  })

  test('unload ignores pending ownership and broken canvas/storage have usable recovery', async () => {
    let resolve
    const pending = harness({ get: () => new Promise(done => { resolve = done }) }); await Promise.resolve()
    pending.page.onUnload(); const updates = pending.page.updates
    resolve({ buildings: [{ name: '地铁站' }] }); await pending.loaded
    assert.equal(pending.page.updates, updates)
    const h = harness({ canvasMissing: true, storageFails: true }); await h.loaded
    await h.page.onStart(); assert.equal(h.frames.size, 0); assert.ok(h.page.data.canvasError)
    h.canvasMissing(false); h.page.onRetryCanvas(); await h.page.onStart(); assert.equal(h.frames.size, 1)
    h.page._run.score = 75; h.page.saveRecord(); assert.equal(h.page.data.recordSaveFailed, true)
    assert.equal(h.page.data.best, 75); assert.equal(h.page.data.phase, 'running')
    h.page.onUnload()
  })
}

if (require.main === module) {
  test('lost settlement response survives reload and never awards twice', async () => {
    let lose = true
    const h = harness({ post: async (url, body, server) => {
      const result = await server.post(url, body)
      if (url === '/subway/finish' && lose) { lose = false; throw Error('response lost') }
      return result
    } }); await h.loaded; await h.page.onStart()
    h.page._run.coins = 10; h.page._run.stars = 2; h.page._run.distance = 100; h.page._run.elapsed = 6
    await h.page.onEndRun()
    assert.equal(h.page.data.pendingReward, true); assert.equal(h.server.state.tokens, 20)
    const run = h.storage['subwayPending:v2:local:7'].finish.run_id
    await h.page.onStart(); assert.equal(h.page._sessionID, run, 'unsettled run cannot be replaced')
    h.page.onUnload()
    const reloaded = harness({ storage: h.storage, server: h.server }); await reloaded.loaded
    assert.equal(reloaded.page.data.pendingReward, false); assert.equal(reloaded.page.data.economy.tokens, 20)
    assert.equal(reloaded.storage['subwayPending:v2:local:7'].finish, undefined)
    reloaded.page.onUnload()
  })
  test('failed purchase response retries original receipt; business rejection unlocks other items', async () => {
    let lose = true
    const h = harness({ tokens: 200, post: async (url, body, server) => {
      const value = await server.post(url, body)
      if (url === '/subway/purchase' && lose) { lose = false; throw Error('offline') }
      return value
    } }); await h.loaded
    const buy = id => h.page.onShopItem({ currentTarget: { dataset: { id } } })
    await buy('coins'); assert.equal(h.page.data.pendingPurchase.id, 'coins')
    assert.equal(h.server.state.tokens, 150)
    await buy('bricks'); assert.match(h.page.data.economyError, /先完成/)
    await h.page.onRetryPurchase(); assert.equal(h.page.data.pendingPurchase, null)
    assert.equal(h.page.data.economy.tokens, 150); assert.equal(h.page.data.economy.wallet.coins, 110)
    await buy('aurora'); assert.match(h.page.data.economyError, /还不够/)
    assert.equal(h.page.data.pendingPurchase, null)
    await buy('sunset'); assert.equal(h.page.data.economy.tokens, 30); assert.equal(h.page.data.economy.equipped, 'sunset')
    await buy('mint'); assert.equal(h.page.data.economy.equipped, 'mint'); assert.equal(h.page.data.economy.tokens, 30)
  })
  test('pending purchases are visible after reloading the station', async () => {
    const server = createSubwayFixture({ tokens: 100 })
    const request = { item_id: 'coins', request_id: 'lost-response-0001' }
    await server.post('/subway/purchase', request)
    const h = harness({ server, storage: { 'subwayPending:v2:local:7': { purchase: request } } }); await h.loaded
    assert.equal(h.page.data.pendingPurchase.id, 'coins')
    await h.page.onRetryPurchase(); assert.equal(h.page.data.economy.tokens, 50); assert.equal(h.page.data.economy.wallet.coins, 110)
  })
  test('storage failure never settles an older checkpoint and leaving retains the live result', async () => {
    const options = {}
    const h = harness(options); await h.loaded; await h.page.onStart()
    h.page._run.coins = 9; h.page._run.distance = 100; h.page._run.elapsed = 6
    options.storageFails = true
    await h.page.onEndRun()
    assert.equal(h.calls.includes('/subway/finish'), false)
    assert.equal(h.page.data.pendingReward, true)
    await h.page.onBack(); assert.equal(h.navigation.length, 0)
    options.storageFails = false
    await h.page.onSettle(); assert.equal(h.page.data.economy.tokens, 9)
  })
  test('a start response after hiding creates a paused game; account switches reject stale results', async () => {
    let resolve
    const h = harness({ post: (url, body, server) => new Promise(done => { resolve = async () => done(await server.post(url, body)) }) }); await h.loaded
    const started = h.page.onStart(); h.page.onHide(); await resolve(); await started
    assert.equal(h.page.data.phase, 'paused'); assert.equal(h.frames.size, 0)
    h.page.onUnload()
    const other = harness({ post: (url, body, server) => new Promise(done => { resolve = async () => done(await server.post(url, body)) }) }); await other.loaded
    const stale = other.page.onStart()
    other.storage.userInfo = { id: 8 }; other.storage.token = 'session-b'
    await other.page.onShow(); await resolve(); await stale
    assert.equal(other.page.data.phase, 'ready'); assert.equal(other.page._sessionID, null)
    assert.equal(other.page.data.economyBusy, false); assert.equal(other.frames.size, 0)
  })
  test('economy refuses calls and storage mutations after the account changes', async () => {
    let current = true, resolve
    const storage = {}; let writes = 0
    const economy = createEconomy({ post: () => new Promise(done => { resolve = done }) }, { getStorageSync: key => storage[key], setStorageSync: (key,value) => { storage[key] = value; writes++ } }, 'one', () => current)
    economy.checkpoint({ coins: 1, stars: 0, distance: 20, elapsed: 2 }, 'run-one')
    const pending = economy.settle(); current = false
    resolve({ tokens: 1 }); await assert.rejects(pending, /账号已切换/)
    assert.equal(writes, 1); assert.equal(storage['subwayPending:v2:one'].finish.run_id, 'run-one')
    await assert.rejects(economy.start(), /账号已切换/)
  })
  test('mall offers the starcoin counter only from an active shop', () => {
    const navigation = []
    const page = { data: { sceneActive: true, selected: { name: '商店' } }, ...createBuildingInterior({}, { navigateTo: value => navigation.push(value) }, () => {}) }
    page.onOpenSubwayShop(); assert.equal(navigation[0].url, '/subway/pages/run/run?shop=1')
    page.data.sceneActive = false; page.onOpenSubwayShop(); assert.equal(navigation.length, 1)
  })
}
