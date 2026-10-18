// node --test scripts/learning-test.cjs — 不连接数据库、不修改真实学习进度。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { enrichWord, makeQuestion, makePlan, makePairs, normalize } = require('../miniapp/utils/learning')
const createPronunciation = loadPronunciation()
const seed = require('../backend/data/words/grade-1-3.json')
const textbook = require('../miniapp/data/textbook-words')
const { makeDailyRewardQuota } = require('../miniapp/utils/learning-rewards')
const words = seed.map((word, index) => enrichWord({ ...word, id: index + 1, is_review: false }))
const event = (data) => ({ currentTarget: { dataset: data } })
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('daily reward counts distinguish answer bricks, practice rounds and the one-time goal bonus', () => {
  assert.deepEqual(makeDailyRewardQuota({dailyBrickCap:20,bricksToday:7,bricksPerCorrect:1,goalDone:false,practiceRewards:{daily_round_cap:3,remaining_rounds:2}}), {
    answerRemaining:13,answerCap:20,practiceRemaining:2,practiceCap:3,completionRemaining:1
  })
  const capped = makeDailyRewardQuota({dailyBrickCap:20,bricksToday:25,bricksPerCorrect:1,goalDone:true,practiceRewards:{daily_round_cap:3,remaining_rounds:0}})
  assert.equal(capped.answerRemaining,0)
  assert.equal(capped.practiceRemaining,0)
  assert.equal(capped.completionRemaining,0)
  assert.equal(makeDailyRewardQuota({}).answerRemaining,'—')
  assert.equal(makeDailyRewardQuota({}).practiceRemaining,'—')
})

test('daily counts update only from saved answers and exclude completion bonus bricks', async () => {
  const h = await pageHarness(words.slice(0,3))
  h.api.get = async () => ({words:words.slice(0,3),daily_brick_cap:20,bricks_today:6,bricks_per_correct:1,bonus_claimed:false,practice_rewards:{daily_round_cap:3,remaining_rounds:2}})
  await h.page.loadDaily()
  assert.equal(h.page.data.dailyRewardQuota.answerRemaining,14)
  assert.equal(h.page.data.dailyRewardQuota.practiceRemaining,2)
  assert.equal(h.page.data.dailyRewardQuota.completionRemaining,1)
  let resolve
  h.api.post = async () => new Promise(r=>{resolve=r})
  h.page.onStart()
  const saving = answerQuestion(h.page,true,h.mockAudio)
  assert.equal(h.page.data.saving,true)
  assert.equal(h.page.data.dailyRewardQuota.answerRemaining,14)
  resolve({coins_earned:15,bricks_earned:11,bricks_today:7,daily_cap:20,bonus_granted:true,bonus_bricks:10})
  await saving
  assert.equal(h.page.data.dailyRewardQuota.answerRemaining,13)
  assert.equal(h.page.data.dailyRewardQuota.completionRemaining,0)
  h.page.onNext()
  h.api.post = async () => ({coins_earned:0,bricks_earned:0,bricks_today:7,daily_cap:20})
  await answerQuestion(h.page,true,h.mockAudio)
  assert.equal(h.page.data.dailyRewardQuota.answerRemaining,13)
  h.page.onNext()
  h.api.post = async () => {throw Error('timeout')}
  await answerQuestion(h.page,true,h.mockAudio)
  assert.equal(h.page.data.dailyRewardQuota.answerRemaining,13)
  h.page.onUnload()
})

// 微信小程序用 require(path, success, fail) 异步加载分包。
// 不在 wx mock 上虚构小游戏的 loadSubpackage 接口。
function loadPronunciation(loadPackage = (name, success) => {
  assert.equal(name, '../textbook-audio/ready.js')
  success({})
}) {
  const filename = path.resolve(__dirname, '../miniapp/utils/pronunciation.js')
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: loadPackage,
    setTimeout, clearTimeout, console
  }, { filename })
  return module.exports.createPronunciation
}

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

test('free practice saves answers and awards four bricks and twelve coins only after completing the round', async () => {
  const h = await pageHarness([words[0]])
  let query
  h.api.get = async (url, params) => { query = params; return { words: [{...words[0],is_review:true}], session_kind:'practice', practice_next_id:42, practice_token:'round-one', practice_rewards:{bricks_per_round:4,coins_per_round:12,remaining_rounds:3,daily_round_cap:3}, bonus_claimed:true } }
  const calls = []
  h.api.post = async (url, data) => {
    calls.push({url,data})
    return url.endsWith('/complete') ? {round_bricks:4,round_coins:12,total_bricks:4,total_coins:12,practice_rewards:{remaining_rounds:2}} : {saved:true}
  }
  await h.page.loadDaily()
  assert.equal(h.page.data.dailyRewardQuota.practiceRemaining,3)
  h.page.setData({listening:false}); h.page.onMode(event({mode:'spell'})); h.page.onStart()
  await answerQuestion(h.page, true, h.mockAudio)
  assert.equal(h.page.data.stats.right, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/learn/practice/answer')
  assert.equal(h.page.data.earned.bricks, 0)
  assert.equal(h.page.data.earnedXP, 0)
  h.clock.advance(1600); completePairs(h.page); await flush()
  assert.equal(h.page.data.phase, 'done')
  assert.equal(h.page.data.earned.bricks,4)
  assert.equal(h.page.data.earned.coins,12)
  assert.equal(h.page.data.rewardHeader.title,'本轮已到账')
  assert.equal(h.page.data.rewardHeader.bricks,'4')
  assert.equal(h.page.data.rewardHeader.coins,'12')
  assert.equal(h.storage.userInfo.coins,12)
  assert.equal(h.page.data.practiceRewards.remaining_rounds,2)
  assert.equal(h.page.data.dailyRewardQuota.practiceRemaining,2)
  h.page.finish(); h.page.onMatchNext(); await flush()
  assert.equal(calls.filter(c=>c.url.endsWith('/complete')).length,1)
  await h.page.onRetry()
  assert.equal(query.practice_after, 42)
  assert.equal(h.page.data.phase, 'ready')
  assert.equal(h.page.data.rewardHeader.title,'完成本轮可得')
  assert.equal(h.page.data.rewardHeader.progress,'已答 0/1 · 答对 0')
  h.page.onUnload()
})

test('a lost practice settlement is retried manually with the same ticket and restores the awarded amount', async () => {
  const h = await pageHarness([words[0]])
  h.api.get = async () => ({words:[{...words[0],is_review:true}],session_kind:'practice',practice_token:'stable-round'})
  const tickets=[]
  h.api.post = async (url,data) => {
    if (!url.endsWith('/complete')) return {saved:true}
    tickets.push(data.practice_token)
    if(tickets.length===1) throw new Error('timeout')
    return {already_completed:true,bricks_earned:0,coins_earned:0,round_bricks:4,round_coins:12,total_bricks:14,total_coins:112,practice_rewards:{remaining_rounds:2}}
  }
  await h.page.loadDaily();h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  await answerQuestion(h.page,true,h.mockAudio);h.page.onNext();completePairs(h.page);await flush()
  assert.equal(h.page.data.practiceSettlementError,true)
  assert.equal(h.page.data.earned.bricks,0)
  h.page.onHide();h.page.onShow();await flush()
  assert.equal(h.page.data.phase,'done')
  await h.page.onRetryPracticeReward()
  assert.deepEqual(tickets,['stable-round','stable-round'])
  assert.equal(h.page.data.practiceSettled,true)
  assert.equal(h.page.data.earned.bricks,4)
  assert.equal(h.storage.userInfo.coins,112)
  h.page.onUnload()
})

test('practice at the daily cap stays playable and does not show an award', async () => {
  const h=await pageHarness([words[0]])
  h.api.get=async()=>({words:[{...words[0],is_review:true}],session_kind:'practice',practice_token:'cap-round',practice_rewards:{remaining_rounds:0}})
  h.api.post=async(url)=>url.endsWith('/complete')?{capped:true,round_bricks:0,round_coins:0,total_bricks:12,total_coins:36,practice_rewards:{remaining_rounds:0}}:{saved:true}
  await h.page.loadDaily();h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  await answerQuestion(h.page,true,h.mockAudio);h.page.onNext();completePairs(h.page);await flush()
  assert.equal(h.page.data.practiceSettled,true)
  assert.equal(h.page.data.capped,true)
  assert.equal(h.page.data.earned.bricks,0)
  assert.equal(h.page.data.earnedXP,0)
  assert.equal(h.page.data.rewardHeader.title,'今日复习奖励已领满')
  h.page.onUnload()
})

test('an uncertain practice answer is only retried manually and settlement waits for all saved words', async () => {
  const h=await pageHarness([words[0]])
  h.api.get=async()=>({words:[{...words[0],is_review:true}],session_kind:'practice',practice_token:'retry-answer'})
  const calls=[]
  h.api.post=async(url,data)=>{
    calls.push({url,data})
    if(calls.length===1) throw new Error('timeout')
    return url.endsWith('/complete')?{round_bricks:4,round_coins:12,total_bricks:4,total_coins:12,practice_rewards:{remaining_rounds:2}}:{saved:true}
  }
  await h.page.loadDaily();h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  await answerQuestion(h.page,true,h.mockAudio)
  assert.equal(h.page.data.saveError,true)
  h.page.onNext();completePairs(h.page);await flush()
  assert.equal(calls.length,1)
  assert.equal(h.page.data.practiceSettlementError,true)
  await h.page.onRetryPracticeReward()
  assert.deepEqual(calls.map(c=>c.url),['/learn/practice/answer','/learn/practice/answer','/learn/practice/complete'])
  assert.equal(h.page.data.unsaved,0)
  assert.equal(h.page.data.earned.bricks,4)
  h.page.onUnload()
})

test('a late practice settlement cannot change the next round or an unloaded page', async () => {
  const h=await pageHarness([words[0]])
  h.api.get=async()=>({words:[{...words[0],is_review:true}],session_kind:'practice',practice_token:'late-round'})
  let resolve
  h.api.post=async(url)=>url.endsWith('/complete')?new Promise(r=>{resolve=r}):{saved:true}
  await h.page.loadDaily();h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  await answerQuestion(h.page,true,h.mockAudio);h.page.onNext();completePairs(h.page)
  assert.equal(h.page.data.practiceSettling,true)
  await h.page.onRetry()
  assert.equal(h.page.data.phase,'done')
  await h.page.loadDaily()
  resolve({round_bricks:4,round_coins:12,total_bricks:4,total_coins:12,practice_rewards:{remaining_rounds:2}})
  await flush()
  assert.equal(h.page.data.phase,'ready')
  assert.equal(h.page.data.earned.bricks,0)
  assert.equal(h.storage.userInfo.coins,0)
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

test('the practice reward header shows the whole-round target and progress before any reward is credited', async () => {
  const h=await pageHarness(words.slice(0,3))
  h.api.get=async()=>({words:words.slice(0,3).map(word=>({...word,is_review:true})),session_kind:'practice',practice_token:'header-round',practice_rewards:{bricks_per_round:4,coins_per_round:12,remaining_rounds:3}})
  h.api.post=async()=>({saved:true})
  await h.page.loadDaily();h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  for(let i=0;i<2;i++) {await answerQuestion(h.page,true,h.mockAudio);h.page.onNext()}
  assert.equal(h.page.data.rewardHeader.title,'完成本轮可得')
  assert.equal(h.page.data.rewardHeader.bricks,'4')
  assert.equal(h.page.data.rewardHeader.coins,'12')
  assert.equal(h.page.data.rewardHeader.progress,'已答 2/3 · 答对 2')
  assert.match(h.page.data.rewardHeader.note,/配对后到账/)
  assert.equal(h.page.data.earned.bricks,0)
  assert.equal(h.storage.userInfo.coins,0)
  h.page.onUnload()
})

test('the learning reward header updates from saved rewards and explains zero rewards and pending saves', async () => {
  const h=await pageHarness(words.slice(0,3))
  h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  for(let i=0;i<2;i++) {await answerQuestion(h.page,true,h.mockAudio);h.page.onNext()}
  assert.equal(h.page.data.rewardHeader.title,'本轮已到账')
  assert.equal(h.page.data.rewardHeader.bricks,'2')
  assert.equal(h.page.data.rewardHeader.coins,'10')
  h.api.post=async()=>({bricks_earned:0,coins_earned:0})
  await answerQuestion(h.page,true,h.mockAudio)
  assert.match(h.page.data.rewardHeader.note,/今天已领过奖励/)
  h.page.onUnload()

  const failed=await pageHarness([words[0]],()=>{throw new Error('timeout')})
  failed.page.setData({listening:false,mode:'spell'});failed.page.onStart()
  await answerQuestion(failed.page,true,failed.mockAudio)
  assert.match(failed.page.data.rewardHeader.note,/奖励待确认/)
  assert.equal(failed.page.data.rewardHeader.bricks,'0')
  failed.page.onUnload()
})

test('the learning reward header explains saving before updating the credited total', async () => {
  let resolve
  const h=await pageHarness([words[0]],()=>new Promise(r=>{resolve=r}))
  h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  const saved=answerQuestion(h.page,true,h.mockAudio)
  assert.match(h.page.data.rewardHeader.note,/正在保存/)
  assert.equal(h.page.data.rewardHeader.coins,'0')
  resolve({bricks_earned:1,coins_earned:5,total_bricks:1,total_coins:5});await saved
  assert.equal(h.page.data.rewardHeader.coins,'5')
  assert.doesNotMatch(h.page.data.rewardHeader.note,/正在保存/)
  h.page.onUnload()
})

test('already rewarded words keep their explanation when advancing instead of showing unexplained zero totals', async () => {
  const h=await pageHarness(words.slice(0,3),()=>({bricks_earned:0,coins_earned:0}))
  h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  for(let i=0;i<2;i++) {await answerQuestion(h.page,true,h.mockAudio);h.page.onNext()}
  assert.equal(h.page.data.rewardHeader.title,'这些词今天已领奖')
  assert.equal(h.page.data.rewardHeader.bricks,'—')
  assert.equal(h.page.data.rewardHeader.coins,'—')
  assert.match(h.page.data.rewardHeader.note,/今天已领过奖励/)
  assert.equal(h.page.data.earned.bricks,0)
  h.page.onUnload()
})

test('the practice reward header distinguishes a full daily quota from rewards waiting for settlement', async () => {
  const h=await pageHarness([words[0]])
  h.api.get=async()=>({words:[{...words[0],is_review:true}],session_kind:'practice',practice_token:'header-cap',practice_rewards:{bricks_per_round:4,coins_per_round:12,remaining_rounds:0}})
  h.api.post=async()=>({saved:true})
  await h.page.loadDaily();h.page.setData({listening:false,mode:'spell'});h.page.onStart()
  await answerQuestion(h.page,true,h.mockAudio)
  assert.equal(h.page.data.rewardHeader.title,'今日复习奖励已领满')
  assert.equal(h.page.data.rewardHeader.bricks,'—')
  assert.match(h.page.data.rewardHeader.note,/明天/)
  h.page.onUnload()
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
    require: (name) => name === '../../utils/api' ? api :
      name === '../../utils/pronunciation' ? { createPronunciation } : localRequire(name),
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

test('the complete photographed textbook is available to grade-three learners without duplicate seed rows', () => {
  assert.deepEqual(textbook.map(unit => [unit.unit, unit.words.length]), [
    ['Welcome', 35], ['Unit 1', 40], ['Unit 2', 28], ['Unit 3', 28],
    ['Unit 4', 33], ['Unit 5', 25], ['Unit 6', 28]
  ])
  const entries = textbook.flatMap(unit => unit.words)
  assert.equal(entries.length, 217)
  assert.equal(new Set(entries.map(word => normalize(word.word))).size, 217)
  assert.equal(new Set(seed.map(word => word.grade + '|' + word.word)).size, seed.length)
  for (const entry of entries) {
    const word = seed.find(word => word.grade === 3 && word.word === entry.word)
    assert.ok(word, entry.word + ' must be available to the current grade')
    assert.ok(word.translation)
    const enriched = enrichWord(word)
    for (const mode of ['mixed', 'listen', 'spell', 'cloze']) {
      const question = makePlan([enriched], mode, true)[0]
      assert.equal(question.options.filter(option => option.correct).length, 1)
    }
  }
  for (const word of ['be', 'am', 'is', 'are', 'a', 'an', "let's", 'let us', 'dad', 'father', 'mum', 'mother', 'grandpa', 'grandfather', 'grandma', 'grandmother']) {
    assert.ok(entries.some(entry => entry.word === word), word)
  }
  assert.equal(entries.find(word => word.word === 'take care of').textbookForm, 'take care of sb / sth')
  assert.equal(entries.find(word => word.word === 'look at').textbookForm, 'look at sb / sth')
})

test('homographs keep meaning-specific examples and apostrophes map to safe audio filenames', () => {
  const fruit = enrichWord(seed.find(word => word.word === 'orange' && word.grade === 2))
  const colour = enrichWord(seed.find(word => word.word === 'orange' && word.grade === 3))
  assert.equal(fruit.fullSentence, 'I peel an orange.')
  assert.equal(colour.fullSentence, 'The carrot is orange.')
  assert.equal(enrichWord({word: "let's"}).audio, '/textbook-audio/words/lets.mp3')
  assert.equal(enrichWord({word: 'I'}).audio, '/textbook-audio/words/i.mp3')
})

test('all seed words have examples and both packaged pronunciations within each package budget', () => {
  assert.equal(words.length, 240)
  const included = require('../miniapp/project.config.json').packOptions.include
  for (const word of words) {
    assert.equal(word.sentence.split('___').length, 2)
    assert.ok(word.fullSentence.includes(word.word))
    for (const asset of [word.audio, word.slowAudio]) {
      const relative = asset.replace(/^\//, '')
      assert.ok(included.some(rule => rule.type === 'folder' && relative.startsWith(rule.value + '/')), asset + ' must survive unused-file filtering')
      const raw = fs.readFileSync(path.join(__dirname, '../miniapp', asset))
      assert.ok(raw.length > 1000, asset)
      assert.equal(raw.subarray(0, 3).toString(), 'ID3', asset)
    }
  }
  const root = path.join(__dirname, '../miniapp')
  function size(folder, excluded = []) {
    return fs.readdirSync(folder, {withFileTypes: true}).reduce((sum, file) => {
      if (excluded.includes(file.name)) return sum
      const filename = path.join(folder, file.name)
      return sum + (file.isDirectory() ? size(filename) : fs.statSync(filename).size)
    }, 0)
  }
  const config = require('../miniapp/app.json')
  assert.ok(config.subpackages.some(pkg => pkg.root === 'textbook-audio'))
  assert.ok(config.preloadRule['pages/learn/learn'].packages.includes('textbook-audio'))
  assert.ok(size(root, ['textbook-audio']) < 2 * 1024 * 1024, 'main package must stay within 2 MiB')
  assert.ok(size(path.join(root, 'textbook-audio')) < 2 * 1024 * 1024, 'textbook audio must stay within 2 MiB')
})

test('textbook pronunciation waits for its package, caches successful loads and ignores cancelled callbacks', () => {
  const wx = audioMock()
  const loads = []
  const createPlayer = loadPronunciation((name, success, fail) => loads.push({ name, success, fail }))
  const states = []
  const audio = createPlayer(wx, state => states.push(state))
  const word = enrichWord({word: 'welcome'})
  audio.play(word, false)
  assert.equal(typeof wx.loadSubpackage, 'undefined', 'mini programs do not expose the mini-game API')
  assert.equal(states.at(-1).audioState, 'loading')
  assert.equal(loads[0].name, '../textbook-audio/ready.js')
  assert.equal(wx.contexts.length, 0)
  assert.equal(states.at(-1).audioState, 'loading')
  audio.stop()
  loads[0].success()
  assert.equal(wx.contexts.length, 0)
  audio.play(word, true)
  assert.equal(loads.length, 1)
  assert.equal(wx.contexts[0].src, word.slowAudio)
  wx.contexts[0].callbacks.ended()
  audio.stop()
})

test('the reported word to and its slow recording play through the mini-program package entry', () => {
  const wx = audioMock()
  const createPlayer = loadPronunciation((name, success) => {
    const entry = path.resolve(__dirname, '../miniapp/utils', name)
    success(require(entry))
  })
  let state = {}
  const audio = createPlayer(wx, patch => { state = { ...state, ...patch } })
  const word = enrichWord({ word: 'to' })
  for (const slow of [false, true]) {
    audio.play(word, slow)
    const player = wx.contexts.at(-1)
    assert.ok(player, 'a mini program must reach the player without wx.loadSubpackage')
    assert.equal(player.src, slow ? word.slowAudio : word.audio)
    assert.ok(fs.readFileSync(path.join(__dirname, '../miniapp', player.src)).length > 1000)
    assert.equal(state.audioState, 'playing')
    player.callbacks.ended()
    assert.equal(state.heardAudio, true)
  }
  audio.stop()
})

test('a failed textbook package can be retried without unlocking a stale word', () => {
  const wx = audioMock()
  const loads = []
  const createPlayer = loadPronunciation((name, success, fail) => loads.push({ name, success, fail }))
  const states = []
  const audio = createPlayer(wx, state => states.push(state))
  const word = enrichWord({word: 'welcome'})
  audio.play(word, false)
  loads[0].fail()
  assert.equal(states.at(-1).audioState, 'error')
  audio.play(word, false)
  loads[0].success()
  assert.equal(wx.contexts.length, 0)
  loads[1].success()
  assert.equal(wx.contexts.length, 1)
  audio.stop()
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

test('a new textbook card reads the word automatically and still offers slow replay', async () => {
  const word = words.find(word => word.word === 'welcome')
  const { page, calls, mockAudio } = await pageHarness([word])
  page.onStart()
  assert.equal(page.data.phase, 'card')
  assert.equal(mockAudio.contexts.length, 1)
  assert.equal(mockAudio.contexts[0].src, word.audio)
  assert.equal(page.data.audioState, 'playing')
  page.onFlip()
  assert.equal(mockAudio.contexts.length, 1, 'flipping must not restart the pronunciation')
  page.onPlayAudio(event({ slow: true }))
  assert.equal(mockAudio.contexts[0].destroyed, true)
  assert.equal(mockAudio.contexts[1].src, word.slowAudio)
  page.onHide()
  assert.equal(mockAudio.contexts[1].destroyed, true)
  assert.equal(calls.length, 0)
  page.onUnload()
})

test('each next new card reads its own word and card playback never satisfies the listening question', async () => {
  const input = ['welcome', 'school'].map(name => words.find(word => word.word === name))
  const { page, calls, mockAudio } = await pageHarness(input)
  page.onStart()
  assert.equal(mockAudio.contexts.at(-1)?.src, input[0].audio)
  mockAudio.contexts.at(-1).callbacks.ended()
  assert.equal(page.data.heardAudio, true)
  page.onFlip(); page.onCardContinue()
  assert.equal(page.data.heardAudio, false)
  await answerQuestion(page, true, mockAudio)
  page.onNext()
  assert.equal(page.data.phase, 'card')
  assert.equal(mockAudio.contexts.at(-1).src, input[1].audio)
  assert.equal(page.data.heardAudio, false)
  assert.equal(calls.length, 1)
  page.onUnload()
})

test('automatic card reading respects quiet mode and skips review words or missing audio', async () => {
  for (const condition of ['quiet', 'review', 'missing', 'hidden']) {
    const word = condition === 'missing' ? { id: 999, word: 'custom', translation: '自定义', is_review: false } :
      { ...words[0], is_review: condition === 'review' }
    const { page, mockAudio } = await pageHarness([word])
    if (condition === 'quiet') page.onToggleListening({ detail: { value: false } })
    if (condition === 'hidden') page.onHide()
    page.onStart()
    assert.equal(mockAudio.contexts.length, 0, condition)
    if (condition === 'quiet') {
      page.onPlayAudio(event({}))
      assert.equal(mockAudio.contexts[0].src, word.audio, 'quiet mode still permits a deliberate replay')
    }
    page.onUnload()
  }
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
