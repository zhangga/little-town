const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createSound, STORAGE_KEY } = require('../miniapp/utils/sound')

function harness(options = {}) {
  const contexts = []
  const storage = options.storage || new Map()
  const interruptions = { begin: new Set(), end: new Set() }
  const pending = []
  let clock = 1000
  let loads = 0
  let reads = 0
  let writes = 0
  const api = {
    getStorageSync(key) {
      reads++
      if (options.badStorage) throw Error('storage unavailable')
      return storage.get(key)
    },
    setStorageSync(key, value) {
      writes++
      if (options.badStorage) throw Error('storage unavailable')
      storage.set(key, value)
    },
    onAudioInterruptionBegin(fn) { interruptions.begin.add(fn) },
    onAudioInterruptionEnd(fn) { interruptions.end.add(fn) },
    offAudioInterruptionBegin(fn) { interruptions.begin.delete(fn) },
    offAudioInterruptionEnd(fn) { interruptions.end.delete(fn) },
    createInnerAudioContext() {
      if (options.failCreate) throw Error('audio unavailable')
      const events = { Play: new Set(), Ended: new Set(), Error: new Set() }
      const history = { Play: [], Ended: [], Error: [] }
      const context = {
        events, history, plays: 0, pauses: 0, stops: 0, destroys: 0,
        play() {
          this.plays++
          if (options.failPlay) throw Error('play rejected')
          if (!options.pendingPlay) this.emit('Play')
        },
        pause() { this.pauses++ },
        stop() { this.stops++ },
        destroy() { this.destroys++ },
        emit(event) { Array.from(events[event]).forEach(fn => fn()) }
      }
      Object.keys(events).forEach(event => {
        context['on' + event] = fn => { events[event].add(fn); history[event].push(fn) }
        context['off' + event] = fn => events[event].delete(fn)
      })
      if (options.onCreate) options.onCreate(context)
      contexts.push(context)
      return context
    }
  }
  if (options.noInterruptionAPI) {
    delete api.onAudioInterruptionBegin
    delete api.onAudioInterruptionEnd
  }
  const sound = createSound(api, {
    now: () => clock,
    loadAudioPackage(ready, fail) {
      loads++
      if (options.deferredPackage) pending.push({ ready, fail })
      else if (options.failPackage) fail()
      else ready()
    }
  })
  return {
    sound, api, contexts, storage, pending, interruptions,
    advance(ms) { clock += ms },
    interrupt() { Array.from(interruptions.begin).forEach(fn => fn()) },
    resume() { Array.from(interruptions.end).forEach(fn => fn()) },
    get loads() { return loads }, get reads() { return reads }, get writes() { return writes }
  }
}

test('importing the module never touches wx or loads audio', () => {
  const sandbox = { module: { exports: {} }, require() { throw Error('unexpected require') } }
  Object.defineProperty(sandbox, 'wx', { get() { throw Error('unexpected wx access') } })
  const source = fs.readFileSync(path.resolve(__dirname, '../miniapp/utils/sound.js'), 'utf8')
  assert.doesNotThrow(() => vm.runInNewContext(source, sandbox))
  assert.equal(typeof sandbox.module.exports.enterTown, 'function')
})

test('preferences are lazy, validated, copied, and persisted across sessions independently', () => {
  const storage = new Map([[STORAGE_KEY, { musicEnabled: false, effectsEnabled: 'false' }]])
  const h = harness({ storage })
  assert.equal(h.reads, 0)
  assert.equal(h.loads, 0)
  assert.deepEqual(h.sound.getPreferences(), { musicEnabled: false, effectsEnabled: true })
  const copy = h.sound.getPreferences()
  copy.musicEnabled = true
  h.sound.setEffectsEnabled(false)
  assert.equal(h.reads, 1)
  assert.equal(h.loads, 0)
  assert.equal(h.contexts.length, 0)
  assert.equal(h.writes, 1)
  const next = harness({ storage })
  next.sound.enterTown()
  assert.deepEqual(next.sound.getPreferences(), { musicEnabled: false, effectsEnabled: false })
  assert.equal(next.loads, 0)
})

test('one quiet looping music player survives town return and repeated show/tap retries', () => {
  const h = harness()
  h.sound.setAppVisible(true)
  assert.equal(h.contexts.length, 0)
  h.sound.enterTown()
  const music = h.contexts[0]
  assert.equal(music.src, '/town-audio/audio/cheerful-loop.m4a')
  assert.equal(music.loop, true)
  assert.equal(music.obeyMuteSwitch, true)
  assert.equal(music.autoplay, false)
  assert.ok(music.volume > 0 && music.volume <= 0.25)
  h.sound.enterTown()
  h.sound.setAppVisible(true)
  h.sound.retryMusic()
  assert.equal(music.plays, 1)
  assert.equal(h.contexts.length, 1)
  assert.equal(h.sound.getState().musicStatus, 'playing')
  h.sound.leaveTown()
  assert.equal(music.pauses, 1)
  h.sound.setAppVisible(false)
  h.sound.setAppVisible(true)
  assert.equal(music.plays, 1)
  h.sound.enterTown()
  assert.equal(music.plays, 2)
  assert.equal(h.contexts.length, 1)
  assert.equal(h.loads, 1)
})

test('music waits for foreground, and disabled preferences survive hide/show and town return', () => {
  const h = harness()
  h.sound.setAppVisible(false)
  h.sound.enterTown()
  assert.equal(h.loads, 0)
  h.sound.setAppVisible(true)
  const music = h.contexts[0]
  h.sound.setAppVisible(false)
  assert.equal(h.sound.getState().musicStatus, 'idle')
  h.sound.setMusicEnabled(false)
  h.sound.setAppVisible(true)
  h.sound.leaveTown()
  h.sound.enterTown()
  h.sound.retryMusic()
  assert.equal(music.plays, 1)
  h.sound.setMusicEnabled(true)
  assert.equal(music.plays, 2)
})

test('interruptions stop effects and resume music only with current foreground/town permission', () => {
  const h = harness()
  h.sound.enterTown()
  h.sound.playEffect('open')
  const [music, effect] = h.contexts
  h.interrupt()
  assert.equal(music.pauses, 1)
  assert.equal(effect.stops, 1)
  h.sound.playEffect('success')
  h.sound.retryMusic()
  assert.equal(effect.plays, 1)
  assert.equal(music.plays, 1)
  h.sound.setAppVisible(false)
  h.resume()
  assert.equal(music.plays, 1)
  h.sound.setAppVisible(true)
  assert.equal(music.plays, 2)
  h.interrupt()
  h.sound.leaveTown()
  h.resume()
  assert.equal(music.plays, 2)
  h.sound.enterTown()
  assert.equal(music.plays, 3)
  h.interrupt()
  h.sound.setMusicEnabled(false)
  h.resume()
  assert.equal(music.plays, 3)
})

test('pronunciation suppresses all town audio until it finishes, respecting later mute/exit', () => {
  const h = harness()
  h.sound.enterTown()
  h.sound.playEffect()
  const [music, effect] = h.contexts
  h.sound.setSpeechActive(true)
  assert.equal(music.pauses, 1)
  assert.equal(effect.stops, 1)
  h.advance(100)
  h.sound.playEffect('success')
  h.sound.setAppVisible(true)
  h.sound.retryMusic()
  assert.equal(music.plays, 1)
  assert.equal(effect.plays, 1)
  h.sound.setSpeechActive(false)
  assert.equal(music.plays, 2)
  h.sound.setSpeechActive(true)
  h.sound.setMusicEnabled(false)
  h.sound.setSpeechActive(false)
  assert.equal(music.plays, 2)
  h.sound.setMusicEnabled(true)
  h.sound.setSpeechActive(true)
  h.sound.leaveTown()
  h.sound.setSpeechActive(false)
  assert.equal(music.plays, 3)
})

test('tap effects throttle rapid input, reuse a player, and allow distinct success/open feedback', () => {
  const h = harness()
  h.sound.playEffect()
  const effect = h.contexts[0]
  assert.equal(effect.src, '/town-audio/audio/tap.wav')
  assert.equal(effect.loop, false)
  assert.equal(effect.obeyMuteSwitch, true)
  assert.equal(effect.volume, 0.4)
  h.sound.playEffect('tap')
  assert.equal(effect.plays, 1)
  h.sound.playEffect('success')
  assert.equal(effect.src, '/town-audio/audio/success.wav')
  h.sound.playEffect('open')
  assert.equal(effect.src, '/town-audio/audio/open.wav')
  assert.equal(effect.plays, 3)
  h.advance(80)
  h.sound.playEffect('unknown')
  assert.equal(effect.src, '/town-audio/audio/tap.wav')
  assert.equal(effect.plays, 4)
  assert.equal(h.contexts.length, 1)
  h.sound.setEffectsEnabled(false)
  h.advance(100)
  h.sound.playEffect()
  assert.equal(effect.plays, 4)
  h.sound.setEffectsEnabled(true)
  h.sound.playEffect()
  assert.equal(effect.plays, 5)
})

test('backgrounded effects are suppressed even outside town', () => {
  const h = harness()
  h.sound.setAppVisible(false)
  h.sound.playEffect('success')
  assert.equal(h.loads, 0)
  h.sound.setAppVisible(true)
  h.sound.playEffect('success')
  assert.equal(h.contexts.length, 1)
  h.sound.setAppVisible(false)
  assert.equal(h.contexts[0].stops, 1)
})

test('pending music never duplicates play and stale callbacks cannot change a resumed session', () => {
  const h = harness({ pendingPlay: true })
  h.sound.enterTown()
  const music = h.contexts[0]
  const oldPlay = music.history.Play[0]
  const oldError = music.history.Error[0]
  h.sound.retryMusic()
  assert.equal(music.plays, 1)
  assert.equal(h.sound.getState().musicStatus, 'loading')
  h.sound.leaveTown()
  oldPlay()
  oldError()
  assert.equal(h.sound.getState().musicStatus, 'idle')
  assert.equal(music.destroys, 0)
  h.sound.enterTown()
  oldPlay()
  oldError()
  assert.equal(h.sound.getState().musicStatus, 'loading')
  assert.equal(music.destroys, 0)
  music.emit('Play')
  assert.equal(h.sound.getState().musicStatus, 'playing')
})

test('music errors dispose the player without automatic retry and recover on explicit interaction', () => {
  const h = harness()
  h.sound.enterTown()
  const music = h.contexts[0]
  music.emit('Error')
  assert.equal(music.destroys, 1)
  assert.equal(h.sound.getState().musicStatus, 'error')
  assert.equal(h.contexts.length, 1)
  h.sound.setEffectsEnabled(false)
  assert.equal(h.contexts.length, 1)
  h.sound.retryMusic()
  assert.equal(h.contexts.length, 2)
  assert.equal(h.sound.getState().musicStatus, 'playing')
  music.history.Error[0]()
  assert.equal(h.contexts[1].destroys, 0)
})

test('effect errors cannot destroy a newer effect and do not affect music', () => {
  const h = harness()
  h.sound.enterTown()
  h.sound.playEffect('tap')
  const [music, effect] = h.contexts
  const staleError = effect.history.Error[0]
  h.sound.playEffect('success')
  staleError()
  assert.equal(effect.destroys, 0)
  effect.emit('Error')
  assert.equal(effect.destroys, 1)
  assert.equal(music.destroys, 0)
  assert.equal(h.sound.getState().musicStatus, 'playing')
  h.sound.playEffect('open')
  assert.equal(h.contexts.length, 3)
})

test('audio/storage failures and unavailable interruption APIs never escape into the page', () => {
  const broken = harness({ badStorage: true, failCreate: true, noInterruptionAPI: true })
  assert.doesNotThrow(() => {
    broken.sound.enterTown()
    broken.sound.playEffect()
    broken.sound.setMusicEnabled(false)
    broken.sound.setEffectsEnabled(false)
    broken.sound.setMusicEnabled(true)
    broken.sound.leaveTown()
    broken.sound.destroy()
  })
  const rejected = harness({ failPlay: true })
  rejected.sound.enterTown()
  assert.equal(rejected.sound.getState().musicStatus, 'error')
  assert.equal(rejected.contexts[0].destroys, 1)
  rejected.sound.playEffect()
  assert.equal(rejected.contexts[1].destroys, 1)
  const absent = createSound({})
  assert.doesNotThrow(() => { absent.enterTown(); absent.playEffect(); absent.destroy() })
})

test('async subpackage loading coalesces requests and honors hide/mute/speech before completion', () => {
  for (const suppress of [sound => sound.setAppVisible(false), sound => sound.setMusicEnabled(false),
    sound => sound.leaveTown(), sound => sound.setSpeechActive(true)]) {
    const h = harness({ deferredPackage: true })
    h.sound.enterTown()
    h.sound.retryMusic()
    h.sound.playEffect('tap')
    assert.equal(h.loads, 1)
    assert.equal(h.contexts.length, 0)
    suppress(h.sound)
    h.pending[0].ready()
    assert.equal(h.contexts.length, 0)
    assert.equal(h.sound.getState().musicStatus, 'idle')
  }
  const h = harness({ deferredPackage: true })
  h.sound.enterTown()
  h.sound.leaveTown()
  h.pending[0].ready()
  h.sound.enterTown()
  assert.equal(h.contexts.length, 1)
  assert.equal(h.loads, 1)
})

test('a tap awaiting the audio package is dropped; a later interaction plays normally', () => {
  const h = harness({ deferredPackage: true })
  h.sound.playEffect('success')
  h.pending[0].ready()
  assert.equal(h.contexts.length, 0)
  h.sound.playEffect('open')
  assert.equal(h.contexts.length, 1)
  assert.equal(h.contexts[0].src, '/town-audio/audio/open.wav')
})

test('failed subpackage load retries only on explicit action and ignores stale loader callbacks', () => {
  const h = harness({ deferredPackage: true })
  h.sound.enterTown()
  h.pending[0].fail()
  assert.equal(h.sound.getState().musicStatus, 'error')
  assert.equal(h.loads, 1)
  h.sound.retryMusic()
  assert.equal(h.loads, 2)
  h.pending[0].ready()
  assert.equal(h.contexts.length, 0)
  h.pending[1].ready()
  assert.equal(h.contexts.length, 1)
  assert.equal(h.sound.getState().musicStatus, 'playing')
})

test('state observers see actual playback, can unsubscribe, and cannot break audio', () => {
  const h = harness({ pendingPlay: true })
  const statuses = []
  h.sound.subscribe(() => { throw Error('view error') })
  const unsubscribe = h.sound.subscribe(state => statuses.push(state.musicStatus))
  h.sound.enterTown()
  h.contexts[0].emit('Play')
  h.sound.leaveTown()
  assert.deepEqual(statuses, ['idle', 'loading', 'playing', 'idle'])
  unsubscribe()
  h.sound.enterTown()
  assert.equal(statuses.length, 4)
})

test('destroy releases contexts/listeners and invalidates queued audio or subpackage callbacks', () => {
  const h = harness()
  h.sound.enterTown()
  h.sound.playEffect('tap')
  const [music, effect] = h.contexts
  const onPlay = music.history.Play[0]
  const onError = effect.history.Error[0]
  h.sound.destroy()
  assert.equal(music.destroys, 1)
  assert.equal(effect.destroys, 1)
  assert.equal(h.interruptions.begin.size, 0)
  assert.equal(h.interruptions.end.size, 0)
  onPlay()
  onError()
  h.sound.enterTown()
  h.sound.playEffect('open')
  h.sound.setAppVisible(true)
  h.sound.destroy()
  assert.equal(h.contexts.length, 2)
  assert.equal(music.destroys, 1)
  assert.equal(effect.destroys, 1)
  assert.equal(h.sound.getState().musicStatus, 'idle')
  const loading = harness({ deferredPackage: true })
  loading.sound.enterTown()
  loading.sound.destroy()
  loading.pending[0].ready()
  assert.equal(loading.contexts.length, 0)
})
