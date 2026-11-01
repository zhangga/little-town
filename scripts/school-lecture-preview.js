// Browser adapter for the actual Mini Program lesson player; never connects to production APIs.
if (window.previewLecture) {
  const lesson = window.previewLecture
  let index = 0, slow = false, state = 'idle'
  const controls = document.querySelectorAll('.lecture-player-controls button')
  const tabs = document.querySelectorAll('.lecture-step-tabs button')
  const navigation = document.querySelectorAll('.lecture-navigation button')
  const wxApi = { createInnerAudioContext() {
    const audio = new Audio()
    window.previewNativeAudio = audio
    const context = {
      play() { audio.play().catch(() => { if (context.onerror) context.onerror() }) },
      pause() { audio.pause() }, destroy() { audio.pause(); audio.removeAttribute('src'); audio.load() },
      onPlay(fn) { audio.addEventListener('playing', fn) }, onPause(fn) { audio.addEventListener('pause', fn) },
      onTimeUpdate(fn) { audio.addEventListener('timeupdate', fn) }, onEnded(fn) { audio.addEventListener('ended', fn) },
      onError(fn) { context.onerror = fn; audio.addEventListener('error', fn) }
    }
    Object.defineProperties(context, {
      src: { set(value) { audio.src = new URL('audio/' + value.split('/').pop(), location.href).href } },
      playbackRate: { set(value) { audio.playbackRate = value } },
      duration: { get: () => audio.duration }, currentTime: { get: () => audio.currentTime }
    })
    return context
  } }
  window.lecturePreviewState = {}
  const player = window.lecturePreviewPlayer = lectureModule.exports.createLessonPlayer(wxApi, patch => {
    Object.assign(window.lecturePreviewState, patch)
    if (patch.lectureAudioState) state = patch.lectureAudioState
    controls[0].textContent = state === 'playing' ? 'Ⅱ 暂停' : state === 'loading' ? 'Ⅱ 准备中' : state === 'paused' ? '▶ 继续听' : state === 'ended' ? '↻ 再听一遍' : '▶ 听老师讲'
    document.querySelector('.lecture-track > wx-view').style.width = (window.lecturePreviewState.lectureProgress || 0) + '%'
  })
  controls[0].onclick = () => ['playing', 'loading'].includes(state) ? player.pause() : state === 'paused' ? player.resume() : player.play(lesson.steps[index], slow)
  controls[1].onclick = () => player.play(lesson.steps[index], slow)
  controls[2].onclick = () => { slow = !slow; player.setSlow(slow); controls[2].textContent = slow ? '0.8× 慢速' : '1× 常速'; controls[2].classList.toggle('slow-active', slow) }
  function setSlide(next) {
    if (next < 0 || next >= lesson.steps.length) return
    player.stop(); index = next
    document.querySelector('.board-title').textContent = lesson.steps[index].title
    document.querySelector('.board-content').textContent = lesson.steps[index].board
    document.querySelector('.lecture-transcript > wx-view').textContent = lesson.steps[index].transcript
    document.querySelector('.lecture-teacher > wx-view:last-child > wx-text').textContent = '阿禾老师 · 第 ' + (index + 1) + ' / 3 步'
    tabs.forEach((tab, i) => tab.classList.toggle('lecture-step-active', i === index))
    navigation[0].disabled = index === 0
    navigation[1].disabled = index === 2
    navigation[1].textContent = index === 2 ? '预览讲完啦' : '下一步，继续听 →'
    player.play(lesson.steps[index], slow)
  }
  tabs.forEach((button, i) => { button.onclick = () => setSlide(i) })
  navigation[0].onclick = () => setSlide(index - 1)
  navigation[1].onclick = () => setSlide(index + 1)
  document.addEventListener('visibilitychange', () => { if (document.hidden) player.stop() })
  window.addEventListener('pagehide', () => player.stop())
}
