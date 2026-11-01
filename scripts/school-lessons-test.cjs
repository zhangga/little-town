const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { MODES, LESSONS, makeActivityRound, makeClassroomRound, normalizeQuestion, checkQuestion } = require('../miniapp/school/utils/curriculum')
const { createLessonPlayer } = require('../miniapp/school/utils/lesson-player')
const { createNotebook } = require('../miniapp/school/utils/notebook')
const { harness, tap, input } = require('./school-harness.cjs')

function solve(h, wrong = false) {
  const p = h.page, q = p.data.question
  if (q.kind === 'choice') {
    if (q.listening) h.audioState({ heardAudio: true, audioState: 'idle' })
    const option = q.options.find(item => wrong ? item.label !== q.answer : item.label === q.answer)
    p.onChoice(tap({ id: option.id }))
  } else if (q.kind === 'order') {
    for (const token of q.tokens.slice().sort((a, b) => Number(a.id) - Number(b.id))) p.onOrderPick(tap({ id: token.id }))
  } else p.onAnswer(input(wrong ? '99999' : q.kind === 'number' ? q.answer : q.word))
  p.onCheck()
  assert.equal(p.data.answered, true)
}

test('all twelve modes generate five questions with unambiguous answer options and a real matching lesson', () => {
  assert.equal(LESSONS.length, 12)
  for (const subject of Object.keys(MODES)) {
    assert.equal(MODES[subject].length, 4)
    for (const mode of MODES[subject]) {
      for (const level of ['20', '100', 'times']) {
        const questions = makeActivityRound(subject, mode.id, level, 5, () => 0.23)
        assert.equal(questions.length, 5)
        for (const q of questions) {
          assert.equal(q.mode, mode.id)
          assert.ok(LESSONS.some(lesson => lesson.id === q.topicID && lesson.subject === subject))
          assert.ok(q.explanation.length > 0)
          if (q.kind === 'choice') {
            assert.equal(q.options.filter(option => option.label === q.answer).length, 1)
            assert.equal(new Set(q.options.map(option => option.label)).size, q.options.length)
            assert.equal(checkQuestion(subject, q.answer, q).correct, true)
          } else if (q.kind === 'number') assert.equal(checkQuestion(subject, q.answer, q).correct, true)
          else if (q.kind === 'order') assert.equal(q.tokens.slice().sort((a, b) => Number(a.id) - Number(b.id)).map(t => t.text).join(' '), q.answer)
        }
      }
    }
  }
})

test('generated number comparisons and missing numbers are arithmetically valid across every difficulty', () => {
  function calculate(text) {
    const [_, a, op, b] = text.match(/^(\d+)\s*([+−×÷])\s*(\d+)$/)
    return op === '+' ? Number(a) + Number(b) : op === '−' ? a - b : op === '×' ? a * b : a / b
  }
  for (const level of ['20', '100', 'times']) {
    for (let trial = 0; trial < 50; trial++) {
      for (const q of makeActivityRound('math', 'compare', level)) {
        const [expression, right] = q.display.split(' ○ '), left = calculate(expression)
        assert.equal(q.answer, left > Number(right) ? '>' : left < Number(right) ? '<' : '=')
        assert.ok(Number(right) <= (level === 'times' ? 81 : Number(level)))
      }
      for (const q of makeActivityRound('math', 'missing', level)) {
        const [expression, result] = q.text.replace('□', q.answer).split(' = ')
        assert.equal(calculate(expression), Number(result))
        assert.ok(Number(q.answer) >= 0)
      }
    }
  }
  const zero = normalizeQuestion('math', { text: '6 × 0', answer: '0' })
  assert.ok(!zero.explanation.some(text => text.includes('÷ 0')))
})

test('each five-question classroom round contains multiple modes and no self-graded writing question', () => {
  for (const subject of Object.keys(MODES)) {
    const round = makeClassroomRound(subject, '20')
    assert.equal(round.length, 5)
    assert.ok(new Set(round.map(q => q.mode)).size >= 3)
    assert.ok(round.every(q => q.kind !== 'writing'))
  }
})

test('new Chinese choices are graded instead of being mistaken for handwriting, and missed items can be reviewed', () => {
  const h = harness(), p = h.page
  p.onActivity(tap({ mode: 'pinyin' })); assert.equal(p.data.question.kind, 'choice'); assert.equal(p.data.scoredTotal, 5)
  p.onCheck(); assert.match(p.data.error, /先选/); assert.equal(p.data.answered, false)
  solve(h, true); assert.equal(p.data.isCorrect, false); assert.equal(p.data.mistakeCount, 1); assert.equal(p.data.totals.chinese, 1)
  p.onNext()
  for (let i = 1; i < 5; i++) { solve(h); p.onNext() }
  assert.equal(p.data.view, 'done'); assert.equal(p.data.writingOnly, false); assert.equal(p.data.correct, 4)
  p.onReviewMistakes(); assert.equal(p.data.total, 1); solve(h); p.onNext(); assert.equal(p.data.correct, 1)
  p.onUnload()
})

test('sentence building supports undo, clearing, duplicate-click prevention and one submission per sentence', () => {
  const h = harness({ subject: 'english' }), p = h.page
  p.onActivity(tap({ mode: 'sentence' })); const first = p.data.question.tokens[0]
  p.onOrderPick(tap({ id: first.id })); p.onOrderPick(tap({ id: first.id })); assert.equal(p.data.orderSlots.length, 1)
  p.onCheck(); assert.equal(p.data.answered, false); assert.match(p.data.error, /所有词语/)
  p.onOrderUndo(); assert.equal(p.data.orderSlots.length, 0)
  p.onOrderPick(tap({ id: first.id })); p.onOrderClear(); assert.equal(p.data.answer, '')
  solve(h); assert.equal(p.data.isCorrect, true); p.onCheck(); assert.equal(p.data.totals.english, 1)
  const answer = p.data.answer; p.onOrderClear(); assert.equal(p.data.answer, answer)
  p.onNext(); assert.equal(p.data.orderSlots.length, 0); p.onUnload()
})

test('listening needs completed playback; playback failure offers a marked reading fallback', () => {
  const h = harness({ subject: 'english' }), p = h.page
  p.onActivity(tap({ mode: 'listening' }))
  p.onChoice(tap({ id: p.data.question.options.find(o => o.label === p.data.question.answer).id }))
  p.onCheck(); assert.equal(p.data.answered, false); assert.match(p.data.error, /完整听/)
  p.onUseListeningText(); assert.equal(p.data.listeningFallback, false)
  h.audioState({ audioState: 'error' }); p.onUseListeningText(); p.onCheck()
  assert.equal(p.data.answered, true); assert.equal(p.data.isCorrect, true); assert.equal(p.data.assistedCount, 1)
  p.onNext(); assert.equal(p.data.listeningFallback, false); assert.equal(p.data.heardAudio, false)
  solve(h); assert.equal(p.data.isCorrect, true); p.onUnload()
})

test('classroom summary and per-mode scores save exactly once and survive reopening without altering old materials', async () => {
  for (const subject of Object.keys(MODES)) {
    const h = harness({ subject }), p = h.page
    await p._book.saveLesson({ subject: 'chinese', text: '山水' })
    p.onStartDrill(); const expectedModes = new Set(p._round.map(q => q.mode)).size
    p.onHelp()
    for (let i = 0; i < 5; i++) { solve(h, i === 0); p.onNext() }
    assert.equal(p.data.view, 'done'); assert.equal(p.data.correct, 4); assert.equal(p.data.assistedCount, 1)
    assert.equal(p.data.summaryRows.length, expectedModes)
    p.finishRound(); assert.equal(p._book.read().classroomHistory.length, 1)
    const next = harness({ subject, storage: h.storage })
    assert.equal(next.page.data.lastClassroom.correct, 4); assert.equal(next.page.data.lessonCount, 1)
    p.onReviewMistakes(); solve(h); p.onNext(); assert.equal(p._book.read().classroomHistory.length, 1)
    p.onUnload(); next.page.onUnload()
  }
})

test('lesson controls preserve the original answer, stop words, pause/resume, change speed and return to the same question', () => {
  const h = harness({ subject: 'math' }), p = h.page
  p.onStart(); p.onAnswer(input('12')); const original = p.data.question
  p.onListenHelp(); assert.equal(p.data.view, 'lecture'); assert.equal(p.data.lectureFromQuestion, true)
  p.onLecturePlay(); assert.equal(p.data.lectureAudioState, 'playing'); assert.equal(h.audioCalls.at(-1), 'stop')
  p.onLecturePlay(); assert.equal(p.data.lectureAudioState, 'paused')
  p.onLecturePlay(); assert.equal(h.teacherCalls.at(-1), 'resume')
  p.onLectureSlow(); assert.deepEqual(h.teacherCalls.at(-1), ['slow', true])
  p.onLectureNext(); assert.equal(p.data.lectureStep, 1); assert.ok(h.teacherCalls.at(-1)[1].endsWith('-2.m4a'))
  p.onLecturePractice(); assert.equal(p.data.view, 'practice'); assert.equal(p.data.question, original); assert.equal(p.data.answer, '12')
  assert.equal(p.data.usedHelp, true); assert.equal(h.teacherCalls.at(-1), 'stop')
  p.onUnload()
})

test('Chinese handwriting survives a method lesson and different Chinese modes do not initialize the canvas', () => {
  const h = harness(), p = h.page
  p.onStart(); p.onWriteStart({}); assert.equal(p.data.hasInk, true)
  const resets = h.canvasCalls.filter(value => value === 'reset').length
  p.onListenHelp(); p.onBack(); assert.equal(p.data.hasInk, true)
  assert.equal(h.canvasCalls.filter(value => value === 'reset').length, resets)
  p.onSubject(tap({ subject: 'chinese' })); const count = h.canvasCalls.filter(value => value === 'init').length
  p.onActivity(tap({ mode: 'reading' })); p.onHide(); p.onShow(); p.onResize()
  assert.equal(h.canvasCalls.filter(value => value === 'init').length, count); p.onUnload()
})

test('lecture library starts matching exercises and switching subjects or hiding always stops narration', () => {
  const h = harness({ subject: 'english' }), p = h.page
  p.onLectures(); p.onOpenLecture(tap({ id: 'sentence' })); assert.equal(p.data.lectureFromQuestion, false)
  p.onLecturePlay(); p.onHide(); assert.equal(h.teacherCalls.at(-1), 'stop'); p.onShow(); assert.equal(p.data.lectureAudioState, 'idle')
  p.onLecturePractice(); assert.equal(p.data.view, 'practice'); assert.equal(p.data.question.mode, 'sentence')
  p.onListenHelp(); p.onLecturePlay(); p.onSubject(tap({ subject: 'math' })); assert.equal(p.data.view, 'home'); assert.equal(h.teacherCalls.at(-1), 'stop')
  assert.ok(p.data.miniLessons.every(lesson => lesson.subject === 'math')); p.onUnload()
})

test('a delayed lecture step cannot restart narration after hiding or overwrite a newer step', () => {
  const h = harness(), p = h.page
  p.onLectures(); p.onOpenLecture(tap({ id: 'pinyin' }))
  const callbacks = []
  p.setData = function (patch, done) { Object.assign(this.data, patch); if (done) callbacks.push(done) }
  p.onLectureNext(); p.onHide(); p.onShow()
  const plays = () => h.teacherCalls.filter(call => Array.isArray(call) && call[0] === 'play').length
  const before = plays(); while (callbacks.length) callbacks.shift()(); assert.equal(plays(), before)
  p.onLecturePrevious(); p.onLectureNext(); while (callbacks.length) callbacks.shift()()
  assert.equal(plays(), before + 1); assert.ok(h.teacherCalls.at(-1)[1].endsWith('pinyin-2.m4a'))
  p.onUnload()
})

test('a failed classroom-history save remains visible, and old notebooks migrate without losing totals', () => {
  const h = harness({ subject: 'math' }), p = h.page
  h.storage['school-notebook:v1:legacy'] = { lessons: [], totals: { chinese: 7, math: 8, english: 9 } }
  const old = createNotebook(h.wxApi, 'legacy'); assert.deepEqual(old.read().classroomHistory, []); assert.equal(old.read().totals.chinese, 7)
  p.onStartDrill()
  for (let i = 0; i < 4; i++) { solve(h); p.onNext() }
  solve(h); h.failStorage(true); p.onNext(); assert.match(p.data.notice, /记录未保存/)
  assert.equal(p._book.read().classroomHistory.length, 0); p.onUnload()
})

function playerHarness() {
  const players = [], timers = new Map(), speech = [], state = {}; let nextID = 1
  const wxApi = { createInnerAudioContext() {
    const events = {}, p = { events, duration: 10, currentTime: 0, plays: 0, pauses: 0, destroyed: false,
      play() { this.plays++ }, pause() { this.pauses++ }, destroy() { this.destroyed = true },
      onPlay(fn) { events.play = fn }, onPause(fn) { events.pause = fn }, onTimeUpdate(fn) { events.time = fn }, onEnded(fn) { events.end = fn }, onError(fn) { events.error = fn }
    }; players.push(p); return p
  } }
  const player = createLessonPlayer(wxApi, patch => Object.assign(state, patch), { setSpeechActive: active => speech.push(active),
    clock: { setTimeout(fn) { const id = nextID++; timers.set(id, fn); return id }, clearTimeout(id) { timers.delete(id) } } })
  return { player, players, timers, speech, state }
}

test('real narration player handles pause/resume, progress, speed, completion and late events after replacement', () => {
  const h = playerHarness(), slide = LESSONS[0].steps[0]
  h.player.play(slide); const first = h.players[0]
  assert.equal(first.src, slide.audio); assert.equal(first.playbackRate, 1); assert.equal(h.state.lectureAudioState, 'loading')
  first.events.play(); assert.equal(h.state.lectureAudioState, 'playing'); assert.equal(h.timers.size, 0)
  first.currentTime = 4; first.events.time(); assert.equal(h.state.lectureProgress, 40)
  h.player.pause(); first.events.play(); assert.equal(h.state.lectureAudioState, 'paused')
  h.player.resume(); first.events.pause(); assert.equal(h.state.lectureAudioState, 'loading')
  first.events.play(); h.player.setSlow(true); assert.equal(first.playbackRate, .8)
  h.player.play(LESSONS[1].steps[0], true); const second = h.players[1]
  assert.equal(first.destroyed, true); first.events.error(); first.events.end(); assert.equal(h.state.lectureAudioState, 'loading')
  second.events.play(); second.events.end(); assert.equal(h.state.lectureAudioState, 'ended'); assert.equal(h.state.lectureProgress, 100); assert.equal(h.speech.at(-1), false)
  h.player.stop(); second.events.time(); assert.equal(h.state.lectureAudioState, 'idle'); assert.equal(h.timers.size, 0)
})

test('narration loading timeout and native error release audio focus and allow a fresh retry', () => {
  const h = playerHarness()
  h.player.play(LESSONS[0].steps[0]); const timeout = [...h.timers.values()][0]; timeout()
  assert.equal(h.state.lectureAudioState, 'error'); assert.equal(h.players[0].destroyed, true); assert.equal(h.speech.at(-1), false)
  h.player.play(LESSONS[0].steps[0]); h.players[1].events.play(); h.players[1].events.error()
  assert.equal(h.state.lectureAudioState, 'error'); h.player.play(LESSONS[0].steps[0]); h.players[2].events.play()
  assert.equal(h.state.lectureAudioState, 'playing'); h.player.stop(); assert.equal(h.timers.size, 0)
})

test('default narration timers invoke host APIs without an incompatible receiver', () => {
  const vm = require('node:vm'), module = { exports: {} }, timers = new Set()
  const source = fs.readFileSync(path.resolve(__dirname, '../miniapp/school/utils/lesson-player.js'), 'utf8')
  vm.runInNewContext(source, { module, require: () => ({ setSpeechActive() {} }),
    setTimeout: function (fn) { 'use strict'; assert.equal(this, undefined); timers.add(fn); return fn },
    clearTimeout: function (fn) { 'use strict'; assert.equal(this, undefined); timers.delete(fn) }
  })
  const native = { play() {}, destroy() {}, onPlay() {}, onPause() {}, onTimeUpdate() {}, onEnded() {}, onError() {} }
  const player = module.exports.createLessonPlayer({ createInnerAudioContext: () => native }, () => {})
  player.play(LESSONS[0].steps[0]); assert.equal(timers.size, 1); player.stop(); assert.equal(timers.size, 0)
})

test('all 36 narration clips match their scripts, are real AAC containers, and school fits its package budget', () => {
  const root = path.resolve(__dirname, '../miniapp'), manifest = require('../miniapp/school/audio/manifest.json')
  const include = require('../miniapp/project.config.json').packOptions.include
  assert.ok(include.some(rule => rule.value === 'school/audio'))
  let count = 0
  for (const lesson of LESSONS) {
    assert.equal(lesson.steps.length, 3)
    for (const step of lesson.steps) {
      const filename = path.basename(step.audio), meta = manifest.clips[filename], bytes = fs.readFileSync(path.join(root, step.audio))
      assert.ok(meta.duration > 1); assert.equal(bytes.subarray(4, 8).toString(), 'ftyp')
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), meta.sha256)
      assert.equal(crypto.createHash('sha256').update(manifest.voice + ':' + manifest.rate + ':aac-24000:' + step.transcript).digest('hex'), meta.signature)
      assert.equal(bytes.length, meta.bytes); count++
    }
  }
  assert.equal(count, 36)
  const size = folder => fs.readdirSync(folder, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? size(path.join(folder, entry.name)) : fs.statSync(path.join(folder, entry.name)).size), 0)
  assert.ok(size(path.join(root, 'school')) < 2 * 1024 * 1024)
})
