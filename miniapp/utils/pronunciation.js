// 一个页面持有一个播放器。换题、离开页面时销毁，避免串音和过期回调。
function createPronunciation(wxApi, onState) {
  let context = null
  let generation = 0
  let timer = null
  function stop() {
    generation++
    clearTimeout(timer)
    if (context) {
      context.destroy()
      context = null
    }
    onState({ audioState: 'idle' })
  }
  function play(word, slow) {
    stop()
    if (!word || !word.audio) {
      onState({ audioState: 'error' })
      return
    }
    const current = generation
    try {
      context = wxApi.createInnerAudioContext()
      const player = context
      player.obeyMuteSwitch = false
      player.src = slow && word.slowAudio ? word.slowAudio : word.audio
      player.playbackRate = slow && !word.slowAudio ? 0.75 : 1
      onState({ audioState: 'loading' })
      const fail = () => {
        if (current !== generation) return
        stop()
        onState({ audioState: 'error' })
      }
      player.onPlay(() => {
        if (current !== generation) return
        clearTimeout(timer)
        onState({ audioState: 'playing' })
      })
      player.onEnded(() => {
        if (current !== generation) return
        clearTimeout(timer)
        onState({ audioState: 'idle', heardAudio: true })
      })
      player.onError(fail)
      timer = setTimeout(fail, 10000)
      player.play()
    } catch (err) {
      stop()
      onState({ audioState: 'error' })
    }
  }
  return { play, stop }
}

module.exports = { createPronunciation }
