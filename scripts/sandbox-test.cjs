const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture } = require('./home-room-test.cjs')
const { createWorld, BOTTOM, MIN, MAX } = require('../miniapp/home/utils/sandbox-world')
const { createSandboxPage, worldData, storageKey } = require('../miniapp/home/utils/sandbox-page')
const { recipes } = require('../miniapp/home/utils/sandbox-catalog')
const clone = value => JSON.parse(JSON.stringify(value))
const event = dataset => ({ currentTarget: { dataset } })
function at(w, x, y, z) { Object.assign(w.player, { x, y, z, vy: 0, grounded: true }) }
function harness(state = fixture(), storage = { token: 'test', userInfo: { id: 42 } }) {
  const navigations = [], errors = [], keys = {}
  const wx = { getStorageSync: k => storage[k], setStorageSync: (k, v) => { storage[k] = clone(v) }, removeStorageSync: k => delete storage[k], navigateTo: a => navigations.push(a.url), switchTab: a => navigations.push(a.url), redirectTo: a => navigations.push(a.url), onKeyDown: fn => { keys.down = fn }, onKeyUp: fn => { keys.up = fn }, offKeyDown: () => delete keys.down, offKeyUp: () => delete keys.up }
  const page = { ...createSandboxPage({ get: async () => clone(state) }, wx, e => errors.push(e)), data: clone(worldData), _visible: true,
    setData(patch) { for (const [k, v] of Object.entries(patch)) { const parts = k.split('.'); let dest = this.data; while (parts.length > 1) { const name = parts.shift(); dest = dest[name] || (dest[name] = {}) }; dest[parts[0]] = v } }
  }
  page.applyWorldState(state)
  return { page, storage, wx, navigations, errors, keys }
}
for (const [level, floors] of [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3]]) test(`level ${level} has ${floors} real storeys with floors, ceiling and stair openings`, () => {
  const w = createWorld(fixture(level)), n = w.home.size
  assert.equal(w.home.floors, floors)
  for (let f = 0; f < floors; f++) { assert.equal(w.block(2, f * 4 - 1, 2), f ? 'plank' : 'brick'); assert.equal(w.block(2, f * 4, 2), '') }
  assert.equal(w.block(2, floors * 4 - 1, 2), 'plank')
  if (floors > 1) { assert.equal(w.block(n - 3, 3, 2), ''); assert.equal(w.block(n - 3, 0, 1), 'stair') }
})
test('stairs can be walked up and down, and another flight reaches the third storey', () => {
  const w = createWorld(fixture(5)), x = w.home.size - 2.5
  at(w, x, 0, .5 + 1)
  // Approach the first step from the side, then walk along the flight.
  at(w, x - 1, 0, 1.5)
  for (let i = 0; i < 20; i++) w.move(.05, 0, .016)
  for (let i = 0; i < 85; i++) w.move(0, .04, .016)
  assert.ok(w.player.y >= 3.99, JSON.stringify(w.player))
  for (let i = 0; i < 25; i++) w.move(-.05, 0, .016)
  for (let i = 0; i < 80; i++) w.move(0, -.04, .016)
  for (let i = 0; i < 25; i++) w.move(.05, 0, .016)
  for (let i = 0; i < 85; i++) w.move(0, .04, .016)
  assert.ok(w.player.y >= 7.99, JSON.stringify(w.player))
  for (let i = 0; i < 90; i++) w.move(0, -.04, .016)
  for (let i = 0; i < 25; i++) w.move(-.05, 0, .016)
  for (let i = 0; i < 80; i++) w.move(0, 0, .016)
  assert.equal(w.player.y, 4)
})
test('closed doors collide, opening permits travel and closing cannot trap the player', () => {
  const w = createWorld(fixture()), d = w.doorways().find(d => d.id === 'home:door')
  at(w, d.x + .5, 0, d.z - .5)
  for (let i = 0; i < 20; i++) w.move(0, .08, .03)
  assert.ok(w.player.z < d.z)
  assert.equal(w.toggleDoor(d.id).ok, true)
  for (let i = 0; i < 12; i++) w.move(0, .06, .03)
  assert.ok(w.player.z > d.z)
  assert.equal(w.toggleDoor(d.id).ok, false)
  for (let i = 0; i < 30; i++) w.move(0, .06, .03)
  assert.equal(w.toggleDoor(d.id).ok, true)
})
test('the meadow has underground stone, two cave layers, accessible strange ores and unbreakable black bedrock', () => {
  const w = createWorld(fixture())
  assert.equal(w.block(32, -1, 32), 'grass'); assert.equal(w.block(32, -2, 32), 'dirt'); assert.equal(w.block(32, -5, 32), 'stone')
  assert.equal(w.block(-8, -7, -2), ''); assert.equal(w.block(-9, -12, -5), '')
  assert.equal(w.block(-10, -8, 2), 'moonstone')
  at(w, 31.5, BOTTOM + 1, 31.5)
  assert.equal(w.mine({ x: 31, y: BOTTOM, z: 31 }).ok, false); assert.equal(w.block(31, BOTTOM, 31), 'bedrock')
  at(w, 3.5, 0, 3.5); assert.equal(w.mine({ x: 0, y: 1, z: 3 }).ok, false)
})
test('digging and placing conserve material and cannot place inside the player', () => {
  const w = createWorld(fixture()); at(w, -3, 0, 6.5)
  assert.equal(w.mine({ x: -4, y: 1, z: 6 }).ok, true); assert.equal(w.inventory.log, 1); assert.equal(w.block(-4, 1, 6), '')
  assert.equal(w.place('log', { x: -3, y: 0, z: 6 }).ok, false)
  assert.equal(w.place('log', { x: -2, y: 0, z: 6 }).ok, true); assert.equal(w.inventory.log, 0)
  assert.equal(w.place('log', { x: -1, y: 0, z: 6 }).ok, false)
  assert.equal(w.mine({ x: -2, y: 0, z: 6 }).ok, true); assert.equal(w.inventory.log, 1)
})
test('recipes never give free material or partially consume an unaffordable recipe', () => {
  const w = createWorld(fixture()); w.inventory = { log: 1, sand: 2 }
  assert.equal(w.craft('plank').ok, true); assert.equal(w.inventory.log, 0); assert.equal(w.inventory.plank, 4)
  assert.equal(w.craft('plank').ok, false)
  const before = clone(w.inventory); assert.equal(w.craft('glass').ok, false); assert.deepEqual(w.inventory, before)
  assert.equal(w.craft('unlisted').ok, false)
})
test('mining crafted stairs returns a stair rather than multiplying the original wood', () => {
  const w = createWorld(fixture()); w.inventory.plank = 3; at(w, 13, 0, 26)
  assert.equal(w.craft('stair').ok, true); assert.equal(w.inventory.stair, 4)
  assert.equal(w.place('stair', { x: 14, y: 0, z: 26 }).ok, true)
  assert.equal(w.mine({ x: 14, y: 0, z: 26 }).ok, true)
  assert.equal(w.inventory.stair, 4); assert.equal(w.inventory.plank, 0)
})
test('blueprints require cleared grass, consume once, and built houses can be mined persistently', () => {
  const w = createWorld(fixture()); w.inventory.cottage = 1; at(w, 13, 0, 26)
  assert.equal(w.build('cottage', { x: 13, z: 26 }).ok, false)
  assert.equal(w.inventory.cottage, 1)
  assert.equal(w.build('cottage', { x: 18, z: 26 }).ok, true)
  assert.equal(w.inventory.cottage, 0); assert.equal(w.houses.length, 1)
  const h = w.houses[0]; at(w, h.x - 1, 0, h.z + 2)
  assert.equal(w.mine({ x: h.x, y: 1, z: h.z + 2 }).ok, true)
  const restored = createWorld(fixture(), w.serialize())
  assert.equal(restored.block(h.x, 1, h.z + 2), '')
  assert.equal(restored.block(h.x, 0, h.z + 2), 'brick')
})
test('a crafted two-block door opens, closes, and mining returns only one door', () => {
  const w = createWorld(fixture()); w.inventory.door = 1; at(w, 13, 0, 26)
  assert.equal(w.place('door', { x: 14, y: 0, z: 26 }).ok, true)
  const d = w.doorways().find(d => d.loose)
  assert.equal(w.toggleBlockDoor(d).ok, true); assert.equal(w.block(14, 0, 26), '')
  assert.equal(w.toggleBlockDoor(d).ok, true); assert.equal(w.block(14, 0, 26), 'door')
  assert.equal(w.mine({ x: 14, y: 1, z: 26 }).ok, true); assert.equal(w.inventory.door, 1)
  assert.equal(w.block(14, 0, 26), ''); assert.equal(w.block(14, 1, 26), '')
  assert.equal(w.doorways().some(d => d.loose), false)
})
test('only purchased furniture can be held and placed, then picked up and moved to another floor', () => {
  const state = fixture(3), w = createWorld(state); at(w, 4, 0, 4)
  assert.equal(w.placeFurniture('sofa', { x: 5, y: 0, z: 5 }).ok, false)
  assert.equal(w.pickFurniture('chair').ok, true)
  at(w, 3, 4, 3)
  assert.equal(w.placeFurniture('chair', { x: 5, y: 4, z: 4 }, 90).ok, true)
  assert.equal(w.furniture[0].y, 4); assert.equal(w.placeFurniture('chair', { x: 6, y: 4, z: 4 }).ok, false)
  const restored = createWorld(state, w.serialize()); assert.equal(restored.furniture[0].y, 4)
})
test('furniture needs a supported footprint, cannot overlap walls, another item, or the player', () => {
  const state = fixture(); state.furniture.find(i => i.id === 'sofa').owned = true
  const w = createWorld(state); at(w, 3.5, 0, 4)
  assert.equal(w.placeFurniture('sofa', { x: 3.5, y: 0, z: 4 }).ok, false)
  assert.equal(w.placeFurniture('sofa', { x: .5, y: 0, z: 2 }).ok, false)
  assert.equal(w.placeFurniture('sofa', { x: 3.5, y: 1, z: 2 }).ok, false)
  assert.equal(w.placeFurniture('sofa', { x: 3.5, y: 0, z: 2 }).ok, true)
})
test('old thin-wall layouts are rearranged safely and an open doorway cannot be blocked by furniture', () => {
  const state = fixture(); state.furniture.find(i => i.id === 'sofa').owned = true
  state.room.layout = [{ id: 'sofa', x: .5, y: 2.5, angle: 0, rotation: 0 }]
  const w = createWorld(state)
  assert.equal(w.rearranged, true); assert.equal(w.furniture.length, 1); assert.ok(w.furniture[0].x >= 2)
  assert.ok(w.headroom(w.player.x, w.player.y, w.player.z))
  at(w, 3.5, 0, 5); w.doors['home:door'] = true
  assert.equal(w.placeFurniture('chair', { x: 3.5, y: 0, z: 6.5 }).ok, false)
})
test('the complete strange-material recipe creates a portal with a real round trip and persistent dimension edits', () => {
  const w = createWorld(fixture()); w.inventory = { moonstone: 10, amethyst: 5, echo: 2, glow: 1 }
  for (let i = 0; i < 5; i++) assert.equal(w.craft('frame').ok, true)
  assert.equal(w.craft('portal').ok, true)
  at(w, 12, 0, 26)
  assert.equal(w.placePortal({ x: 15, y: 0, z: 26 }).ok, true); assert.equal(w.inventory.portal, 0)
  at(w, 16, 0, 28); assert.equal(w.travel(w.portals[0]).ok, true); assert.equal(w.dimension, 'aether')
  assert.ok(w.mobs.some(m => m.kind === 'stag')); assert.ok(w.portals.some(p => p.id === 'return'))
  const restored = createWorld(fixture(), w.serialize()); assert.equal(restored.dimension, 'aether')
  assert.equal(restored.travel(restored.portals.find(p => p.id === 'return')).ok, true)
  assert.equal(restored.dimension, 'meadow'); assert.equal(restored.player.x, 16)
})
test('raycasting reports the adjacent placement face and never selects through a wall', () => {
  const w = createWorld(fixture())
  const hit = w.raycast({ x: 3.5, y: 1.45, z: 3.5 }, { x: 0, y: 0, z: -1 })
  assert.equal(hit.z, 0); assert.deepEqual(hit.normal, { x: 0, y: 0, z: 1 }); assert.equal(hit.distance, 2.5)
  const floor = w.raycast({ x: 3.5, y: 1.45, z: 3.5 }, { x: 0, y: -1, z: 0 })
  assert.equal(floor.y, -1); assert.equal(floor.normal.y, 1)
})
test('corrupt or outdated local saves recover safely and bedrock edits are ignored', () => {
  const fresh = createWorld(fixture(), { version: 99 }); assert.equal(fresh.restored, false)
  const s = fresh.serialize(); s.edits.meadow.push([2, BOTTOM, 2, ''], [0, 1, 0, ''], [NaN, 0, 2, 'stone']); s.player.x = 1000000; s.inventory.invalid = 999
  const w = createWorld(fixture(), s)
  assert.equal(w.block(2, BOTTOM, 2), 'bedrock'); assert.equal(w.block(0, 1, 0), 'plank'); assert.ok(w.player.x <= MAX); assert.equal(w.inventory.invalid, undefined)
})
test('walking respects walls and world edges; jumping lands without falling through the floor', () => {
  const w = createWorld(fixture()); at(w, 1.5, 0, 1.5)
  for (let i = 0; i < 60; i++) w.move(-.05, 0, .016)
  assert.ok(w.player.x >= 1.2)
  w.move(0, 0, .016, true); let max = w.player.y
  for (let i = 0; i < 100; i++) { w.move(0, 0, .016); max = Math.max(max, w.player.y) }
  assert.ok(max > .8); assert.equal(w.player.y, 0); assert.equal(w.player.grounded, true)
  at(w, MIN + .5, 0, 30); for (let i = 0; i < 60; i++) w.move(-.05, 0, .016); assert.ok(w.player.x > MIN)
})
test('animals wander, respond nearby, and remain different from the creatures in the other dimension', () => {
  const w = createWorld(fixture()), m = w.mobs[0], before = { x: m.x, z: m.z }
  for (let i = 0; i < 60; i++) w.tickMobs(.016)
  assert.notDeepEqual({ x: m.x, z: m.z }, before)
  at(w, m.x + 1, 0, m.z); assert.equal(w.interactMob(m.id).ok, true); assert.ok(m.friendly > 0)
  at(w, 30, 0, 30); assert.equal(w.interactMob(m.id).ok, false)
})
test('save keys isolate both backend and account', () => {
  const a = harness(), b = harness(fixture(), { token: 'test', userInfo: { id: 43 } }), c = harness(fixture(), { token: 'test', userInfo: { id: 42 }, apiBackend: 'another' })
  assert.notEqual(a.page._storageKey, b.page._storageKey); assert.notEqual(a.page._storageKey, c.page._storageKey)
  a.page.onUnload(); b.page.onUnload(); c.page.onUnload()
})
test('purchased furniture arrives in the hand, persists across a shop visit, and is not granted by a stale request', () => {
  const state = fixture(); state.furniture.find(i => i.id === 'sofa').owned = true
  const h = harness(state, { token: 'test', userInfo: { id: 42 }, homeRoomRequested: 'sofa' })
  assert.equal(h.page.data.held, 'sofa'); assert.equal(h.page.data.heldKind, 'furniture'); assert.equal(h.storage.homeRoomRequested, undefined)
  h.page.onWorldShop(); assert.deepEqual(h.navigations, ['/home/pages/mall/mall'])
  h.page.onHide(); const again = harness(state, h.storage); assert.ok(again.page._world.restored)
  h.page.onUnload(); again.page.onUnload()
  const missing = harness(fixture(), { token: 'test', homeRoomRequested: 'sofa' }); assert.equal(missing.page.data.held, ''); missing.page.onUnload()
})
test('keyboard repeat cannot toggle a door twice, panels and hidden pages stop movement, and unload removes handlers', () => {
  const h = harness(); h.page.bindWorldKeyboard(); h.page.setWorldKey('w', true); h.page.tickWorld(.03)
  const before = clone(h.page._world.player); h.page.onWorldBag(); h.page.tickWorld(.03)
  assert.equal(h.page._world.player.z, before.z); assert.equal(h.page._keys.size, 0)
  h.page.onHide(); h.page.setWorldKey('w', true); h.page.tickWorld(.1); assert.equal(h.page._world.player.z, before.z); assert.deepEqual(h.keys, {})
  h.page.onUnload()
})
test('save failures remain visible and a retry saves the same live world', () => {
  const h = harness(); const save = h.wx.setStorageSync; h.wx.setStorageSync = () => { throw Error('full') }
  h.page.flushWorldSave(); assert.match(h.page.data.saveLabel, /失败/)
  h.wx.setStorageSync = save; h.page.flushWorldSave(); assert.match(h.page.data.saveLabel, /已保存/); assert.ok(h.storage[h.page._storageKey]); h.page.onUnload()
})
test('native keyboard string flags allow walking, mining and door interaction, but keep real shortcuts alone', () => {
  const h = harness(), p = h.page, w = p._world
  p._scene = { start() {}, stop() {}, dispose() {}, swing() {}, showPreview() {}, select() {}, aim: () => ({ kind: 'door', id: 'home:door', object: { door: w.doorways().find(d => d.id === 'home:door') } }) }
  p.bindWorldKeyboard()
  const native = key => ({ key, code: 'Key' + key.toUpperCase(), altKey: 'false', shiftKey: 'false' })
  const before = w.player.z
  h.keys.down(native('w')); p.tickWorld(.05); h.keys.up(native('w'))
  assert.ok(Math.abs(w.player.z - before) > .1, 'a native W event must move the character')
  assert.equal(p._keys.size, 0, 'native keyup must release walking')
  h.keys.down(native('e')); h.keys.up(native('e'))
  assert.equal(w.doors['home:door'], true, 'native E opens the nearby door')
  h.keys.down(native('f')); assert.equal(p._mineHeld, true)
  h.keys.up(native('f')); assert.equal(p._mineHeld, false)
  h.keys.down({ ...native('w'), altKey: 'true' }); assert.equal(p._keys.size, 0)
  p.onUnload()
})
test('a short arrow tap takes a step, holding stops on release, and cancellation or a panel clears motion', () => {
  const { page: p } = harness(), e = event({ key: 'w' })
  p._world.doors['home:door'] = true
  const before = p._world.player.z
  p.onWorldKeyStart(e); p.onWorldKeyEnd(e); p.onWorldKeyTap(e)
  for (let i = 0; i < 12; i++) p.tickWorld(.025)
  assert.ok(p._world.player.z > before + .4)
  const stopped = p._world.player.z; p.tickWorld(.05); assert.equal(p._world.player.z, stopped)
  p.onWorldKeyStart(e); p._walkPressAt.w -= 500; p.tickWorld(.05); p.onWorldKeyEnd(e); p.onWorldKeyTap(e)
  const released = p._world.player.z; p.tickWorld(.05); assert.equal(p._world.player.z, released)
  p.onWorldKeyStart(e); p.onWorldKeyCancel(e); p.onWorldKeyTap(e); p.tickWorld(.05)
  assert.equal(p._world.player.z, released)
  p.onWorldKeyTap(e); p.onWorldBag(); p.tickWorld(.05)
  assert.equal(p._world.player.z, released); assert.equal(p._walkPulse, null)
  p.onUnload()
})
test('home and return-home spawn face a reachable door with a clear way out', () => {
  for (let level = 1; level <= 5; level++) {
    const w = createWorld(fixture(level)); w.goHome()
    const p = w.player, hit = w.raycast({ x: p.x, y: p.y + 1.45, z: p.z }, { x: -Math.sin(p.yaw), y: 0, z: -Math.cos(p.yaw) })
    assert.equal(hit.id, 'door'); assert.ok(hit.distance < 2)
    w.toggleDoor('home:door')
    for (let i = 0; i < 35; i++) w.move(0, .08, .025)
    assert.ok(w.player.z > w.home.size)
  }
})
test('releasing a held mining button does not queue another block through the following tap', () => {
  const { page: p } = harness()
  p.onWorldMineStart(); p._mineStartTime -= 500; p.onWorldMineEnd(); p.onWorldMine()
  assert.equal(!!p._mineHeld, false); assert.equal(!!p._miningOnce, false)
  p.onWorldMineStart(); p.onWorldMineEnd(); p.onWorldMine()
  assert.equal(p._miningOnce, true, 'a short click still mines one block')
  p.onUnload()
})
