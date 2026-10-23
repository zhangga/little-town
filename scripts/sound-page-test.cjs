const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function loadUtility(name, sound, loadPackage = () => {}) {
  const filename = path.resolve(__dirname, '../miniapp/utils/' + name + '.js')
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, setTimeout, clearTimeout,
    require: (request, ...args) => request === './sound' ? sound : loadPackage(request, ...args)
  }, { filename })
  return module.exports
}

const tap = () => ({ type: 'tap', currentTarget: { dataset: {} } })

test('tap wrapping preserves context, arguments and promise identity without sounding on input or programmatic calls', async () => {
  const calls = []
  const sound = { playEffect: kind => calls.push(kind), retryMusic: () => calls.push('retry') }
  const { withTapSounds } = loadUtility('sound-page', sound)
  const promise = Promise.resolve('saved')
  const event = tap()
  const seen = []
  const original = {
    data: { count: 0 },
    onSave(...args) { seen.push({ self: this, args }); return promise }
  }
  const page = withTapSounds(original)
  assert.equal(page.onSave(event, 'extra'), promise)
  assert.equal(seen[0].self, page)
  assert.equal(seen[0].args[0], event)
  assert.equal(seen[0].args[1], 'extra')
  assert.equal(page.data, original.data)
  assert.deepEqual(calls, ['retry', 'tap'])
  calls.length = 0
  page.onSave()
  page.onSave({ type: 'input' })
  page.onSave({ type: 'change' })
  assert.deepEqual(calls, [])
  assert.equal(await promise, 'saved')
})

test('delegated handlers play one tap, while no-op, speech and sound switches stay quiet', () => {
  const calls = []
  const { withTapSounds } = loadUtility('sound-page', {
    playEffect: kind => calls.push(kind), retryMusic: () => calls.push('retry')
  })
  const page = withTapSounds({
    onOuter(event) { return this.onInner(event) }, onInner() { return 42 },
    onNoop() {}, onPlayAudio() {}, onToggleMusic() {}, onToggleEffects() {}
  })
  assert.equal(page.onOuter(tap()), 42)
  assert.deepEqual(calls, ['retry', 'tap'])
  calls.length = 0
  for (const name of ['onNoop', 'onPlayAudio', 'onToggleMusic', 'onToggleEffects']) page[name](tap())
  assert.deepEqual(calls, [])
})

test('an explicitly mapped interaction plays its opening effect once instead of an extra tap', () => {
  const effects = []
  const { withTapSounds } = loadUtility('sound-page', {
    playEffect: kind => effects.push(kind), retryMusic() {}
  })
  const page = withTapSounds({
    onPlotTap(event) { return this.onInner(event) }, onInner() { return 'opened' }, onOther() {}
  }, { onPlotTap: 'open' })
  assert.equal(page.onPlotTap(tap()), 'opened')
  assert.deepEqual(effects, ['open'])
  page.onOther(tap())
  assert.deepEqual(effects, ['open', 'tap'])
})

test('sound failures do not alter handler results or mask handler errors, and the nesting guard resets', () => {
  const { withTapSounds } = loadUtility('sound-page', {
    playEffect() { throw Error('audio unavailable') }, retryMusic() { throw Error('music unavailable') }
  })
  const failure = Error('handler failed')
  const page = withTapSounds({ onGood() { return 'ok' }, onFail() { throw failure } })
  assert.equal(page.onGood(tap()), 'ok')
  assert.throws(() => page.onFail(tap()), err => err === failure)
  assert.equal(page.onGood(tap()), 'ok')
})

function audioMock() {
  const contexts = []
  return {
    contexts,
    createInnerAudioContext() {
      const callbacks = {}
      const player = {
        callbacks, onPlay: fn => { callbacks.play = fn }, onEnded: fn => { callbacks.end = fn },
        onError: fn => { callbacks.error = fn }, play() { callbacks.play() },
        destroy() { player.destroyed = true }
      }
      contexts.push(player)
      return player
    }
  }
}

test('automatic pronunciation claims the gesture before tap feedback and releases speech on end or stop', () => {
  let speech = false
  const effects = []
  const sound = {
    setSpeechActive: value => { speech = value }, retryMusic() {},
    playEffect: kind => { if (!speech) effects.push(kind) }
  }
  const wx = audioMock()
  const { createPronunciation } = loadUtility('pronunciation', sound)
  const { withTapSounds } = loadUtility('sound-page', sound)
  const player = createPronunciation(wx, () => {})
  const page = withTapSounds({ onStart() { player.play({ audio: '/word.mp3' }) } })
  page.onStart(tap())
  assert.equal(speech, true)
  assert.deepEqual(effects, [])
  wx.contexts[0].callbacks.end()
  assert.equal(speech, false)
  player.play({ audio: '/next.mp3' })
  assert.equal(speech, true)
  wx.contexts[0].callbacks.end()
  assert.equal(speech, true, 'stale word completion cannot restore background audio')
  player.stop()
  assert.equal(speech, false)
})

test('speech stays active while its subpackage loads and clears on cancellation and playback/package failure', () => {
  let speech = false
  const loads = []
  const states = []
  const sound = { setSpeechActive: value => { speech = value } }
  const wx = audioMock()
  const { createPronunciation } = loadUtility('pronunciation', sound, (name, success, fail) => loads.push({ success, fail }))
  const player = createPronunciation(wx, state => states.push(state.audioState))
  const word = { audio: '/word.mp3', audioPackage: 'textbook-audio' }
  player.play(word)
  assert.equal(speech, true)
  assert.equal(wx.contexts.length, 0)
  player.stop()
  loads[0].success()
  assert.equal(speech, false)
  assert.equal(wx.contexts.length, 0)
  player.play(word)
  wx.contexts[0].callbacks.error()
  assert.equal(speech, false)
  assert.equal(states.at(-1), 'error')
  player.play({ audio: '/different.mp3', audioPackage: 'other' })
  loads[1].fail()
  assert.equal(speech, false)
  assert.equal(states.at(-1), 'error')
  player.play({})
  assert.equal(speech, false)
  player.stop()
})

function pageHarness(name) {
  const filename = path.resolve(__dirname, '../miniapp/pages/' + name + '/' + name + '.js')
  const localRequire = createRequire(filename)
  const effects = []
  const sound = { retryMusic() {}, playEffect: kind => effects.push(kind) }
  const { withTapSounds } = loadUtility('sound-page', sound)
  const api = {}
  let page
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: value => { page = value }, clearTimeout,
    wx: { getStorageSync: () => 'token', setStorageSync() {}, vibrateShort() {} },
    require: request => {
      if (request.endsWith('/sound-page')) return { withTapSounds }
      if (request.endsWith('/sound')) return sound
      if (request.endsWith('/api')) return api
      if (request.endsWith('/util')) return { showError() {}, showSuccess() {} }
      if (request.endsWith('/resident')) return { presentResident: value => value, saveWallet() {} }
      return localRequire(request)
    }
  }, { filename })
  page.data = JSON.parse(JSON.stringify(page.data))
  page.setData = patch => Object.assign(page.data, patch)
  page.onLoad()
  return { page, api, effects }
}

test('building feedback waits for a saved build and never sounds after the page is hidden', async () => {
  for (const hidden of [false, true]) {
    const h = pageHarness('build')
    h.page.data.selected = { id: 1, name: '小屋', cost_bricks: 1, can_build: true }
    h.page.data.buildings = [h.page.data.selected]
    let resolve
    h.api.post = () => new Promise(done => { resolve = done })
    const request = h.page.onBuild()
    assert.deepEqual(h.effects, [])
    if (hidden) h.page.onHide()
    resolve({ remaining_bricks: 9 })
    await request
    assert.deepEqual(h.effects, hidden ? [] : ['success'])
  }
})

test('resident feedback waits for a saved mutation and remains silent on hidden or failed results', async () => {
  for (const outcome of ['saved', 'hidden', 'failed']) {
    const h = pageHarness('resident')
    const state = { shop: [], wallet: {} }
    h.api.get = async () => state
    let resolve, reject
    h.api.post = () => new Promise((done, fail) => { resolve = done; reject = fail })
    const request = h.page.mutate('post', '/resident/purchase', {}, 'saved')
    assert.deepEqual(h.effects, [])
    if (outcome === 'hidden') h.page.onHide()
    if (outcome === 'failed') reject(Error('offline'))
    else resolve(state)
    await request
    assert.deepEqual(h.effects, outcome === 'saved' ? ['success'] : [])
  }
})
