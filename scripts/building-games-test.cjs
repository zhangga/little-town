const test = require('node:test')
const assert = require('node:assert/strict')
const { activityIDs, activityDetails, createActivitySession, advanceActivity } = require('../miniapp/utils/building-activities')

// These are player journeys: the IDs follow the clue or order visible in each scene.
const journeys = {
  school_words: ['cat', 'dog', 'bird'], school_numbers: ['three', 'three', 'two'],
  library_forest: ['fox', 'card', 'stars', 'return'], library_ocean: ['ocean', 'octopus', 'song', 'bin'],
  shop_basket: ['water', 'apple', 'bread'], shop_sort: ['fruit', 'stationery', 'clean', 'stationery'],
  restaurant_soup: ['carrot', 'corn', 'leaf', 'bowl'], restaurant_bento: ['rice', 'broccoli', 'egg', 'berry'],
  park_garden: ['rose', 'tulip', 'sunflower'], park_birds: ['owl', 'bird', 'duck'],
  stadium_hoops: ['left', 'right', 'center'], stadium_goal: ['right', 'center', 'left'],
  hospital_checkup: ['bear', 'ruler', 'kind', 'star'], hospital_bandage: ['star', 'moon', 'blanket', 'heart'],
  vet_checkup: ['cat', 'scale', 'quiet', 'dog'], vet_groom: ['brush', 'towel', 'bow', 'camera'],
  fire_drill: ['help', 'follow', 'safe'], fire_rescue: ['firefighters', 'truck', 'barrier', 'record'],
  police_lost: ['umbrella', 'backpack', 'bear'], police_traffic: ['wait', 'crossing', 'adult']
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

test('all 11 functional buildings have two distinct, fully presented activities', () => {
  const ids = activityIDs()
  assert.equal(ids.length, 22)
  assert.equal(new Set(ids).size, 22)
  assert.equal(Object.keys(journeys).length, 20)
  const prefixes = [...new Set(ids.map(id => id.split('_')[0]))]
  assert.equal(prefixes.length, 11)
  for (const prefix of prefixes) assert.equal(ids.filter(id => id.startsWith(prefix + '_')).length, 2)
  for (const id of ids) {
    const detail = activityDetails(id)
    const session = createActivitySession(id, { activity_id: id, request_id: 'paid-once' })
    assert.equal(detail.id, id)
    assert.equal(session.kind, detail.kind)
    assert.ok(detail.title && detail.description && detail.duration && detail.icon)
    assert.ok(detail.seconds > 0)
    assert.ok(session.scene.caption && session.scene.prompt && session.scene.hero && session.scene.prop)
    assert.ok(/^#[a-f0-9]{6}$/i.test(session.scene.sky))
    assert.equal(session.progress, 0)
    assert.equal(session.complete, false)
    assert.ok(session.total >= 3)
    assert.doesNotThrow(() => JSON.stringify(session))
  }
})

for (const [id, answers] of Object.entries(journeys)) {
  test(id + ': follows visible clues to a complete, immutable player journey', () => {
    const receipt = deepFreeze({ activity_id: id, request_id: 'paid-' + id, price: 3, wallet: { coins: 20 } })
    let session = createActivitySession(id, receipt)
    for (let index = 0; index < answers.length; index += 1) {
      const oldSnapshot = JSON.stringify(session)
      deepFreeze(session)
      assert.ok(session.choices.some(item => item.id === answers[index]), 'the answer must be present in visible choices')
      const next = advanceActivity(session, { kind: 'choose', id: answers[index] })
      assert.equal(JSON.stringify(session), oldSnapshot, 'transition must not mutate input')
      assert.notEqual(next, session)
      assert.equal(next.step, index + 1)
      assert.equal(next.score, index + 1)
      assert.equal(next.attempts, index + 1)
      assert.equal(next.complete, index === answers.length - 1)
      assert.deepEqual(next.receipt, receipt)
      session = next
    }
    assert.equal(session.progress, 100)
    assert.equal(session.step, session.total)
    assert.ok(session.result.length > 12, 'the activity must end with a meaningful outcome')
    assert.deepEqual(session.choices, [])
    const afterExtraTap = advanceActivity(deepFreeze(session), { kind: 'choose', id: answers[0] })
    assert.deepEqual(afterExtraTap, session, 'taps after completion cannot add score or progress')
    const replay = createActivitySession(id, receipt)
    assert.equal(replay.step, 0)
    assert.equal(replay.complete, false)
    assert.deepEqual(replay.receipt, receipt, 'a replay retains the already-paid receipt')
  })
}

test('wrong answers explain the clue and cannot skip a round', () => {
  for (const [id, answers] of Object.entries(journeys)) {
    const session = createActivitySession(id, null)
    const correctIDs = session.kind === 'targets' ? answers : answers.slice(0, 1)
    const wrong = session.choices.find(choice => !correctIDs.includes(choice.id))
    assert.ok(wrong, id + ' should include a meaningful distractor')
    const next = advanceActivity(deepFreeze(session), { kind: 'choose', id: wrong.id })
    assert.equal(next.step, 0, id)
    assert.equal(next.score, 0)
    assert.equal(next.attempts, 1)
    assert.equal(next.complete, false)
    assert.ok(next.feedback.length > 5)
    assert.equal(next.scene.caption, session.scene.caption)
    assert.deepEqual(advanceActivity(next, { kind: 'next' }), next, 'next cannot bypass interactive tasks')
    assert.deepEqual(advanceActivity(next, { kind: 'tick' }), next, 'timer cannot bypass interactive tasks')
    assert.deepEqual(advanceActivity(next, { kind: 'choose', id: 'not-a-choice' }), next)
  }
})

test('collection games preserve chosen items and ignore a second tap on the same item', () => {
  for (const id of ['shop_basket', 'park_garden', 'park_birds']) {
    let session = createActivitySession(id, null)
    session = advanceActivity(session, { kind: 'choose', id: journeys[id][0] })
    const chosen = session.choices.find(choice => choice.id === journeys[id][0])
    assert.equal(chosen.selected, true)
    assert.equal(chosen.disabled, true)
    assert.equal(session.scene.items.find(item => item.id === chosen.id).selected, true)
    assert.deepEqual(advanceActivity(deepFreeze(session), { kind: 'choose', id: chosen.id }), session)
  }
})

test('both original movies have six animated scenes, can pause, and finish after the last frame', () => {
  for (const id of ['cinema_cloud', 'cinema_space']) {
    let session = createActivitySession(id, { activity_id: id })
    const scenes = new Set([session.scene.caption])
    const paused = advanceActivity(deepFreeze(session), { kind: 'toggle_pause' })
    assert.equal(paused.paused, true)
    assert.deepEqual(advanceActivity(paused, { kind: 'tick' }), paused)
    session = advanceActivity(paused, { kind: 'toggle_pause' })
    assert.equal(session.paused, false)
    for (let frame = 1; frame < 6; frame += 1) {
      session = advanceActivity(deepFreeze(session), { kind: 'tick' })
      assert.equal(session.step, frame)
      assert.equal(session.complete, false)
      assert.ok(session.scene.motion)
      scenes.add(session.scene.caption)
    }
    assert.equal(scenes.size, 6)
    session = advanceActivity(session, { kind: 'tick' })
    assert.equal(session.complete, true)
    assert.equal(session.progress, 100)
    assert.ok(session.result)
    assert.deepEqual(session.choices, [])
  }
})

test('sports accept directional position input and show the active target', () => {
  for (const id of ['stadium_hoops', 'stadium_goal']) {
    const session = createActivitySession(id)
    assert.equal(session.scene.target, journeys[id][0])
    const next = advanceActivity(session, { kind: 'choose', position: session.scene.target })
    assert.equal(next.score, 1)
    assert.equal(next.scene.target, journeys[id][1])
  }
})

test('unknown and prototype property IDs do not create activities', () => {
  for (const id of [null, undefined, '', 'missing', 'constructor', '__proto__', 'toString']) {
    assert.equal(activityDetails(id), null)
    assert.equal(createActivitySession(id, null), null)
    assert.equal(advanceActivity({ id }, { kind: 'next' }), null)
  }
  assert.equal(advanceActivity(null, { kind: 'next' }), null)
  const ids = activityIDs()
  ids.pop()
  assert.equal(activityIDs().length, 22, 'callers cannot mutate the activity catalog')
})
