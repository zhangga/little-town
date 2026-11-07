const test = require('node:test')
const assert = require('node:assert/strict')
const { createSchoolRewards, rewardQuestion } = require('../miniapp/school/utils/reward-client')
const { harness, tap, input } = require('./school-harness.cjs')
const { normalizeQuestion, makeActivityRound } = require('../miniapp/school/utils/curriculum')
const clone = value => JSON.parse(JSON.stringify(value))
const tick = () => new Promise(resolve => setImmediate(resolve))
function server() {
  const statuses = Object.fromEntries(['chinese', 'math', 'english'].map(subject => [subject, {
    subject, daily_goal: 10, daily_brick_cap: 20, bricks_today: 0, bricks_per_correct: 1, bonus_claimed: false,
    completed_today: 0, bonus_bricks: 10, practice_rewards: { remaining_rounds: 12, daily_round_cap: 12, bricks_per_round: 4, coins_per_round: 12 }
  }]))
  const rounds = new Map(), calls = []
  let bricks = 0, coins = 0
  const result = round => clone({ round_id: round.id, round_bricks: round.bricks, round_coins: round.coins,
    total_bricks: bricks, total_coins: coins, completed: round.completed, rewards: statuses[round.subject] })
  const api = {
    async get() { return { subjects: clone(statuses) } },
    async post(url, body) {
      calls.push({ url, body: clone(body) })
      let round = rounds.get(body.round_id)
      if (url.endsWith('/start')) {
        if (!round) { round = { id: body.round_id, subject: body.subject, kind: body.kind, total: body.questions.length, answers: new Set(), bricks: 0, coins: 0, completed: false }; rounds.set(body.round_id, round) }
      } else if (url.endsWith('/answer') && !round.answers.has(body.index)) {
        round.answers.add(body.index)
        if (round.kind === 'learning' && body.correct) {
          bricks++; coins += 5; round.bricks++; round.coins += 5; statuses[round.subject].bricks_today++
        }
      } else if (url.endsWith('/complete') && !round.completed) {
        assert.equal(round.answers.size, round.total)
        round.completed = true
        if (round.kind === 'practice') {
          bricks += 4; coins += 12; round.bricks = 4; round.coins = 12; statuses[round.subject].practice_rewards.remaining_rounds--
        }
      }
      return result(round)
    }
  }
  return { api, calls, statuses, rounds, wallet: () => ({ bricks, coins }) }
}
function clientFixture(storage = { token: 'test', userInfo: { id: 1, bricks: 0, coins: 0 } }, source = server()) {
  const updates = []
  let storageFails = false
  const wx = { getStorageSync: key => clone(storage[key] || ''), setStorageSync(key, value) { if (storageFails) throw Error('quota'); storage[key] = clone(value) } }
  const client = createSchoolRewards(wx, 'local:1', patch => updates.push(clone(patch)), source.api)
  return { client, storage, source, updates, failStorage(value) { storageFails = value } }
}
function questions(subject = 'math') { return makeActivityRound(subject, subject === 'math' ? 'arithmetic' : 'spelling').map(rewardQuestion) }

test('reward outbox retries a lost answer receipt without adding bricks twice', async () => {
  const h = clientFixture(), realPost = h.source.api.post
  let lose = true
  h.source.api.post = async (url, body) => {
    const result = await realPost(url, body)
    if (url.endsWith('/answer') && lose) { lose = false; throw Error('response lost') }
    return result
  }
  const round = h.client.begin('math', questions(), 'learning')
  h.client.answer(round, 0, true); await h.client.flush()
  assert.equal(h.source.wallet().bricks, 1)
  assert.equal(h.storage['school-reward-outbox:v1:local:1'].length, 1)
  assert.match(h.updates.at(-1).error, /response lost/)
  await h.client.flush()
  assert.equal(h.source.wallet().bricks, 1)
  assert.equal(round.receipt.round_bricks, 1)
  assert.equal(h.storage.userInfo.bricks, 1)
  assert.equal(h.storage['school-reward-outbox:v1:local:1'].length, 0)
})

test('pending practice survives leaving the page and settles once after re-entry', async () => {
  const h = clientFixture(), realPost = h.source.api.post
  h.source.api.post = async () => { throw Error('offline') }
  const round = h.client.begin('chinese', questions(), 'practice')
  for (let i = 0; i < 5; i++) h.client.answer(round, i, false)
  h.client.complete(round); await h.client.flush(); h.client.stop()
  h.source.api.post = realPost
  const next = clientFixture(h.storage, h.source)
  await next.client.refresh()
  assert.deepEqual(h.source.wallet(), { bricks: 4, coins: 12 })
  assert.equal(h.storage.userInfo.bricks, 4)
  await next.client.refresh()
  assert.equal(h.source.wallet().bricks, 4)
  assert.equal(h.source.statuses.math.practice_rewards.remaining_rounds, 12)
})

test('duplicate check, complete, and retry calls share one serialized operation queue', async () => {
  const h = clientFixture()
  const round = h.client.begin('math', questions(), 'learning')
  for (let i = 0; i < 5; i++) { h.client.answer(round, i, true); h.client.answer(round, i, true) }
  h.client.complete(round); h.client.complete(round)
  await Promise.all([h.client.flush(), h.client.flush()])
  assert.deepEqual(h.source.wallet(), { bricks: 5, coins: 25 })
  assert.equal(h.source.calls.filter(call => call.url.endsWith('/answer')).length, 5)
  assert.equal(h.source.calls.filter(call => call.url.endsWith('/complete')).length, 1)
})

test('storage errors preserve work in memory and prevent sending until durable retry', async () => {
  const h = clientFixture(); h.failStorage(true)
  const round = h.client.begin('math', questions(), 'learning')
  h.client.answer(round, 0, true)
  assert.match(h.updates.at(-1).error, /存不下/)
  assert.equal(h.source.calls.length, 0)
  h.failStorage(false); await h.client.flush()
  assert.equal(h.source.wallet().bricks, 1)
})

test('expired requests clear with an explicit notice; new subjects remain usable', async () => {
  const h = clientFixture(), realPost = h.source.api.post
  h.source.api.post = async () => { throw Object.assign(Error('这轮已跨天，请重新开始'), { statusCode: 410 }) }
  const round = h.client.begin('math', questions(), 'learning'); h.client.answer(round, 0, true); await h.client.flush()
  assert.equal(round.disabled, true)
  assert.match(h.updates.at(-1).notice, /跨天/)
  h.client.answer(round, 1, true)
  h.source.api.post = realPost
  const next = h.client.begin('english', questions('english'), 'learning'); h.client.answer(next, 0, true); await h.client.flush()
  assert.equal(next.receipt.round_bricks, 1)
})

test('switching accounts during an in-flight request cannot write the new account wallet', async () => {
  const h = clientFixture(); let release
  h.source.api.post = () => new Promise(resolve => { release = resolve })
  const round = h.client.begin('math', questions(), 'learning'); h.client.answer(round, 0, true)
  await tick(); h.storage.userInfo = { id: 2, bricks: 99 }
  release({ total_bricks: 1, total_coins: 5, rewards: h.source.statuses.math })
  await h.client.flush()
  assert.deepEqual(h.storage.userInfo, { id: 2, bricks: 99 })
  assert.equal(h.storage['school-reward-outbox:v1:local:1'].length, 1)
})

test('late quota reads do not overwrite a newer answer receipt', async () => {
  const h = clientFixture(); let release
  const old = clone(h.source.statuses)
  h.source.api.get = () => new Promise(resolve => { release = resolve })
  const refresh = h.client.refresh()
  const round = h.client.begin('math', questions(), 'learning'); h.client.answer(round, 0, true); await h.client.flush()
  release({ subjects: old }); await refresh
  assert.equal(h.updates.at(-1).statuses.math.bricks_today, 1)
})

test('a failed quota load remains visible even when there are no pending answers', async () => {
  const h = clientFixture(); h.source.api.get = async () => { throw Error('cannot load quota') }
  await h.client.refresh(); assert.match(h.updates.at(-1).error, /cannot load quota/)
})

function answerPage(page, correct = true) {
  const q = page.data.question
  if (q.kind === 'writing') page.onWriteStart({})
  else if (q.kind === 'choice') { page.setData({ heardAudio: true }); page.onChoice(tap({ id: q.options.find(o => (o.label === q.answer) === correct).id })) }
  else if (q.kind === 'order') q.tokens.slice().sort((a, b) => Number(a.id) - Number(b.id)).forEach(token => page.onOrderPick(tap({ id: token.id })))
  else page.onAnswer(input(correct ? q.word || q.answer : '99999'))
  page.onCheck()
}
test('handwriting, numeric answers and classroom drills all submit rewards; lectures and error review do not', async () => {
  const source = server(), h = harness({ subject: 'chinese', api: source.api, createRewards: createSchoolRewards })
  await tick()
  h.page.onStart(); h.page.onCheck(); assert.equal(source.calls.length, 0)
  h.page.onListenHelp(); h.page.onBack(); assert.equal(source.calls.length, 0)
  answerPage(h.page); await h.page._rewards.flush()
  assert.equal(h.page.data.roundRewardBricks, 1)
  h.page.onSubject(tap({ subject: 'math' })); assert.equal(h.page.data.rewardAnswerRemaining, 20)
  h.page.onStartDrill()
  for (let i = 0; i < 5; i++) { answerPage(h.page, i !== 0); h.page.onNext() }
  await h.page._rewards.flush()
  assert.equal(h.page.data.roundRewardBricks, 4)
  assert.equal(h.page.data.roundRewardSettled, true)
  const calls = source.calls.length
  h.page.onReviewMistakes(); answerPage(h.page); h.page.onNext(); await tick()
  assert.equal(source.calls.length, calls)
  assert.equal(h.page.data.roundRewardBricks, 0)
  h.page.onUnload()
})

test('ten-question review pays only when completed and exposes a different subject quota', async () => {
  const source = server(), h = harness({ subject: 'english', api: source.api, createRewards: createSchoolRewards })
  await tick(); h.page.onRewardPractice()
  assert.equal(h.page.data.total, 10)
  for (let i = 0; i < 9; i++) { answerPage(h.page); h.page.onNext() }
  await h.page._rewards.flush(); assert.equal(h.page.data.roundRewardBricks, 0)
  answerPage(h.page); h.page.onNext(); await h.page._rewards.flush()
  assert.equal(h.page.data.roundRewardBricks, 4)
  assert.equal(h.page.data.subjectReward.practice_rewards.remaining_rounds, 11)
  h.page.onSubject(tap({ subject: 'chinese' }))
  assert.equal(h.page.data.subjectReward.practice_rewards.remaining_rounds, 12)
  h.page.onUnload()
})

test('old subject responses update its quota without replacing the new subject round receipt', async () => {
  const source = server(), h = harness({ subject: 'math', api: source.api, createRewards: createSchoolRewards })
  await tick(); const realPost = source.api.post; let release
  source.api.post = async (url, body) => {
    if (url.endsWith('/answer')) await new Promise(resolve => { release = resolve })
    return realPost(url, body)
  }
  h.page.onStart(); answerPage(h.page); await tick()
  h.page.onSubject(tap({ subject: 'chinese' })); h.page.onStart()
  release(); await h.page._rewards.flush()
  assert.equal(h.page.data.subject, 'chinese')
  assert.equal(h.page.data.roundRewardBricks, 0)
  assert.equal(h.page.data.rewardAnswerRemaining, 20)
  assert.equal(h.page.data.rewardStatuses.math.bricks_today, 1)
  h.page.onUnload()
})

test('question identity survives option shuffling and excludes photos and help state', () => {
  const question = normalizeQuestion('math', { text: '1 + 2', answer: '3' })
  assert.deepEqual(rewardQuestion(question), rewardQuestion({ ...question, usedHelp: true, photo: '/private/photo.png', options: [{ label: 'foo' }] }))
})
