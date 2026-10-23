const STORAGE_KEY = 'little-town-sound-preferences-v1'
const MUSIC_SOURCE = '/town-audio/audio/cheerful-loop.m4a'
const EFFECT_SOURCES = {
  tap: '/town-audio/audio/tap.wav',
  open: '/town-audio/audio/open.wav',
  success: '/town-audio/audio/success.wav'
}

// Only resolve wx when an action runs: importing a page must not start audio.
function createSound(wxApi, options) {
  const now = options && options.now ? options.now : () => Date.now()
  const loadAudioPackage = options && options.loadAudioPackage ? options.loadAudioPackage
    : (ready, fail) => require('../town-audio/ready.js', ready, fail)
  const resolveApi = () => wxApi || (typeof wx !== 'undefined' ? wx : null)
  const preferences = { musicEnabled: true, effectsEnabled: true }
  const listeners = new Set()
  const interruptionListeners = []
  let preferencesLoaded = false
  let lifecycleBound = false
  let destroyed = false
  let inTown = false
  let appVisible = true
  let interrupted = false
  let speechActive = false
  let music = null
  let effect = null
  let musicGeneration = 0
  let effectGeneration = 0
  let musicStatus = 'idle'
  let lastTapAt = -Infinity
  let packageState = 'idle'
  let packageGeneration = 0

  function safely(target, name, argument) {
    try {
      if (!target || typeof target[name] !== 'function') return false
      target[name](argument)
      return true
    } catch (error) {
      return false
    }
  }

  function loadPreferences() {
    if (preferencesLoaded) return
    const api = resolveApi()
    if (!api) return
    preferencesLoaded = true
    try {
      const saved = api.getStorageSync && api.getStorageSync(STORAGE_KEY)
      if (!saved || typeof saved !== 'object') return
      if (typeof saved.musicEnabled === 'boolean') preferences.musicEnabled = saved.musicEnabled
      if (typeof saved.effectsEnabled === 'boolean') preferences.effectsEnabled = saved.effectsEnabled
    } catch (error) {
      // Sound preferences must never prevent a page from opening.
    }
  }

  function getPreferences() {
    loadPreferences()
    return { musicEnabled: preferences.musicEnabled, effectsEnabled: preferences.effectsEnabled }
  }

  function getState() {
    return Object.assign(getPreferences(), { musicStatus })
  }

  function notify() {
    const state = getState()
    listeners.forEach(listener => {
      try { listener(Object.assign({}, state)) } catch (error) { /* Keep audio independent of views. */ }
    })
  }

  function setMusicStatus(status) {
    if (musicStatus === status) return
    musicStatus = status
    notify()
  }

  function subscribe(listener) {
    if (destroyed || typeof listener !== 'function') return () => {}
    listeners.add(listener)
    try { listener(getState()) } catch (error) { /* Ignore view errors. */ }
    return () => listeners.delete(listener)
  }

  function detach(record) {
    if (!record) return
    record.handlers.forEach(handler => safely(record.context, handler.off, handler.callback))
    record.handlers = []
  }

  function listen(record, name, callback) {
    if (typeof record.context[name] !== 'function') return
    record.context[name](callback)
    record.handlers.push({ off: name.replace(/^on/, 'off'), callback })
  }

  function destroyMusic() {
    musicGeneration++
    if (!music) return
    const previous = music
    music = null
    detach(previous)
    safely(previous.context, 'destroy')
  }

  function stopEffects(dispose) {
    effectGeneration++
    if (!effect) return
    detach(effect)
    if (!safely(effect.context, 'stop') || dispose) {
      safely(effect.context, 'destroy')
      effect = null
    }
  }

  function pauseMusic() {
    musicGeneration++
    if (music) {
      detach(music)
      music.active = false
      if (!safely(music.context, 'pause')) destroyMusic()
    }
    setMusicStatus('idle')
  }

  function shouldPlayMusic() {
    return !destroyed && inTown && appVisible && !interrupted && !speechActive && preferences.musicEnabled
  }

  function bindLifecycle() {
    if (lifecycleBound || destroyed) return
    const api = resolveApi()
    if (!api) return
    lifecycleBound = true
    const begin = () => {
      if (destroyed) return
      interrupted = true
      pauseMusic()
      stopEffects(false)
    }
    const end = () => {
      if (destroyed) return
      interrupted = false
      retryMusic()
    }
    ;[['AudioInterruptionBegin', begin], ['AudioInterruptionEnd', end]].forEach(entry => {
      if (safely(api, 'on' + entry[0], entry[1])) {
        interruptionListeners.push({ api, off: 'off' + entry[0], callback: entry[1] })
      }
    })
  }

  function prepareAudioPackage() {
    if (destroyed || packageState === 'ready' || packageState === 'loading') return
    packageState = 'loading'
    const generation = ++packageGeneration
    const ready = () => {
      if (destroyed || generation !== packageGeneration || packageState !== 'loading') return
      packageState = 'ready'
      if (shouldPlayMusic()) retryMusic()
    }
    const fail = () => {
      if (destroyed || generation !== packageGeneration || packageState !== 'loading') return
      packageState = 'error'
      if (shouldPlayMusic()) setMusicStatus('error')
    }
    try { loadAudioPackage(ready, fail) } catch (error) { fail() }
  }

  function retryMusic() {
    if (destroyed) return
    loadPreferences()
    bindLifecycle()
    if (!shouldPlayMusic()) return
    if (music && music.active) return
    if (packageState !== 'ready') {
      setMusicStatus('loading')
      prepareAudioPackage()
      return
    }
    const generation = ++musicGeneration
    let current = null
    const fail = () => {
      if (destroyed || generation !== musicGeneration || (current && current !== music)) return
      destroyMusic()
      setMusicStatus('error')
    }
    try {
      if (!music) {
        const api = resolveApi()
        if (!api || typeof api.createInnerAudioContext !== 'function') {
          setMusicStatus('error')
          return
        }
        music = { context: api.createInnerAudioContext(), active: false, handlers: [], sourceSet: false }
        music.context.autoplay = false
        music.context.loop = true
        music.context.volume = 0.22
        music.context.obeyMuteSwitch = true
      }
      current = music
      detach(current)
      current.active = true
      listen(current, 'onPlay', () => {
        if (generation !== musicGeneration || current !== music || !shouldPlayMusic()) return
        setMusicStatus('playing')
      })
      listen(current, 'onError', fail)
      // A device may stop a looping player. Retry only on a later user/lifecycle action.
      listen(current, 'onEnded', () => {
        if (generation !== musicGeneration || current !== music) return
        current.active = false
        setMusicStatus('idle')
      })
      setMusicStatus('loading')
      if (!current.sourceSet) {
        current.context.src = MUSIC_SOURCE
        current.sourceSet = true
      }
      if (generation !== musicGeneration || current !== music || !shouldPlayMusic()) return
      current.context.play()
    } catch (error) {
      fail()
    }
  }

  function persistPreferences() {
    preferencesLoaded = true
    try {
      const api = resolveApi()
      if (api && typeof api.setStorageSync === 'function') api.setStorageSync(STORAGE_KEY, getPreferences())
    } catch (error) { /* Keep the current setting even if storage is unavailable. */ }
  }

  function setMusicEnabled(enabled) {
    if (destroyed) return
    loadPreferences()
    const changed = preferences.musicEnabled !== !!enabled
    preferences.musicEnabled = !!enabled
    if (changed) persistPreferences()
    if (preferences.musicEnabled) retryMusic()
    else pauseMusic()
    if (changed) notify()
  }

  function setEffectsEnabled(enabled) {
    if (destroyed) return
    loadPreferences()
    const changed = preferences.effectsEnabled !== !!enabled
    preferences.effectsEnabled = !!enabled
    if (changed) persistPreferences()
    if (!preferences.effectsEnabled) stopEffects(false)
    if (changed) notify()
  }

  function enterTown() {
    if (destroyed) return
    inTown = true
    retryMusic()
  }

  function leaveTown() {
    if (destroyed) return
    inTown = false
    pauseMusic()
    stopEffects(false)
  }

  function setAppVisible(visible) {
    if (destroyed) return
    appVisible = !!visible
    if (appVisible) retryMusic()
    else {
      pauseMusic()
      stopEffects(false)
    }
  }

  function setSpeechActive(active) {
    if (destroyed) return
    speechActive = !!active
    if (speechActive) {
      pauseMusic()
      stopEffects(false)
    } else retryMusic()
  }

  function playEffect(kind) {
    if (destroyed) return
    loadPreferences()
    bindLifecycle()
    if (!preferences.effectsEnabled || !appVisible || interrupted || speechActive) return
    // A tap that downloads audio must never turn into a delayed sound on another screen.
    if (packageState !== 'ready') {
      prepareAudioPackage()
      if (packageState !== 'ready') return
    }
    kind = Object.prototype.hasOwnProperty.call(EFFECT_SOURCES, kind) ? kind : 'tap'
    if (kind === 'tap' && now() - lastTapAt < 80) return
    if (kind === 'tap') lastTapAt = now()
    stopEffects(false)
    const generation = ++effectGeneration
    let current = null
    const fail = () => {
      if (generation !== effectGeneration || (current && current !== effect)) return
      stopEffects(true)
    }
    try {
      if (!effect) {
        const api = resolveApi()
        if (!api || typeof api.createInnerAudioContext !== 'function') return
        effect = { context: api.createInnerAudioContext(), handlers: [] }
        effect.context.autoplay = false
        effect.context.loop = false
        effect.context.volume = 0.4
        effect.context.obeyMuteSwitch = true
      }
      current = effect
      listen(current, 'onError', fail)
      current.context.src = EFFECT_SOURCES[kind]
      if (generation !== effectGeneration || current !== effect) return
      current.context.play()
    } catch (error) {
      fail()
    }
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    destroyMusic()
    stopEffects(true)
    interruptionListeners.forEach(entry => safely(entry.api, entry.off, entry.callback))
    interruptionListeners.length = 0
    setMusicStatus('idle')
    listeners.clear()
  }

  return { getPreferences, getState, subscribe, setMusicEnabled, setEffectsEnabled, enterTown,
    leaveTown, setAppVisible, setSpeechActive, retryMusic, playEffect, destroy }
}

module.exports = Object.assign(createSound(), { createSound, STORAGE_KEY })
