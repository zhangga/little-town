const test = require('node:test'), assert = require('node:assert/strict')
const { fixture } = require('./home-room-test.cjs')
const { createWorld, MIN, MAX, BOTTOM } = require('../miniapp/home/utils/sandbox-world')
const { blocks } = require('../miniapp/home/utils/sandbox-catalog')
const { createSandboxPage, worldData } = require('../miniapp/home/utils/sandbox-page')
const { transferCrafts } = require('../miniapp/home/utils/nature-transfer')
const { restore: restoreNature, craft: craftNature, bench } = require('../miniapp/home/utils/nature-resources')
const { mirrorFace } = require('../miniapp/home/utils/sandbox-reflections')
const clone = value => JSON.parse(JSON.stringify(value))
const state = () => { const s = fixture(3); s.room.layout = []; return s }
const at = (w, x, y, z) => Object.assign(w.player, { x, y, z, vy: 0, grounded: true })
function mineVein(w, id, count) {
  let mined = 0
  for (let z = 0; z <= 13; z++) for (let y = -10; y <= -1; y++) {
    if (mined === count) return
    if (w.block(-5, y, z) !== id || w.solid(-6, y, z)) continue
    at(w, -6.5, w.floorY(-6.5, z + .5, 0), z + .5)
    assert.ok(w.headroom(w.player.x, w.player.y, w.player.z))
    const hit = w.raycast({ x: -6.5, y: y + .5, z: z + .5 }, { x: 1, y: 0, z: 0 })
    assert.equal(hit.id, id); assert.equal(w.mine(hit).ok, true); mined++
  }
  assert.equal(mined, count, 'accessible vein: ' + id)
}
test('real minerals are exposed in the world mine and distributed underground in both dimensions', () => {
  const w = createWorld(state())
  for (const dim of ['meadow', 'aether']) {
    w.dimension = dim
    for (const id of ['coal', 'copper', 'iron', 'quartz', 'silver', 'amethyst', 'fluorite']) mineVein(w, id, 2)
    const found = new Set()
    for (let x = 0; x < 16; x++) for (let z = -20; z < -12; z++) for (let y = -19; y < -5; y++) found.add(w.block(x, y, z))
    for (const id of ['copper', 'quartz', 'silver', 'fluorite']) assert.ok(found.has(id), dim + ':' + id)
  }
})
test('mine actual supplies, craft reflective blocks, take them home, move them and reload without duplication', () => {
  let w = createWorld(state())
  mineVein(w, 'coal', 2); mineVein(w, 'quartz', 1); mineVein(w, 'silver', 2)
  at(w, 25, 0, 24)
  for (const [x, z] of [[24, 23], [24, 24], [25, 23], [25, 24]]) { assert.equal(w.block(x, -1, z), 'sand'); assert.equal(w.mine({ x, y: -1, z }).ok, true) }
  assert.equal(w.craft('glass').ok, true); assert.equal(w.craft('glass').ok, true)
  assert.equal(w.craft('white_glass').ok, true); assert.equal(w.craft('mirror').ok, true)
  assert.equal(w.inventory.glass, 1); assert.equal(w.inventory.white_glass, 1); assert.equal(w.inventory.mirror, 1)
  w.goHome(); at(w, 3.5, 0, 4.5)
  assert.equal(w.place('mirror', { x: 3, y: 1, z: 1 }, 0).ok, true)
  assert.equal(w.place('white_glass', { x: 5, y: 0, z: 3 }).ok, true)
  w = createWorld(state(), w.serialize())
  assert.equal(w.block(3, 1, 1), 'mirror'); assert.equal(w.block(5, 0, 3), 'white_glass')
  assert.deepEqual(w.reflectors(), [{ x: 3, y: 1, z: 1, angle: 0 }])
  assert.equal(w.mine({ x: 3, y: 1, z: 1 }).ok, true)
  assert.equal(w.place('mirror', { x: 1, y: 1, z: 4 }, 90).ok, true)
  assert.equal(w.mine({ x: 5, y: 0, z: 3 }).ok, true)
  assert.equal(w.inventory.mirror, 0); assert.equal(w.inventory.white_glass, 1)
  assert.equal(w.place('mirror', { x: 2, y: 1, z: 2 }).ok, false)
  w = createWorld(state(), w.serialize()); assert.equal(w.reflectors()[0].angle, 90)
  assert.equal(w.block(3, 1, 1), ''); assert.equal(w.block(1, 1, 4), 'mirror')
  const inventory = clone(w.inventory); assert.equal(w.craft('white_glass').ok, false); assert.deepEqual(w.inventory, inventory)
})
test('the river crosses every row in both dimensions, can be waded and exited, and supports placing across it', () => {
  const w = createWorld(state())
  for (const dim of ['meadow', 'aether']) {
    w.dimension = dim
    for (let z = MIN; z <= MAX; z++) {
      const row = []; for (let x = MIN; x <= MAX; x++) if (w.block(x, -1, z) === 'water') row.push(x)
      assert.ok(row.length >= 2, dim + ':' + z)
      row.forEach(x => { assert.equal(w.block(x, -2, z), 'sand'); assert.equal(w.solid(x, -1, z), false) })
    }
    const z = 5, water = []; for (let x = 20; x < MAX; x++) if (w.block(x, -1, z) === 'water') water.push(x)
    at(w, water[0] - .5, 0, z + .5)
    let entered = false
    for (let i = 0; i < 320; i++) { w.move(.04, 0, .016); if (w.player.y < -.5) entered = true }
    assert.ok(entered); assert.equal(w.player.y, 0); assert.ok(w.player.x > water.at(-1) + 1)
    at(w, water[0] - .5, 0, z + .5)
    assert.equal(w.mine({ x: water[0], y: -1, z }).ok, false); assert.equal(w.inventory.water, undefined)
    const hit = w.raycast({ x: water[0] + .5, y: 2, z: z + .5 }, { x: 0, y: -1, z: 0 })
    assert.equal(hit.id, 'sand'); assert.equal(hit.y, -2)
    w.inventory.stone = 1; assert.equal(w.place('stone', { x: water[0], y: -1, z }).ok, true)
    assert.equal(w.solid(water[0], -1, z), true)
  }
})
test('old saves keep edits and furniture, new mirror directions are bounded and cannot change protected walls', () => {
  const w = createWorld(state()), old = w.serialize()
  delete old.orientations; delete old.natureTransfer
  old.edits.meadow.push([32, -1, 6, 'brick'], [3, 1, 1, 'mirror'])
  old.inventory.white_glass = 2
  const loaded = createWorld(state(), old)
  assert.equal(loaded.block(32, -1, 6), 'brick'); assert.equal(loaded.block(3, 1, 1), 'mirror'); assert.equal(loaded.reflectors()[0].angle, 0)
  at(loaded, 3, 0, 3)
  assert.equal(loaded.place('white_glass', { x: 0, y: 1, z: 3 }).ok, false)
  assert.equal(loaded.block(0, BOTTOM, 0), 'bedrock')
  for (const angle of [0, 90, 180, 270]) { const f = mirrorFace({ x: 2, y: 1, z: 4, angle }); assert.equal(Math.hypot(f.nx, f.nz), 1); assert.ok(Math.abs(f.x - 2.5) + Math.abs(f.z - 4.5) > .5) }
})
for (const failure of [1, 2, 3]) test('glade transfer survives failure at write ' + failure + ' and reload, preserving exactly one copy', () => {
  const storage = { nature: { version: 1, clock: 6, inventory: { mirror: 2, white_glass: 3, glass: 1, silver: 4 }, veins: {} } }
  let writes = 0
  const wx = { getStorageSync: k => clone(storage[k] || null), setStorageSync(k, v) { if (++writes === failure) throw Error('full'); storage[k] = clone(v) } }
  let w = createWorld(state())
  assert.throws(() => transferCrafts(wx, 'nature', 'world', w), /full/)
  w = createWorld(state(), storage.world); writes = 10
  transferCrafts(wx, 'nature', 'world', w); transferCrafts(wx, 'nature', 'world', w)
  assert.equal(w.inventory.mirror, 2); assert.equal(w.inventory.white_glass, 3); assert.equal(w.inventory.glass, 1)
  assert.equal(storage.nature.inventory.mirror, 0); assert.equal(storage.nature.inventory.silver, 4)
  assert.equal(storage.nature.pendingTransfer, undefined)
  const restored = createWorld(state(), storage.world); assert.equal(restored.inventory.mirror, 2)
})
test('crafting in the glade preserves an interrupted transfer and both batches arrive exactly once', () => {
  const pending = { sequence: 1, items: { mirror: 1 } }
  const source = restoreNature({ version: 1, transferSequence: 1, pendingTransfer: pending, inventory: { glass: 1, silver: 2 } })
  const made = craftNature(source, 'mirror', bench); assert.equal(made.ok, true); assert.deepEqual(made.state.pendingTransfer, pending)
  const storage = { nature: made.state }, wx = { getStorageSync: k => clone(storage[k] || null), setStorageSync: (k, v) => { storage[k] = clone(v) } }, w = createWorld(state())
  assert.equal(transferCrafts(wx, 'nature', 'world', w), 2); assert.equal(w.inventory.mirror, 2)
  assert.equal(transferCrafts(wx, 'nature', 'world', w), 0); assert.equal(w.natureTransfer, 2)
})
test('world page transfers only the current account/environment and exposes mirror rotation and crafting in the same bag', () => {
  const s = state(), storage = { userInfo: { id: 42 }, apiBackend: 'local', token: 'test', 'nature-world-v1:local:42': { version: 1, inventory: { mirror: 1, white_glass: 1 } }, 'nature-world-v1:local:43': { version: 1, inventory: { mirror: 8 } } }
  const wx = { getStorageSync: k => storage[k], setStorageSync: (k, v) => { storage[k] = clone(v) } }
  const page = { ...createSandboxPage({}, wx), data: clone(worldData), setData(patch) { Object.assign(this.data, patch) } }
  page.applyWorldState(s)
  assert.equal(page._world.inventory.mirror, 1); assert.equal(storage['nature-world-v1:local:43'].inventory.mirror, 8)
  assert.ok(page.data.bagItems.some(i => i.id === 'white_glass')); assert.ok(page.data.recipeItems.some(r => r.id === 'mirror'))
  page._world.player.yaw = Math.PI / 2; page.chooseWorldItem('mirror', 'block'); assert.equal(page.data.rotation, 90)
  page.onWorldRotate(); assert.equal(page.data.rotation, 180)
  page.applyWorldState(s); assert.equal(page._world.inventory.mirror, 1)
})
test('an unreadable world save cannot be replaced by a fresh world during a glade transfer', () => {
  let writes = 0
  const wx = { getStorageSync(k) { if (k.startsWith('voxel-world:')) throw Error('read failed'); return k === 'userInfo' ? { id: 42 } : k.startsWith('nature-world') ? { version: 1, inventory: { mirror: 1 } } : null }, setStorageSync() { writes++ } }
  const page = { ...createSandboxPage({}, wx), data: clone(worldData), setData(patch) { Object.assign(this.data, patch) } }
  page.applyWorldState(state()); assert.equal(page.data.failed, true); assert.equal(page._world, undefined); assert.equal(writes, 0)
})
