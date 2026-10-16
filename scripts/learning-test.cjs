// node --test scripts/learning-test.cjs — 不连接数据库、不修改真实学习进度。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { enrichWord, makeQuestion, makePlan, makePairs, normalize } = require('../miniapp/utils/learning')
const { createPronunciation } = require('../miniapp/utils/pronunciation')
const seed = require('../backend/data/words/grade-1-3.json')
const words = seed.map((word, index) => enrichWord({ ...word, id: index + 1, is_review: false }))
const event = (data) => ({ currentTarget: { dataset: data } })
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('returning to a completed or empty tab loads another round without losing an active round', async () => {
  const h = await pageHarness([words[0]])
  let reads = 0
  h.api.get = async () => { reads++; return { words: [words[1]], bonus_claimed: true } }
  h.page.onStart(); h.page.onHide(); h.page.onShow(); await flush()
  assert.equal(reads, 0)
  h.page.finish(); h.page.onHide(); h.page.onShow(); await flush()
  assert.equal(reads, 1)
  assert.equal(h.page.data.phase, 'ready')
  assert.equal(h.page.data.words[0].id, words[1].id)
  h.page.setData({ phase: 'done', finished: true, words: [] })
  h.page.onHide(); h.page.onShow(); await flush()
  assert.equal(reads, 2)
  h.page.onUnload()
})

test('free practice stays playable without submitting awards or changing spaced review schedules', async () => {
  const h = await pageHarness([words[0]])
  let query
  h.api.get = async (url, params) => { query = params; return { words: [{...words[0],is_review:true}], session_kind:'practice', practice_next_id:42, bonus_claimed:true } }
  await h.page.loadDaily()
  h.page.setData({listening:false}); h.page.onMode(event({mode:'spell'})); h.page.onStart()
  await answerQuestion(h.page, true, h.mockAudio)
  assert.equal(h.page.data.stats.right, 1)
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.earnedXP, 0)
  h.clock.advance(1600); completePairs(h.page)
  assert.equal(h.page.data.phase, 'done')
  await h.page.onRetry()
  assert.equal(query.practice_after, 42)
  assert.equal(h.page.data.phase, 'ready')
  h.page.onUnload()
})

test('growth comes from saved server results and is not repeated during mistake practice', async () => {
  const h = await pageHarness(words.slice(0, 1), () => ({ coins_earned: 0, bricks_earned: 0, xp_earned: 5 }))
  h.page.onStart()
  await answerQuestion(h.page, false, h.mockAudio)
  assert.equal(h.page.data.earnedXP, 5)
  assert.equal(h.page.data.lastXP, 5)
  h.page.onNext()
  assert.equal(h.page.data.phase, 'review')
  assert.equal(h.page.data.lastXP, 0)
  await answerQuestion(h.page, true, h.mockAudio)
  assert.equal(h.page.data.earnedXP, 5)
  assert.equal(h.calls.length, 1)
  await h.page.loadDaily()
  assert.equal(h.page.data.earnedXP, 0)
})

function audioMock() {
  const contexts = []
  return {
    contexts,
    createInnerAudioContext() {
      const callbacks = {}
      const audio = {
        callbacks, destroyed: false,
        onPlay(fn) { callbacks.play = fn },
        onEnded(fn) { callbacks.ended = fn },
        onError(fn) { callbacks.error = fn },
        play() { callbacks.play() },
        destroy() { this.destroyed = true }
      }
      contexts.push(audio)
      return audio
    }
  }
}

async function pageHarness(input = words.slice(0, 5), post) {
  const filename = path.resolve(__dirname, '../miniapp/pages/learn/learn.js')
  const localRequire = createRequire(filename)
  const calls = []
  const timers = []
  const scheduled = new Map()
  let now = 0
  const clock = {
    advance(ms) {
      const end = now + ms
      let pending
      while ((pending = [...scheduled.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0])) {
        const [id, task] = pending
        scheduled.delete(id)
        now = task.at
        task.fn()
      }
      now = end
    }
  }
  const storage = { token: 'test', userInfo: { coins: 0, bricks: 0 } }
  const mockAudio = audioMock()
  const api = {
    get: async () => ({ words: input }),
    post: async (url, data) => {
      calls.push({ url, data })
      if (post) return post(data)
      return { coins_earned: data.is_correct ? 5 : 0, bricks_earned: data.is_correct ? 1 : 0, total_coins: 5, total_bricks: 1 }
    },
    subscription: { info: async () => ({ configured: false }) }
  }
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: (name) => name === '../../utils/api' ? api : localRequire(name),
    Page: (value) => { definition = value },
    wx: { ...mockAudio, getStorageSync: (key) => storage[key], setStorageSync: (key, value) => { storage[key] = value }, showToast() {}, redirectTo() {}, switchTab() {} },
    setTimeout: (fn, delay = 0) => {
      timers.push(fn)
      scheduled.set(timers.length, { fn, at: now + delay })
      return timers.length
    },
    clearTimeout: (id) => scheduled.delete(id), console
  }, { filename })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) }
  page.setData = (patch) => {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = page.data
      parts.slice(0, -1).forEach((part) => { target = target[part] })
      target[parts.at(-1)] = value
    }
  }
  page.onLoad()
  await flush()
  return { page, calls, timers, mockAudio, api, storage, clock }
}

function fillSpelling(page, correct = true) {
  const chars = normalize(page.data.question.word.word).replace(/[^a-z]/g, '').split('')
  if (!correct) chars.reverse()
  chars.forEach((letter) => {
    const index = page.data.question.tiles.findIndex((tile) => !tile.used && tile.letter === letter)
    page.onTile(event({ index }))
  })
}

async function answerQuestion(page, correct, mockAudio) {
  if (page.data.phase === 'card') { page.onFlip(); page.onCardContinue() }
  if (page.data.question.type === 'spell') {
    fillSpelling(page, correct)
    await page.onCheckSpelling()
  } else {
    if (page.data.question.type === 'listen') {
      page.onPlayAudio(event({}))
      mockAudio.contexts.at(-1).callbacks.ended()
    }
    const index = page.data.question.options.findIndex((option) => option.correct === correct)
    await page.onPick(event({ index }))
  }
}

function completePairs(page) {
  while (page.data.phase === 'match') {
    page.data.pairs.left.forEach((left, index) => {
      if (left.matched) return
      page.onMatchPick(event({ side: 'left', index }))
      page.onMatchPick(event({ side: 'right', index: page.data.pairs.right.findIndex((right) => right.pair === left.pair) }))
    })
    assert.equal(page.data.matchDone, true)
    page.onMatchNext()
  }
}

test('all 25 seed words have examples and both packaged pronunciations', () => {
  assert.equal(words.length, 25)
  for (const word of words) {
    assert.equal(word.sentence.split('___').length, 2)
    assert.ok(word.fullSentence.includes(word.word))
    for (const asset of [word.audio, word.slowAudio]) {
      const raw = fs.readFileSync(path.join(__dirname, '../miniapp', asset))
      assert.ok(raw.length > 1000, asset)
      assert.equal(raw.subarray(0, 3).toString(), 'ID3', asset)
    }
  }
  const bytes = fs.readdirSync(path.join(__dirname, '../miniapp/audio/words')).reduce((sum, file) => sum + fs.statSync(path.join(__dirname, '../miniapp/audio/words', file)).size, 0)
  assert.ok(bytes < 800000, 'audio should leave ample room in the main package')
})

test('a mixed round offers five distinct activities, each with one unambiguous answer', () => {
  for (let i = 0; i < 30; i++) {
    const plan = makePlan(words.slice(0, 5), 'mixed', true)
    assert.equal(new Set(plan.map((question) => question.type)).size, 5)
    for (const question of plan) {
      assert.equal(question.options.filter((option) => option.correct).length, 1)
      assert.equal(new Set(question.options.map((option) => normalize(option.label))).size, 4)
    }
  }
})

test('duplicate vocabulary and translations never produce ambiguous options or pairs', () => {
  const duplicate = { ...words[0], id: 99 }
  const synonym = { ...words[1], translation: words[0].translation }
  const question = makeQuestion(words[0], [words[0], duplicate, synonym], 'meaning')
  assert.equal(question.options.filter((option) => option.label === words[0].translation).length, 1)
  assert.equal(makePairs([words[0], duplicate, synonym]).left.length, 1)
})

test('custom words without audio, images or examples receive usable fallback questions', () => {
  const custom = enrichWord({ id: 77, word: 'constructor', translation: '建造者' })
  assert.equal(custom.audio, '')
  assert.equal(makeQuestion(custom, [custom], 'listen').type, 'meaning')
  assert.equal(makeQuestion(custom, [custom], 'cloze').type, 'translate')
  assert.equal(makeQuestion(custom, [custom], 'pic').type, 'translate')
  assert.equal(makeQuestion(words[0], words, 'listen', false).type, 'meaning')
  assert.equal(enrichWord({ word: 'custom', audio_url: 'https://example.org/custom.mp3' }).audio, 'https://example.org/custom.mp3')
})

test('new words have revealable cards; reviewing words go straight to practice', async () => {
  const { page, calls } = await pageHarness()
  page.onStart()
  assert.equal(page.data.phase, 'card')
  page.onCardContinue()
  assert.equal(page.data.phase, 'card')
  page.onFlip(); page.onCardContinue()
  assert.equal(page.data.phase, 'practice')
  assert.equal(calls.length, 0)
  page.onUnload()
  const review = await pageHarness([{ ...words[0], is_review: true }])
  review.page.onStart()
  assert.equal(review.page.data.phase, 'practice')
  review.page.onUnload()
})

test('a complete mixed session records five answers, then reviews mistakes and matches without extra rewards', async () => {
  const { page, calls, mockAudio } = await pageHarness()
  page.onStart()
  for (let index = 0; index < 5; index++) {
    await answerQuestion(page, index !== 0, mockAudio)
    page.onNext()
  }
  assert.equal(page.data.phase, 'review')
  assert.equal(page.data.stats.right, 4)
  assert.equal(page.data.stats.wrong, 1)
  await answerQuestion(page, true, mockAudio)
  page.onNext()
  assert.equal(page.data.recovered, 1)
  assert.equal(page.data.phase, 'match')
  completePairs(page)
  assert.equal(page.data.phase, 'done')
  assert.equal(calls.length, 5)
  assert.equal(page.data.earned.bricks, 4)
  page.onUnload()
})

test('spelling supports repeated letters, spaces, removing and clearing individual tiles', async () => {
  for (const target of ['apple', 'ice cream']) {
    const { page, calls } = await pageHarness([words.find((word) => word.word === target)])
    page.onMode(event({ mode: 'spell' })); page.onStart()
    fillSpelling(page)
    assert.equal(page.data.spellReady, true)
    page.onRemoveLetter(event({ index: 0 }))
    assert.equal(page.data.spellReady, false)
    page.onClearSpelling()
    assert.equal(page.data.question.tiles.some((tile) => tile.used), false)
    fillSpelling(page)
    await page.onCheckSpelling()
    await page.onCheckSpelling()
    assert.equal(page.data.isCorrect, true)
    assert.equal(calls.length, 1)
    page.onUnload()
  }
})

test('listening requires completed playback; audio failure can switch the same word to reading without marking it wrong', async () => {
  const { page, calls, mockAudio } = await pageHarness([words[0]])
  page.onMode(event({ mode: 'listen' })); page.onStart()
  await page.onPick(event({ index: 0 }))
  assert.equal(page.data.answered, false)
  page.onPlayAudio(event({}))
  mockAudio.contexts.at(-1).callbacks.error()
  assert.equal(page.data.audioState, 'error')
  page.onSkipListening()
  assert.equal(page.data.question.type, 'meaning')
  assert.equal(page.data.question.word.id, words[0].id)
  assert.equal(calls.length, 0)
  page.onUnload()
})

test('slow audio uses a separate recording and stale playback callbacks cannot unlock the next question', () => {
  const mock = audioMock()
  let state = {}
  const player = createPronunciation(mock, (patch) => { state = { ...state, ...patch } })
  player.play(words[0], true)
  const old = mock.contexts[0]
  assert.equal(old.src, words[0].slowAudio)
  player.play(words[1], false)
  assert.equal(old.destroyed, true)
  old.callbacks.ended()
  assert.notEqual(state.heardAudio, true)
  mock.contexts[1].callbacks.ended()
  assert.equal(state.heardAudio, true)
  player.stop()
  assert.equal(mock.contexts[1].destroyed, true)
})

test('saving gates next question and rapid taps cannot submit the same question twice', async () => {
  let resolve
  const { page, calls } = await pageHarness([words[0]], () => new Promise((done) => { resolve = done }))
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page)
  const saving = page.onCheckSpelling()
  page.onCheckSpelling(); page.onNext()
  assert.equal(page.data.phase, 'practice')
  assert.equal(calls.length, 1)
  resolve({ coins_earned: 0, bricks_earned: 0, capped: true, total_bricks: 20, total_coins: 0 })
  await saving
  assert.equal(page.data.lastReward.bricks, 0)
  assert.equal(page.data.earned.bricks, 0)
  page.onNext()
  assert.equal(page.data.phase, 'match')
  page.onUnload()
})

test('a failed save is surfaced without falsely awarding bricks or automatically resending', async () => {
  const { page, calls } = await pageHarness([words[0]], async () => { throw new Error('offline') })
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page)
  await page.onCheckSpelling()
  assert.equal(page.data.saveError, true)
  assert.equal(page.data.unsaved, 1)
  assert.equal(page.data.earned.bricks, 0)
  page.onNext(); completePairs(page)
  assert.equal(calls.length, 1)
  assert.equal(page.data.phase, 'done')
  page.onUnload()
})

test('mismatching a pair locks briefly, then can be corrected without altering learning records', async () => {
  const { page, calls, timers } = await pageHarness()
  page.startMatching()
  page.onMatchPick(event({ side: 'left', index: 0 }))
  page.onMatchPick(event({ side: 'right', index: page.data.pairs.right.findIndex((right) => right.pair !== 0) }))
  assert.equal(page.data.matchWrong, true)
  assert.equal(page.data.pairCount, 0)
  timers.at(-1)()
  completePairs(page)
  assert.equal(page.data.phase, 'done')
  assert.equal(calls.length, 0)
  page.onUnload()
})

test('matching batches a larger daily goal instead of dropping words after the first five', async () => {
  const { page } = await pageHarness(words.slice(0, 12))
  page.startMatching()
  assert.equal(page.data.pairBatches, 3)
  completePairs(page)
  assert.equal(page._pairBatch, 3)
  assert.equal(page.data.phase, 'done')
  page.onUnload()
})

test('leaving the page destroys pronunciation and an empty reload clears previous results', async () => {
  const { page, mockAudio, api } = await pageHarness()
  page.onStart(); page.onPlayAudio(event({}))
  page.onHide()
  assert.equal(mockAudio.contexts.at(-1).destroyed, true)
  page.setData({ earned: { bricks: 99, coins: 99 }, bonus: { granted: true, bricks: 10 } })
  api.get = async () => ({ words: [] })
  await page.loadDaily()
  assert.equal(page.data.phase, 'done')
  assert.equal(page.data.earned.bricks, 0)
  assert.equal(page.data.bonus.granted, false)
  page.onUnload()
})

test('correct answers advance automatically once, including the final word into matching', async () => {
  const { page, calls, clock } = await pageHarness(words.slice(0, 2))
  page.setData({ listening: false })
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page)
  await page.onCheckSpelling()
  clock.advance(1599)
  assert.equal(page.data.index, 0)
  clock.advance(1)
  assert.equal(page.data.index, 1)
  assert.equal(page.data.answered, false)
  clock.advance(10000)
  assert.equal(page.data.index, 1)
  fillSpelling(page); await page.onCheckSpelling()
  clock.advance(1600)
  assert.equal(page.data.phase, 'match')
  assert.equal(calls.length, 2)
  page.onUnload()
})

test('wrong answers leave more reading time, and mistake review also advances automatically', async () => {
  const { page, calls, clock } = await pageHarness([words[0]])
  page.setData({ listening: false })
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page, false)
  await page.onCheckSpelling()
  clock.advance(3499)
  assert.equal(page.data.phase, 'practice')
  assert.equal(page.data.isCorrect, false)
  clock.advance(1)
  assert.equal(page.data.phase, 'review')
  fillSpelling(page); await page.onCheckSpelling()
  clock.advance(1600)
  assert.equal(page.data.phase, 'match')
  assert.equal(calls.length, 1)
  page.onUnload()
})

test('the reading delay begins after a slow save; a failed save never advances automatically', async () => {
  let resolve
  const { page, clock } = await pageHarness([words[0]], () => new Promise((done) => { resolve = done }))
  page.setData({ listening: false })
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page)
  const saved = page.onCheckSpelling()
  clock.advance(30000)
  assert.equal(page.data.phase, 'practice')
  resolve({ coins_earned: 5, bricks_earned: 1 }); await saved
  clock.advance(1599)
  assert.equal(page.data.phase, 'practice')
  clock.advance(1)
  assert.equal(page.data.phase, 'match')
  page.onUnload()

  const failed = await pageHarness([words[0]], async () => { throw new Error('offline') })
  failed.page.setData({ listening: false })
  failed.page.onMode(event({ mode: 'spell' })); failed.page.onStart(); fillSpelling(failed.page)
  await failed.page.onCheckSpelling()
  failed.clock.advance(30000)
  assert.equal(failed.page.data.phase, 'practice')
  failed.page.onNext()
  assert.equal(failed.page.data.phase, 'match')
  failed.page.onUnload()
})

test('pause and replay keep the answer visible until the learner resumes or continues', async () => {
  const { page, clock, mockAudio } = await pageHarness([words[0]])
  page.setData({ listening: false })
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page)
  await page.onCheckSpelling()
  page.onToggleAutoAdvance()
  clock.advance(10000)
  assert.equal(page.data.phase, 'practice')
  page.onToggleAutoAdvance()
  page.onPlayAudio(event({ slow: true }))
  mockAudio.contexts.at(-1).callbacks.ended()
  clock.advance(10000)
  assert.equal(page.data.autoAdvancePaused, true)
  assert.equal(page.data.phase, 'practice')
  page.onToggleAutoAdvance(); clock.advance(1600)
  assert.equal(page.data.phase, 'match')
  page.onUnload()
})

test('automatic progression waits for pronunciation to end, with a bound for missing playback events', async () => {
  const { page, clock, mockAudio } = await pageHarness(words.slice(0, 2))
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page)
  await page.onCheckSpelling()
  clock.advance(1600)
  assert.equal(page.data.index, 0)
  mockAudio.contexts.at(-1).callbacks.ended()
  clock.advance(250)
  assert.equal(page.data.index, 1)
  fillSpelling(page); await page.onCheckSpelling()
  clock.advance(1600 + 6000)
  assert.equal(page.data.phase, 'match')
  page.onUnload()
})

test('hiding during a pending save pauses progression after return, and unloading cancels it', async () => {
  let resolve
  const { page, clock } = await pageHarness([words[0]], () => new Promise((done) => { resolve = done }))
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page)
  const saved = page.onCheckSpelling()
  page.onHide()
  resolve({ coins_earned: 5, bricks_earned: 1 }); await saved
  clock.advance(20000)
  page.onShow(); clock.advance(20000)
  assert.equal(page.data.phase, 'practice')
  assert.equal(page.data.autoAdvancePaused, true)
  page.onToggleAutoAdvance(); page.onUnload(); clock.advance(20000)
  assert.equal(page.data.phase, 'practice')
})

test('a stale automatic callback cannot skip a later answered question after manual continue', async () => {
  const { page, clock, timers } = await pageHarness(words.slice(0, 3))
  page.setData({ listening: false })
  page.onMode(event({ mode: 'spell' })); page.onStart(); fillSpelling(page)
  await page.onCheckSpelling()
  const stale = timers.at(-1)
  page.onNext()
  fillSpelling(page); await page.onCheckSpelling()
  stale()
  assert.equal(page.data.index, 1)
  clock.advance(1600)
  assert.equal(page.data.index, 2)
  page.onUnload()
})
