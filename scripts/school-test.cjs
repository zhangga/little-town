const test = require('node:test')
const assert = require('node:assert/strict')
const { createNotebook } = require('../miniapp/school/utils/notebook')
const { createHandwriting } = require('../miniapp/school/utils/handwriting')
const { parseMaterial, makeMathRound, mathProblem, checkAnswer } = require('../miniapp/school/utils/content')
const { harness, tap, input } = require('./school-harness.cjs')

test('three subjects parse photos transcribed as text without executing or trusting supplied answers', () => {
  assert.deepEqual(parseMaterial('chinese', '日 月，日。山水！').map(item => item.text), ['日', '月', '山', '水'])
  assert.equal(parseMaterial('chinese', '春天来了')[0].pinyin, '')
  assert.deepEqual(parseMaterial('english', 'apple 苹果\nice cream 冰淇淋\nlet’s 让我们\nbook：书').map(item => item.word), ['apple', 'ice cream', 'let’s', 'book'])
  assert.deepEqual(parseMaterial('math', '３＋５＝99\n12 − 4 =\n6×3=?\n20÷5=').map(item => item.answer), ['8', '8', '18', '4'])
  for (const source of ['1/0', '5/2', '1-9', '1000+1', '2**3', '1 + process.exit()', '3.5+1']) assert.throws(() => mathProblem(source))
  assert.throws(() => parseMaterial('english', 'apple'))
  assert.throws(() => parseMaterial('english', 'a'.repeat(81) + ' 中文'))
  assert.throws(() => parseMaterial('chinese', 'abc 12'))
  assert.throws(() => parseMaterial('math', '2+3\nbad row'))
  assert.throws(() => parseMaterial('math', Array(41).fill('1+2').join('\n')))
})

test('generated rounds stay distinct, nonnegative and within selected level including fixed random source', () => {
  for (const level of ['20', '100', 'times']) {
    for (let trial = 0; trial < 60; trial++) {
      const round = makeMathRound(level, 5, trial === 0 ? () => 0 : Math.random)
      assert.equal(round.length, 5); assert.equal(new Set(round.map(item => item.text)).size, 5)
      for (const item of round) {
        assert.equal(mathProblem(item.text).answer, item.answer)
        assert.ok(Number(item.answer) >= 0)
        const operands = item.text.match(/\d+/g).map(Number)
        if (level !== 'times') assert.ok(Math.max(...operands, Number(item.answer)) <= Number(level))
        else assert.ok(Number(item.answer) <= 81)
      }
    }
  }
})

test('answers reject blanks and nonnumeric coercions; English accepts case, spaces and curly apostrophes', () => {
  assert.equal(checkAnswer('math', '', { answer: '0' }).empty, true)
  for (const value of ['1e1', '10abc', '0xA', '10.0', 'Infinity']) assert.equal(checkAnswer('math', value, { answer: '10' }).correct, false)
  assert.equal(checkAnswer('math', '０', { answer: '0' }).correct, true)
  assert.equal(checkAnswer('english', ' ICE   CREAM ', { word: 'ice cream' }).correct, true)
  assert.equal(checkAnswer('english', "let's", { word: 'let’s' }).correct, true)
})

test('math checks once, finishes the round, and lets the child practise exactly the missed questions', () => {
  const h = harness({ subject: 'math' }), p = h.page
  p.startRound('math', [mathProblem('2+3'), mathProblem('1-1')], '自选题', '')
  p.onCheck(); assert.match(p.data.error, /输入/); assert.equal(p.data.answered, false)
  p.onAnswer(input('4')); p.onCheck(); p.onCheck(); assert.equal(p.data.totals.math, 1); assert.equal(p.data.mistakeCount, 1)
  assert.match(p.data.feedback, /2 \+ 3 = 5/)
  p.onNext(); p.onAnswer(input('0')); p.onCheck(); p.onNext()
  assert.equal(p.data.view, 'done'); assert.equal(p.data.correct, 1); assert.equal(p.data.totals.math, 2)
  p.onReviewMistakes(); assert.equal(p.data.total, 1); assert.equal(p.data.reviewing, true)
  p.onAnswer(input('5')); p.onCheck(); p.onNext()
  assert.equal(p.data.mistakeCount, 0); assert.equal(p.data.view, 'done'); assert.equal(p.data.totals.math, 3)
  p.onUnload()
})

test('Chinese requires ink, supports undo/clear/guide and records practice without claiming handwriting correctness', () => {
  const h = harness(), p = h.page
  p.onStart(); p.onCheck(); assert.equal(p.data.answered, false)
  p.onWriteStart({}); assert.equal(p.data.hasInk, true)
  p.onUndo(); assert.equal(p.data.hasInk, false)
  p.onWriteStart({}); p.onClear(); assert.equal(p.data.hasInk, false)
  p.onWriteStart({}); p.onGuide(); assert.equal(p.data.guide, false)
  p.onCheck(); p.onCheck(); assert.equal(p.data.totals.chinese, 1); assert.equal(p.data.isCorrect, false)
  assert.match(p.data.feedback, /对照/)
  const count = h.canvasCalls.filter(item => item === 'start').length
  p.onWriteStart({}); assert.equal(h.canvasCalls.filter(item => item === 'start').length, count)
  p.onNext(); assert.equal(p.data.hasInk, false); assert.equal(p.data.index, 1)
  p.onHide(); p.onShow(); assert.ok(h.canvasCalls.includes('suspend'))
  p.onUnload(); assert.equal(h.canvasCalls.at(-1), 'destroy')
})

test('asynchronous setData cannot skip questions on double next or update a destroyed page', () => {
  const h = harness({ subject: 'math' }), p = h.page
  p.startRound('math', [mathProblem('1+1'), mathProblem('2+2'), mathProblem('3+3')], '口算', '')
  p.onAnswer(input('2')); p.onCheck()
  const callbacks = []
  p.setData = function (patch, callback) { Object.assign(this.data, patch); if (callback) callbacks.push(callback) }
  p.onNext(); p.onNext(); assert.equal(p.data.index, 1); assert.equal(p.data.question, null)
  callbacks.shift()(); assert.equal(p.data.question.answer, '4')
  p.onAnswer(input('4')); p.onCheck(); p.onNext(); p.onUnload()
  p.setData = () => { throw Error('state changed after unload') }
  while (callbacks.length) callbacks.shift()()
})

test('English uses existing audio and stops it when leaving; unknown custom words can still be spelled', () => {
  const h = harness({ subject: 'english' }), p = h.page
  p.startRound('english', [{ word: 'apple', translation: '苹果' }, { word: 'spaceship', translation: '宇宙飞船' }], '单词', '')
  assert.ok(p.data.question.audio)
  p.onPlayAudio(tap({ slow: true })); assert.deepEqual(h.audioCalls.at(-1), ['apple', true])
  p.onAnswer(input('APPLE')); p.onCheck(); assert.equal(p.data.isCorrect, true)
  p.onNext(); assert.equal(p.data.question.audio, ''); p.onAnswer(input('spaceship')); p.onCheck(); p.onNext()
  assert.equal(p.data.correct, 2); assert.equal(h.audioCalls.at(-1), 'stop')
  p.onEnglishCourse(); assert.equal(h.navigations.at(-1), '/pages/learn/learn')
  p.onUnload()
})

test('material photo is copied to persistent storage, survives reload and starts its own subject', async () => {
  const h = harness(), p = h.page
  p.onAddMaterial(); p.onSubject(tap({ subject: 'math' })); p.onDraftTitle(input('老师的算式'))
  p.onDraftText(input('3+5\n10/2')); p.onChoosePhoto(); assert.equal(p.data.draftCount, 2)
  await p.onSaveMaterial(); assert.equal(p.data.view, 'materials'); assert.equal(p.data.lessons.length, 1)
  assert.equal(h.copied.length, 1); assert.ok(p.data.lessons[0].photo.startsWith('/test-user-data/school-photo-'))
  const reloaded = harness({ storage: h.storage }), lesson = reloaded.page.data.lessons[0]
  reloaded.page.onStudyMaterial(tap({ id: lesson.id }))
  assert.equal(reloaded.page.data.subject, 'math'); assert.equal(reloaded.page.data.total, 2)
  assert.equal(reloaded.page.data.lessonPhoto, lesson.photo)
  h.confirmDelete(false); p.onDeleteMaterial(tap({ id: lesson.id })); assert.equal(p.data.lessons.length, 1)
  h.confirmDelete(true); p.onDeleteMaterial(tap({ id: lesson.id })); assert.equal(p.data.lessons.length, 0)
  assert.deepEqual(h.removed, [lesson.photo])
  p.onUnload(); reloaded.page.onUnload()
})

test('photo cancellation is quiet, permission errors visible and fallback image picker remains supported', () => {
  const h = harness(), p = h.page
  p.onAddMaterial(); h.choose('chooseMedia:fail cancel'); p.onChoosePhoto(); assert.equal(p.data.error, ''); assert.equal(p.data.choosing, false)
  h.choose('auth deny'); p.onChoosePhoto(); assert.match(p.data.error, /权限/)
  delete h.wxApi.chooseMedia
  h.wxApi.chooseImage = args => args.success({ tempFilePaths: ['/tmp/fallback.jpg'] })
  p.onChoosePhoto(); assert.equal(p.data.draftPhoto, '/tmp/fallback.jpg')
  p.onUnload()
})

test('failed copying or saving keeps the draft; failed storage rolls back only the new photo', async () => {
  const h = harness(), p = h.page
  p.onAddMaterial(); p.onDraftText(input('春天')); p.onChoosePhoto()
  h.failCopy(true); await p.onSaveMaterial(); assert.match(p.data.error, /照片没有保存/)
  assert.equal(p.data.draftText, '春天'); assert.equal(p.data.lessonCount, 0)
  h.failCopy(false); h.failStorage(true); await p.onSaveMaterial()
  assert.match(p.data.error, /存储/); assert.equal(p.data.saving, false); assert.equal(p.data.view, 'editor')
  assert.equal(p.data.draftPhoto, '/tmp/课本.png'); assert.ok(h.removed.includes(h.copied.at(-1).destPath))
  h.failStorage(false); await p.onSaveMaterial(); assert.equal(p.data.lessonCount, 1)
  h.failStorage(true); const photo = p.data.lessons[0].photo; p.onDeleteMaterial(tap({ id: p.data.lessons[0].id }))
  assert.equal(p.data.lessons.length, 1); assert.ok(!h.removed.includes(photo))
  p.onUnload()
})

test('repeated save clicks and switching while a photo is saving cannot duplicate or mislabel a lesson', async () => {
  const h = harness(), p = h.page
  p.onAddMaterial(); p.onDraftText(input('日月')); p.onChoosePhoto(); h.delayCopy(true)
  const saving = p.onSaveMaterial(); await p.onSaveMaterial(); p.onSubject(tap({ subject: 'math' })); p.onBack()
  assert.equal(p.data.view, 'editor'); assert.equal(p.data.draftSubject, 'chinese'); assert.equal(h.copied.length, 1)
  h.resolveCopy(); await saving; assert.equal(p.data.lessons.length, 1); p.onUnload()
})

test('notebooks and counts are isolated by user and backend and storage errors never invent progress', async () => {
  const h = harness(), p = h.page
  const first = createNotebook(h.wxApi, 'one:1'), second = createNotebook(h.wxApi, 'one:2'), otherBackend = createNotebook(h.wxApi, 'two:1')
  await first.saveLesson({ subject: 'chinese', text: '山' }); first.record('chinese')
  assert.equal(second.read().lessons.length, 0); assert.equal(otherBackend.read().totals.chinese, 0)
  p.onStart(); p.onWriteStart({}); h.failStorage(true); p.onCheck()
  assert.equal(p.data.totals.chinese, 0); assert.match(p.data.notice, /次数未保存/); assert.equal(p.data.answered, true)
  p.onUnload()
})

test('late photo callbacks after unload do not touch page state and unauthenticated access redirects', () => {
  const h = harness(), p = h.page
  let complete
  h.wxApi.chooseMedia = args => { complete = args.success }
  p.onChoosePhoto(); p.onUnload(); p.setData = () => { throw Error('late state update') }
  complete({ tempFiles: [{ tempFilePath: '/tmp/nope.png' }] })
  const loggedOut = harness({ storage: {} })
  assert.equal(loggedOut.navigations[0], '/pages/login/login'); loggedOut.page.onStart(); loggedOut.page.onUnload()
})

test('real canvas uses local touch coordinates, preserves ink on resize and ignores stale node callbacks', () => {
  let selected, state = {}, calls = []
  const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: () => true })
  const node = { getContext: () => ctx }
  const wxApi = { getWindowInfo: () => ({ pixelRatio: 2 }), createSelectorQuery: () => ({ in() { return this }, select() { return this }, fields() { return this }, exec(callback) { selected = callback } }) }
  const pad = createHandwriting({}, wxApi, patch => Object.assign(state, patch))
  pad.reset('山'); pad.init(); selected([{ node, width: 250, height: 250 }])
  assert.equal(node.width, 500); assert.equal(state.canvasReady, true)
  pad.start({ touches: [{ x: 25, y: 30 }] }); pad.move({ touches: [{ x: 150, y: 160 }] }); pad.end()
  pad.start({ touches: [{ x: 90, y: 100 }] }); pad.end(); assert.equal(state.strokeCount, 2)
  pad.undo(); assert.equal(state.strokeCount, 1); assert.equal(state.hasInk, true)
  calls = []; pad.suspend(); pad.init(); selected([{ node, width: 300, height: 300 }])
  assert.ok(calls.some(call => call[0] === 'lineTo' && call[1] === 180 && call[2] === 192))
  calls = []; pad.toggleGuide(false); assert.ok(!calls.some(call => call[0] === 'fillText'))
  pad.clear(); assert.equal(state.hasInk, false)
  pad.init(); const late = selected; pad.destroy(); calls = []; late([{ node, width: 250, height: 250 }])
  assert.equal(calls.length, 0)
})

test('canvas failure can be retried and empty or nonfinite input cannot create ink', () => {
  let callback, state = {}
  const wxApi = { createSelectorQuery: () => ({ in() { return this }, select() { return this }, fields() { return this }, exec(fn) { callback = fn } }) }
  const pad = createHandwriting({}, wxApi, patch => Object.assign(state, patch))
  pad.init(); callback([]); assert.match(state.canvasError, /准备好/); assert.equal(state.canvasReady, false)
  pad.start({ touches: [] }); assert.equal(state.hasInk, false); pad.destroy()
})

