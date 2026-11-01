// Shared deterministic WeChat page harness; no test registration.
const assert = require('node:assert/strict')
const { createClassroomPage } = require('../miniapp/school/utils/classroom-page')
const clone = value => JSON.parse(JSON.stringify(value))
const tap = data => ({ type: 'tap', currentTarget: { dataset: data || {} } })
const input = value => ({ detail: { value } })

function harness(options = {}) {
  const storage = options.storage || { token: 'school-test', userInfo: { id: 1 } }
  const copied = [], removed = [], navigations = [], audioCalls = [], canvasCalls = [], teacherCalls = []
  let audioState, teacherState
  let failStorage = false, failCopy = false, chooseResult = 'ok', pendingCopy = null, delayCopy = false, confirmDelete = true
  const wxApi = {
    env: { USER_DATA_PATH: '/test-user-data' },
    getStorageSync: key => storage[key] ? clone(storage[key]) : '',
    setStorageSync(key, value) { if (failStorage) throw Error('quota'); storage[key] = clone(value) },
    getFileSystemManager: () => ({
      copyFile(args) { copied.push(args); if (delayCopy) { pendingCopy = args; return }; if (failCopy) args.fail({}); else args.success({}) },
      unlink({ filePath }) { removed.push(filePath) }
    }),
    chooseMedia(args) { assert.deepEqual(args.mediaType, ['image']); if (chooseResult === 'ok') args.success({ tempFiles: [{ tempFilePath: '/tmp/课本.png' }] }); else args.fail({ errMsg: chooseResult }) },
    previewImage(args) { assert.equal(args.current, args.urls[0]) },
    redirectTo: args => navigations.push(args.url), switchTab: args => navigations.push(args.url), showToast() {},
    showModal(args) { args.success({ confirm: confirmDelete }) }, nextTick: fn => fn(), pageScrollTo() {}
  }
  const definition = createClassroomPage(wxApi, {
    createAudio: (_, state) => { audioState = state; return { play(word, slow) { audioCalls.push([word.word, slow]); state({ audioState: 'playing' }) }, stop() { audioCalls.push('stop'); state({ audioState: 'idle' }) } } },
    createTeacher: (_, state) => { teacherState = state; return {
      play(slide, slow) { teacherCalls.push(['play', slide.audio, slow]); state({ lectureAudioState: 'playing' }) },
      stop() { teacherCalls.push('stop'); state({ lectureAudioState: 'idle', lectureProgress: 0 }) },
      pause() { teacherCalls.push('pause'); state({ lectureAudioState: 'paused' }) },
      resume() { teacherCalls.push('resume'); state({ lectureAudioState: 'playing' }) },
      setSlow(value) { teacherCalls.push(['slow', value]) }
    } },
    createPad: (_, __, state) => ({
      init() { canvasCalls.push('init'); state({ canvasReady: true }) }, reset() { canvasCalls.push('reset'); state({ hasInk: false, strokeCount: 0 }) },
      start() { canvasCalls.push('start'); state({ hasInk: true, strokeCount: 1 }) }, move() {}, end() {},
      undo() { state({ hasInk: false, strokeCount: 0 }) }, clear() { state({ hasInk: false, strokeCount: 0 }) },
      toggleGuide(value) { canvasCalls.push(value) }, suspend() { canvasCalls.push('suspend') }, destroy() { canvasCalls.push('destroy') }
    })
  })
  const page = Object.assign({}, definition, { data: clone(definition.data), setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() } })
  page.onLoad({ subject: options.subject }); page.onShow()
  return { page, wxApi, storage, copied, removed, navigations, audioCalls, canvasCalls, teacherCalls,
    audioState(patch) { audioState(patch) }, teacherState(patch) { teacherState(patch) },
    failStorage(value) { failStorage = value }, failCopy(value) { failCopy = value }, choose(value) { chooseResult = value },
    delayCopy(value) { delayCopy = value }, resolveCopy() { pendingCopy.success({}) }, confirmDelete(value) { confirmDelete = value }
  }
}

module.exports = { harness, tap, input }
