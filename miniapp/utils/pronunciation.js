const sound = require('./sound')

// 一个页面持有一个播放器。换题、离开页面时销毁，避免串音和过期回调。
function createPronunciation(wxApi, onState) {
  let context = null
  let generation = 0
  let timer = null
  const loadedPackages = new Set()
  function setSpeechActive(active) {
    // 环境音故障不能影响单词朗读和学习流程。
    try { sound.setSpeechActive(active) } catch (_) {}
  }
  function stop() {
    generation++
    clearTimeout(timer)
    setSpeechActive(false)
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
    const fail = () => {
      if (current !== generation) return
      stop()
      onState({ audioState: 'error' })
    }
    const start = () => {
      if (current !== generation) return
      try {
        context = wxApi.createInnerAudioContext()
        const player = context
        player.obeyMuteSwitch = false
        player.src = slow && word.slowAudio ? word.slowAudio : word.audio
        player.playbackRate = slow && !word.slowAudio ? 0.75 : 1
        player.onPlay(() => {
          if (current !== generation) return
          clearTimeout(timer)
          onState({ audioState: 'playing' })
        })
        player.onEnded(() => {
          if (current !== generation) return
          clearTimeout(timer)
          setSpeechActive(false)
          onState({ audioState: 'idle', heardAudio: true })
        })
        player.onError(fail)
        player.play()
      } catch (err) {
        fail()
      }
    }
    setSpeechActive(true)
    onState({ audioState: 'loading' })
    timer = setTimeout(fail, 10000)
    if (word.audioPackage && !loadedPackages.has(word.audioPackage)) {
      try {
        // 小程序通过异步 require 加载分包；wx.loadSubpackage 属于小游戏接口。
        require('../textbook-audio/ready.js', () => {
          loadedPackages.add(word.audioPackage)
          start()
        }, fail)
      } catch (err) {
        fail()
      }
    } else {
      start()
    }
  }
  return { play, stop }
}

module.exports = { createPronunciation }
