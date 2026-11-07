const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRun, controlRun, stepRun, jumpHeight, runView } = require('../miniapp/subway/utils/runner')
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
    navigateBack: value => navigation.push(value), switchTab: value => navigation.push(value), redirectTo: value => navigation.push(value)
  }
  const api = { get(url) { calls.push(url); return options.get ? options.get() : Promise.resolve({ buildings: options.locked ? [] : [{ name: '地铁站' }] }) } }
  const definition = createRunnerPage(api, wxApi, { random: seededRandom() })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), updates: 0, setData(patch) { this.updates++; Object.assign(this.data, patch) } }
  const loaded = page.onLoad()
  page.onReady(); page.onShow()
  return { page, loaded, storage, frames, calls, writes, navigation,
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

  test('jump clears barriers and slide clears overhead signs; the wrong action hits', () => {
    for (const [kind, action, lives] of [['barrier','jump',3],['sign','slide',3],['barrier','slide',2],['sign','jump',2],['train','jump',2],['train','slide',2]]) {
      const run = running(); controlRun(run, action); advance(run, 0.3)
      run.objects.push({ id: 90, kind, lane: 1, z: 0.5 }); advance(run, 0.05)
      assert.equal(run.lives, lives, kind + ' / ' + action)
    }
  })

  test('changing lanes avoids trains, but an unfinished lane change still collides', () => {
    const run = running(); controlRun(run, 'left'); advance(run, 0.25)
    run.objects.push({ id: 90, kind: 'train', lane: 1, z: 0.5 }); advance(run, 0.05)
    assert.equal(run.lives, 3)
    const late = running(); controlRun(late, 'left')
    late.objects.push({ id: 90, kind: 'train', lane: 1, z: 0.05 }); advance(late, 0.02)
    assert.equal(late.lives, 2)
  })

  test('stars count once, temporary invulnerability prevents duplicate hits, third hit ends the run', () => {
    const run = running()
    run.objects = [{ id: 90, kind: 'star', lane: 1, z: 0.1 }]
    advance(run, 0.2); assert.equal(run.stars, 1)
    assert.equal(run.score, Math.floor(run.distance) + 25)
    for (let hit = 0; hit < 3; hit++) {
      run.objects = [{ id: 91, kind: 'train', lane: 1, z: 0.1 }, { id: 92, kind: 'barrier', lane: 1, z: 0.11 }]
      run.immune = 0; advance(run, 0.05)
      assert.equal(run.lives, 2 - hit)
    }
    assert.equal(run.status, 'over')
    const saved = JSON.stringify(run); advance(run, 3); controlRun(run, 'jump')
    assert.equal(JSON.stringify(run), saved)
    assert.equal(runView(run).hearts, '♡♡♡')
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
      const hazards = fresh.filter(item => item.kind !== 'star'), stars = fresh.filter(item => item.kind === 'star')
      assert.ok(new Set(hazards.map(item => item.lane)).size < 3)
      assert.ok(stars.every(star => hazards.every(hazard => hazard.lane !== star.lane)))
      hazards.forEach(item => kinds.add(item.kind))
      assert.ok(run.objects.length < 35)
    }
    assert.ok(rows > 100)
    assert.equal(run.speed, 31)
    assert.deepEqual([...kinds].sort(), ['barrier','sign','train'])
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
    const retry = harness({ get: async () => { if (fail) throw Error('offline'); return { buildings: [{ name: '地铁站' }] } } }); await retry.loaded
    assert.equal(retry.page.data.phase, 'error'); fail = false; await retry.page.onRetry()
    assert.equal(retry.page.data.phase, 'ready')
    const login = harness({ storage: { token: '' } }); await login.loaded
    assert.equal(login.page.data.phase, 'login'); assert.equal(login.calls.length, 0)
  })

  test('touch gestures and buttons control the same run, one action per swipe', async () => {
    const h = harness(); await h.loaded; h.page.onStart()
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
    h.page.onStart(); h.frame(1000); h.frame(1017)
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
    const h = harness(); await h.loaded; h.page.onStart(); h.frame(1000); h.frame(1017)
    const stale = [...h.frames.values()][0], distance = h.page._run.distance
    h.page.onHide(); assert.equal(h.frames.size, 0); assert.equal(h.page.data.phase, 'paused')
    stale(50000); assert.equal(h.page._run.distance, distance)
    h.page.onShow(); assert.equal(h.frames.size, 0)
    h.page.onResume(); h.frame(60000); assert.equal(h.page._run.distance, distance)
    h.frame(60017); assert.ok(h.page._run.distance - distance < 1)
    h.page.onUnload(); const updates = h.page.updates; stale(90000)
    assert.equal(h.frames.size, 0); assert.equal(h.page.updates, updates)
  })

  test('restart resets the whole run and preserves account-local best without wallet writes', async () => {
    const h = harness(); await h.loaded; h.page.onStart()
    h.page._run.distance = 123; h.page._run.score = 198; h.page._run.stars = 3; h.page._run.lives = 1
    h.page._run.objects = [{ id: 99, kind: 'train', lane: 1, z: 0.05 }]
    h.frame(1000); h.frame(1034)
    assert.equal(h.page.data.phase, 'over'); assert.equal(h.frames.size, 0)
    assert.equal(h.page.data.newRecord, true)
    const best = h.page.data.best
    h.page.onStart(); assert.equal(h.page._run.lives, 3); assert.equal(h.page._run.stars, 0); assert.equal(h.page._run.distance, 0)
    assert.equal(h.page.data.best, best)
    assert.ok(h.writes.every(key => key === 'subwayRecord:v1:local:7'))
    assert.deepEqual(h.calls, ['/buildings/my-town'])
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
    h.page.onStart(); assert.equal(h.frames.size, 0)
  })

  test('unload ignores pending ownership and broken canvas/storage have usable recovery', async () => {
    let resolve
    const pending = harness({ get: () => new Promise(done => { resolve = done }) }); await Promise.resolve()
    pending.page.onUnload(); const updates = pending.page.updates
    resolve({ buildings: [{ name: '地铁站' }] }); await pending.loaded
    assert.equal(pending.page.updates, updates)
    const h = harness({ canvasMissing: true, storageFails: true }); await h.loaded
    h.page.onStart(); assert.equal(h.frames.size, 0); assert.ok(h.page.data.canvasError)
    h.canvasMissing(false); h.page.onRetryCanvas(); h.page.onStart(); assert.equal(h.frames.size, 1)
    h.page._run.score = 75; h.page.saveRecord(); assert.equal(h.page.data.recordSaveFailed, true)
    assert.equal(h.page.data.best, 75); assert.equal(h.page.data.phase, 'running')
    h.page.onUnload()
  })
}
