const test = require('node:test')
const assert = require('node:assert/strict')
const { walkingMap, routeBetween, strollingActors, stepDirection, createStroll } = require('../miniapp/utils/town-stroll')
const { strollArt } = require('../miniapp/utils/stroll-art')

function fakeClock() {
  let now = 0, serial = 0
  const tasks = new Map()
  return {
    setTimeout(fn, delay) { const id = ++serial; tasks.set(id, { fn, at: now + delay }); return id },
    clearTimeout(id) { tasks.delete(id) },
    pending() { return tasks.size },
    tick(ms) {
      const end = now + ms
      let count = 0
      while (tasks.size) {
        const [id, task] = [...tasks].sort((a, b) => a[1].at - b[1].at)[0]
        if (task.at > end) break
        if (++count > 10000) throw Error('Timer loop did not settle')
        now = task.at; tasks.delete(id); task.fn()
      }
      now = end
    }
  }
}
module.exports = { fakeClock }

if (require.main === module) {
  const plots = Array.from({ length: 8 }, (_, i) => ({ occupied: i < 5, name: ['商店', '医院', '公园', '消防站', '宠物医院'][i] }))
  const growth = { resident: { outfit_id: 'builder' } }
  const life = { companions: [{ id: 'dog', icon: '🐶' }, { id: 'cat', icon: '🐱' }], petResting: false, event: null }

  test('walk routes stay on grass corridors for empty, partial and full towns', () => {
    for (const count of [0, 1, 5, 11]) for (const withHome of [false, true]) {
      const map = walkingMap(Array.from({ length: Math.max(6, count) }, (_, i) => ({ occupied: i < count, name: '建筑' + i })), withHome)
      assert.ok(map.stops.length >= 2)
      for (const from of map.stops) for (const to of map.stops) {
        let previous = from
        for (const next of routeBetween(from, to)) {
          assert.ok(next.x > 0 && next.x < 100 && next.y > 0 && next.y < map.height)
          assert.ok(next.x === previous.x || next.y === previous.y, 'never walk diagonally through a building')
          if (next.y !== previous.y) assert.ok(Math.abs(next.x - 100 / 3) < .01 || Math.abs(next.x - 200 / 3) < .01, 'vertical travel uses a gap between building columns')
          else assert.ok(map.stops.some(stop => stop.y === next.y), 'horizontal travel uses a lane in front of a building row')
          previous = next
        }
        assert.equal(previous.x, to.x); assert.equal(previous.y, to.y)
      }
    }
  })

  test('only owned healthy pets roam and the sick resident stays home', () => {
    const normal = strollingActors(growth, life)
    assert.deepEqual(normal.filter(a => a.type === 'pet').map(a => a.id), ['pet-dog', 'pet-cat'])
    assert.equal(normal.find(a => a.id === 'town-host').outfit, 'builder')
    assert.equal(strollingActors(growth, { ...life, companions: [] }).filter(a => a.type === 'pet').length, 0)
    assert.equal(strollingActors(growth, { ...life, petResting: true }).filter(a => a.type === 'pet').length, 0)
    assert.equal(strollingActors(growth, { ...life, event: { kind: 'resident_sick' } }).some(a => a.id === 'town-host'), false)
    assert.equal(strollingActors(null, null).length, 4)
  })

  test('elderly, adult and child neighbors keep their own identities across every player outfit', () => {
    let expected
    for (const outfit of ['everyday', 'builder', 'gardener', 'explorer']) {
      const actors = strollingActors({resident:{outfit_id:outfit}}, life)
      const host = actors.find(actor => actor.id === 'town-host')
      const neighbors = actors.filter(actor => actor.villager)
      assert.equal(host.outfit,outfit)
      assert.equal(host.isHost,true)
      assert.equal(actors.filter(actor => actor.isHost).length,1)
      assert.deepEqual(neighbors.map(actor => actor.villager),['grandpa','grandma','adult','child'])
      assert.ok(neighbors.every(actor => !actor.outfit))
      assert.ok(neighbors.find(actor=>actor.villager==='grandpa').speed < neighbors.find(actor=>actor.villager==='child').speed)
      if (expected) assert.deepEqual(neighbors,expected)
      expected=neighbors
      for (const neighbor of neighbors) for (const direction of ['down','up','left','right']) {
        const art=strollArt(neighbor,direction)
        assert.equal(art.src,'/images/resident/villager-directions.png')
        assert.notDeepEqual(art,strollArt(host,direction))
      }
    }
    const frames = expected.flatMap(actor => ['down','up','left','right'].map(direction => strollArt(actor,direction)))
    assert.equal(new Set(frames.map(art=>JSON.stringify(art))).size,16)
  })

  test('neighbors and both pets travel between rows, pause, and turn independently', () => {
    const clock = fakeClock(), frames = []
    let n = 0
    const stroll = createStroll(actors => frames.push(structuredClone(actors)), clock, () => [0.1, .4, .8, .2][n++ % 4])
    stroll.sync(walkingMap(plots, true), strollingActors(growth, life)); stroll.start()
    const initial = frames[0]
    clock.tick(120000)
    for (const actor of initial) {
      const states = frames.map(frame => frame.find(a => a.id === actor.id))
      assert.ok(states.some(a => a.y !== actor.y), actor.id + ' visits another row')
      assert.ok(states.some(a => a.moving && a.duration > 0))
      assert.ok(states.some(a => !a.moving && a.bubble))
      assert.ok(states.some(a => a.direction === 'left'))
    }
    assert.ok(frames.some(frame => frame.some(a => a.moving) && frame.some(a => !a.moving)), 'actors are not synchronized')
    stroll.destroy()
    assert.equal(clock.pending(), 0)
  })

  test('entering a small town keeps villagers apart and marks only the player', () => {
    const frames=[]
    const stroll=createStroll(actors=>frames.push(actors),fakeClock())
    stroll.sync(walkingMap([{occupied:true,name:'我的家'}],false),strollingActors(growth,life))
    const actors=frames.at(-1)
    assert.equal(actors.length,7)
    assert.equal(new Set(actors.map(actor=>actor.x+':'+actor.y)).size,actors.length)
    assert.equal(actors.filter(actor=>actor.isHost).length,1)
    assert.equal(actors.find(actor=>actor.isHost).id,'town-host')
    assert.ok(actors.every(actor=>actor.x>=5&&actor.x<=95))
    stroll.destroy()
  })

  test('vertical steps face up or down regardless of the previous horizontal direction', () => {
    for (const previous of ['left', 'right']) {
      assert.equal(stepDirection(0, -100, previous), 'up')
      assert.equal(stepDirection(0, 100, previous), 'down')
    }
    assert.equal(stepDirection(-100, 0, 'up'), 'left')
    assert.equal(stepDirection(100, 0, 'down'), 'right')
    assert.equal(stepDirection(0, 0, 'up'), 'up')
  })

  test('every moving actor uses the matching view at turns and keeps it when resting', () => {
    const clock = fakeClock(), frames = []
    let n = 0
    const stroll = createStroll(actors => frames.push(structuredClone(actors)), clock, () => [0.1, .4, .8, .2][n++ % 4])
    const actors = strollingActors(growth, life)
    stroll.sync(walkingMap(plots, true), actors); stroll.start(); clock.tick(240000)
    const seen = new Set()
    for (let frame = 1; frame < frames.length; frame++) for (const current of frames[frame]) {
      const previous = frames[frame - 1].find(a => a.id === current.id)
      const dx = current.x - previous.x, dy = current.y - previous.y
      if (current.moving && (dx || dy)) {
        const expected = dy ? dy > 0 ? 'down' : 'up' : dx > 0 ? 'right' : 'left'
        assert.equal(current.direction, expected, current.id + ' faces its actual next step')
        assert.deepEqual(current.art, strollArt(actors.find(a => a.id === current.id), expected))
        seen.add(current.type + ':' + expected)
      } else if (!current.moving && previous.moving) {
        assert.equal(current.direction, previous.direction, 'resting does not snap back to a front view')
        assert.deepEqual(current.art, previous.art)
      }
    }
    for (const type of ['person', 'pet']) for (const direction of ['up', 'down', 'left', 'right']) assert.ok(seen.has(type + ':' + direction))
    stroll.destroy()
  })

  test('all outfits and both pets have four distinct directional frames', () => {
    const directions = ['down', 'up', 'left', 'right']
    for (const outfit of ['everyday', 'builder', 'gardener', 'explorer']) {
      const frames = directions.map(direction => strollArt({ type: 'person', outfit }, direction))
      assert.equal(new Set(frames.map(art => JSON.stringify(art))).size, 4)
      assert.ok(frames.every(art => art.scaleY === 400))
    }
    const dog = directions.map(direction => strollArt({ type: 'pet', petId: 'dog' }, direction))
    const cat = directions.map(direction => strollArt({ type: 'pet', petId: 'cat' }, direction))
    assert.equal(new Set(dog.concat(cat).map(art => JSON.stringify(art))).size, 8)
    assert.ok(dog.concat(cat).every(art => art.scale === 400 && art.scaleY === 200))
  })

  test('wallet-only refresh does not restart a route and hiding cancels all timers', () => {
    const clock = fakeClock(), frames = []
    const stroll = createStroll(actors => frames.push(actors), clock, () => .2)
    const map = walkingMap(plots, true), actors = strollingActors(growth, life)
    stroll.sync(map, actors); stroll.start(); stroll.start(); clock.tick(2000)
    const count = frames.length, pending = clock.pending()
    stroll.sync(structuredClone(map), strollingActors(growth, { ...life, wallet: { coins: 99 } }))
    assert.equal(frames.length, count); assert.equal(clock.pending(), pending)
    stroll.stop(); assert.equal(clock.pending(), 0)
    clock.tick(60000); assert.equal(frames.length, count)
    stroll.start(); clock.tick(2000); assert.ok(frames.length > count)
    stroll.destroy()
    const finalCount = frames.length
    stroll.start(); stroll.sync(map, actors); clock.tick(60000)
    assert.equal(clock.pending(), 0); assert.equal(frames.length, finalCount)
  })

  test('pet purchase and sickness replace actors without leaving old timers running', () => {
    const clock = fakeClock(), frames = []
    const stroll = createStroll(actors => frames.push(actors), clock, () => .2)
    const map = walkingMap(plots, true)
    stroll.sync(map, strollingActors(growth, null)); stroll.start(); clock.tick(1000)
    stroll.sync(map, strollingActors(growth, life))
    assert.equal(frames.at(-1).filter(a => a.type === 'pet').length, 2)
    assert.equal(clock.pending(), 7)
    stroll.sync(map, strollingActors(growth, { ...life, petResting: true }))
    assert.equal(frames.at(-1).filter(a => a.type === 'pet').length, 0)
    assert.equal(clock.pending(), 5)
    clock.tick(60000)
    assert.equal(frames.at(-1).filter(a => a.type === 'pet').length, 0)
    stroll.destroy()
  })
}
