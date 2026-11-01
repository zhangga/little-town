const sound = require('../../utils/sound')

function createLessonPlayer(wxApi, onState, options = {}) {
  const clock = options.clock || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) }
  const speech = options.setSpeechActive || (active => { try { sound.setSpeechActive(active) } catch (_) {} })
  let context = null, generation = 0, timer = null, wanted = 'idle', slow = false
  function clearTimer() { clock.clearTimeout(timer); timer = null }
  function stop() {
    generation++; wanted = 'idle'; clearTimer(); speech(false)
    const previous = context; context = null
    if (previous) { try { previous.destroy() } catch (_) {} }
    onState({ lectureAudioState: 'idle', lectureProgress: 0 })
  }
  function fail(ticket) {
    if (ticket !== generation) return
    stop(); onState({ lectureAudioState: 'error' })
  }
  function arm(ticket) { clearTimer(); timer = clock.setTimeout(() => fail(ticket), 10000) }
  function play(step, isSlow = false) {
    stop(); slow = isSlow
    if (!step || !step.audio) { onState({ lectureAudioState: 'error' }); return }
    const ticket = generation
    try {
      const player = wxApi.createInnerAudioContext()
      context = player; wanted = 'playing'
      player.autoplay = false; player.obeyMuteSwitch = false; player.src = step.audio; player.playbackRate = slow ? 0.8 : 1
      player.onPlay(() => {
        if (ticket !== generation || wanted !== 'playing') return
        clearTimer(); onState({ lectureAudioState: 'playing' })
      })
      player.onPause(() => {
        if (ticket !== generation || wanted !== 'paused') return
        clearTimer(); speech(false); onState({ lectureAudioState: 'paused' })
      })
      player.onTimeUpdate(() => {
        if (ticket !== generation || wanted !== 'playing') return
        const progress = player.duration > 0 ? Math.min(100, Math.max(0, Math.round(player.currentTime / player.duration * 100))) : 0
        onState({ lectureProgress: progress })
      })
      player.onEnded(() => {
        if (ticket !== generation || wanted !== 'playing') return
        clearTimer(); wanted = 'ended'; speech(false); onState({ lectureAudioState: 'ended', lectureProgress: 100 })
      })
      player.onError(() => fail(ticket))
      speech(true); onState({ lectureAudioState: 'loading', lectureProgress: 0 }); arm(ticket); player.play()
    } catch (_) { fail(ticket) }
  }
  function pause() {
    if (!context || wanted !== 'playing') return
    wanted = 'paused'; clearTimer(); speech(false)
    try { context.pause(); onState({ lectureAudioState: 'paused' }) } catch (_) { fail(generation) }
  }
  function resume() {
    if (!context || wanted !== 'paused') return
    wanted = 'playing'; speech(true); onState({ lectureAudioState: 'loading' }); arm(generation)
    try { context.play() } catch (_) { fail(generation) }
  }
  function setSlow(value) {
    slow = !!value
    if (context) { try { context.playbackRate = slow ? 0.8 : 1 } catch (_) { fail(generation) } }
  }
  return { play, pause, resume, setSlow, stop }
}

module.exports = { createLessonPlayer }
