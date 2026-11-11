const { blocks, recipes, species } = require('./sandbox-catalog')
const MIN = -24, MAX = 43, BOTTOM = -20, TOP = 26, HEIGHT = 1.65, RADIUS = .23
const key = (x, y, z) => x + ',' + y + ',' + z
const hash = (x, y, z) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + 19.19) * 43758.5453
  return n - Math.floor(n)
}
const finite = n => typeof n === 'number' && Number.isFinite(n)
const inside = (x, y, z) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && x >= MIN && x <= MAX && z >= MIN && z <= MAX && y >= BOTTOM && y <= TOP
const clone = value => JSON.parse(JSON.stringify(value))
const floorCount = home => Math.max(1, Math.min(3, Number(home.floors) || Math.ceil((home.level || 1) / 2)))
// Shallow, continuous channels in both dimensions; their water stays below the banks.
const riverDistance = (x, z) => Math.abs(x + .5 - (29 + Math.sin((z + .5) * .16) * 3))
const riverWidth = z => 1.6 + .35 * Math.sin(z * .23)

function createWorld(resident, saved) {
  let catalog = resident.furniture || []
  const size = Math.max(7, Math.min(20, resident.room && resident.room.size || resident.home.size || 7))
  const home = { id: 'home', x: 0, z: 0, size, floors: floorCount(resident.home), locked: true }
  const shop = { id: 'shop', x: -18, z: 18, size: 7, floors: 1, locked: true }
  const edits = { meadow: new Map(), aether: new Map() }, structures = new Map(), trees = { meadow: new Map(), aether: new Map() }
  const world = {
    version: 1, dimension: 'meadow', inventory: {}, houses: [], doors: {}, portals: [], furniture: [],
    orientations: { meadow: {}, aether: {} }, natureTransfer: 0,
    player: spawn(),
    home, shop, revision: 0, terrainRevision: 0, dirtyChunks: new Set(), mobs: [], time: 0
  }
  let nextId = 1
  function touch(x, z) {
    world.revision++; world.terrainRevision++
    for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) world.dirtyChunks.add(Math.floor((x + dx) / 8) + ',' + Math.floor((z + dz) / 8))
  }
  function addTree(dim, x, z, tall) {
    if (riverDistance(x, z) < riverWidth(z) + 2) return
    for (let y = 0; y < tall; y++) trees[dim].set(key(x, y, z), dim === 'meadow' ? 'log' : 'violet')
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = tall - 1; y <= tall + 1; y++) {
      if (Math.abs(dx) + Math.abs(dz) + (y - tall + 1) > 4 || (!dx && !dz && y < tall)) continue
      trees[dim].set(key(x + dx, y, z + dz), dim === 'meadow' ? 'leaves' : 'crystal')
    }
  }
  for (const [x, z, h] of [[-4, 6, 4], [-12, -9, 5], [-17, 2, 4], [9, -7, 5], [23, 4, 5], [31, 13, 4], [35, 31, 5], [4, 32, 4], [-9, 32, 5], [25, -14, 4], [36, -4, 5], [-20, -18, 4]]) addTree('meadow', x, z, h)
  for (const [x, z, h] of [[-5, 2, 4], [8, 1, 5], [13, 14, 4], [-10, 20, 5], [24, 26, 5], [32, 8, 4], [-18, -10, 5], [10, -14, 4]]) addTree('aether', x, z, h)
  for (const z of [-19, -11, 36, 41]) for (const x of [-18, -9, 1, 12, 24, 36, 41]) {
    if (x === -9 && z < 0) continue
    addTree('meadow', x, z, 4 + Math.floor(hash(x, 0, z) * 3))
    if (hash(x, 1, z) > .35) addTree('aether', x, z, 4 + Math.floor(hash(x, 2, z) * 3))
  }

  function terrain(dim, x, y, z) {
    if (y === BOTTOM || x < MIN || x > MAX || z < MIN || z > MAX || y < BOTTOM) return 'bedrock'
    if (y > TOP) return ''
    const tree = trees[dim].get(key(x, y, z))
    if (tree) return tree
    if (y >= 0) return ''
    const bank = riverDistance(x, z), width = riverWidth(z)
    if (y === -1 && bank < width) return 'water'
    if (y >= -2 && bank < width + .9) return 'sand'
    // An open stair-shaped ravine leads naturally from the meadow into both cave layers.
    const ravine = x >= -9 && x <= -6 && z >= -3 && z <= 17
    const ravineFloor = -1 - Math.max(0, Math.floor((17 - z) / 2))
    if (ravine && y > ravineFloor) return ''
    // Keep a walkable edge beside the veins where the ravine joins the deep cavern.
    if (x >= -7 && x <= -6 && z >= 0 && z <= 13 && y === ravineFloor) return 'stone'
    // Keep the seam on the ravine wall even where it meets a natural cavern.
    if (y <= -4 && y >= -12 && x === -10 && z >= -2 && z <= 8) return ['moonstone', 'amethyst', 'echo', 'glow'][(z + 18) % 4]
    // Exposed veins on the other ravine wall are reachable from its descending steps.
    if (x === -5 && z >= 0 && z <= 13 && y >= ravineFloor + 1 && y <= ravineFloor + 2) return ['fluorite', 'amethyst', 'silver', 'quartz', 'iron', 'copper', 'coal'][Math.floor(z / 2)]
    const tunnel = Math.abs(y + 8 + Math.sin(z * .19) * 1.1) < 1.6 && Math.abs(x + 7 + Math.sin(z * .15) * 2.2) < 4
    const cavern = ((x + 9) ** 2 / 70 + (z + 5) ** 2 / 84 + (y + 12) ** 2 / 12 < 1)
    if (y < -3 && (tunnel || cavern)) return ''
    const r = hash(x, y, z)
    if (y < -4 && r < .075) return ['coal', 'iron', 'copper', 'quartz', 'silver', 'amethyst', 'fluorite', 'moonstone', 'echo', 'glow'][Math.floor(hash(z, x, y) * 10)]
    if (y === -1) {
      if (x >= 24 && x <= 31 && z >= 19 && z <= 26) return 'sand'
      return dim === 'meadow' ? 'grass' : 'aether'
    }
    if (y > -4) return 'dirt'
    return dim === 'aether' && r > .78 ? 'moonstone' : 'stone'
  }
  function houseCells(h) {
    const put = (x, y, z, id, extra = {}) => structures.set(key(h.x + x, y, h.z + z), { id, house: h.id, locked: h.locked, ...extra })
    const n = h.size, doorX = Math.floor(n / 2)
    const doorId = h.id + ':door'
    for (let f = 0; f < h.floors; f++) {
      const base = f * 4
      for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
        // Each flight has an opening in the floor above it, with three blocks of headroom.
        const hole = f > 0 && x === n - 3 && z >= 1 && z <= 3
        if (!hole) put(x, base - 1, z, f ? x === n - 3 && z === 4 ? 'stair' : 'plank' : 'brick')
        const wall = x === 0 || x === n - 1 || z === 0 || z === n - 1
        if (wall) for (let y = 0; y < 3; y++) {
          if (!f && z === n - 1 && x === doorX && y < 2) { put(x, y, z, 'door', { door: doorId }); continue }
          const window = y === 1 && x > 0 && x < n - 1 && x !== doorX || y === 1 && z > 0 && z < n - 1 && (x === 0 || x === n - 1) && z % 3 !== 0
          put(x, base + y, z, window ? 'glass' : y === 0 ? 'brick' : 'plank')
        }
      }
      if (f < h.floors - 1) for (let i = 0; i < 4; i++) put(n - 3, base + i, 1 + i, 'stair')
    }
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) put(x, h.floors * 4 - 1, z, 'plank')
    // A stepped block roof, rather than an inaccessible decorative extra storey.
    for (let x = -1; x <= n; x++) for (let z = -1; z <= n; z++) if (x === -1 || x === n || z === -1 || z === n) put(x, h.floors * 4 - 1, z, 'log')
  }
  function rebuildStructures() { structures.clear(); houseCells(home); houseCells(shop); world.houses.forEach(houseCells); world.terrainRevision++; world.dirtyChunks.clear() }
  function cell(x, y, z, dim = world.dimension) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z)
    if (dim === 'meadow') {
      const s = structures.get(key(x, y, z))
      if (s) {
        if (!s.locked && edits[dim].has(key(x, y, z))) return { ...s, id: edits[dim].get(key(x, y, z)) }
        return s.door && world.doors[s.door] ? { ...s, id: '' } : s
      }
    }
    const id = edits[dim].has(key(x, y, z)) ? edits[dim].get(key(x, y, z)) : terrain(dim, x, y, z)
    return { id, locked: false }
  }
  function block(x, y, z, dim) { return cell(x, y, z, dim).id }
  function solid(x, y, z) { const id = block(x, y, z); return !!id && !blocks[id].liquid }
  function headroom(x, y, z) {
    for (const dx of [-RADIUS, RADIUS]) for (const dz of [-RADIUS, RADIUS]) for (const yy of [y + .03, y + .85, y + HEIGHT - .02]) if (solid(x + dx, yy, z + dz)) return false
    for (const p of world.furniture) {
      if (p.dimension !== world.dimension || p.id === 'rug' || y >= p.y + furnitureHeight(p.id) - .05 || y + HEIGHT <= p.y) continue
      const spec = catalog.find(i => i.id === p.id)
      if (!spec) continue
      const w = (p.angle % 180 ? spec.depth : spec.width) / 2, d = (p.angle % 180 ? spec.width : spec.depth) / 2
      if (Math.abs(x - p.x) < w + RADIUS && Math.abs(z - p.z) < d + RADIUS) return false
    }
    return true
  }
  function floorY(x, z, from = TOP) {
    for (let y = Math.min(TOP, Math.floor(from)); y >= BOTTOM; y--) if (solid(x, y, z)) return y + 1
    return BOTTOM + 1
  }
  function spawn() { return { x: Math.floor(size / 2) + .5, y: 0, z: size - 2.1, yaw: Math.PI, pitch: 0, vy: 0, grounded: true } }
  function safePlayer(p) {
    if (!p || !['x', 'y', 'z', 'yaw', 'pitch'].every(k => finite(p[k])) || p.x < MIN + 1 || p.x > MAX - 1 || p.z < MIN + 1 || p.z > MAX - 1 || p.y < BOTTOM + 1 || p.y > TOP) return false
    return headroom(p.x, p.y, p.z)
  }
  function revise() { world.revision++ }
  function inventoryAdd(id, count = 1) { world.inventory[id] = Math.max(0, (world.inventory[id] || 0) + count); revise() }
  function pay(cost) {
    if (Object.entries(cost).some(([id, count]) => (world.inventory[id] || 0) < count)) return false
    Object.entries(cost).forEach(([id, count]) => inventoryAdd(id, -count)); return true
  }
  function mine(hit) {
    if (!hit || !inReach(hit)) return { ok: false, message: '再靠近一点，准星对准方块。' }
    const c = cell(hit.x, hit.y, hit.z)
    if (!c.id) return { ok: false, message: '这里已经挖空啦。' }
    if (blocks[c.id].liquid) return { ok: false, message: '河水可以涉过，不能徒手挖取。' }
    if (blocks[c.id].unbreakable) return { ok: false, message: '这是黑色基岩，任何工具都挖不动。' }
    if (c.locked) return { ok: false, message: '原来的家和商店受到保护，可以在草地上建新房子。' }
    if (c.door) {
      for (const [k, v] of structures) if (v.door === c.door) { const [x, , z] = k.split(',').map(Number); edits[world.dimension].set(k, ''); touch(x, z) }
      delete world.doors[c.door]
    } else if (c.id === 'door') {
      const y = block(hit.x, hit.y - 1, hit.z) === 'door' ? hit.y - 1 : hit.y
      edits[world.dimension].set(key(hit.x, y, hit.z), '')
      edits[world.dimension].set(key(hit.x, y + 1, hit.z), '')
      delete world.doors['block:' + world.dimension + ':' + key(hit.x, y, hit.z)]
    }
    edits[world.dimension].set(key(hit.x, hit.y, hit.z), ''); delete world.orientations[world.dimension][key(hit.x, hit.y, hit.z)]; touch(hit.x, hit.z)
    inventoryAdd(c.id)
    return { ok: true, id: c.id, message: blocks[c.id].name + ' +1 · 已拾入背包' }
  }
  function inReach(p, max = 6) { return Math.hypot(p.x + .5 - world.player.x, p.y + .5 - (world.player.y + 1.45), p.z + .5 - world.player.z) <= max }
  function raycast(origin, direction, max = 6) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z)
    const sx = Math.sign(direction.x), sy = Math.sign(direction.y), sz = Math.sign(direction.z)
    const delta = [direction.x, direction.y, direction.z].map(d => d ? Math.abs(1 / d) : Infinity)
    const start = (v, i, d, s) => !s ? Infinity : ((s > 0 ? i + 1 - v : v - i) / Math.abs(d))
    let tx = start(origin.x, x, direction.x, sx), ty = start(origin.y, y, direction.y, sy), tz = start(origin.z, z, direction.z, sz), distance = 0, normal = { x: 0, y: 0, z: 0 }
    while (distance <= max) {
      if (solid(x, y, z)) return { x, y, z, id: block(x, y, z), distance, normal, point: { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance } }
      if (tx <= ty && tx <= tz) { distance = tx; tx += delta[0]; x += sx; normal = { x: -sx, y: 0, z: 0 } }
      else if (ty <= tz) { distance = ty; ty += delta[1]; y += sy; normal = { x: 0, y: -sy, z: 0 } }
      else { distance = tz; tz += delta[2]; z += sz; normal = { x: 0, y: 0, z: -sz } }
      if (!Number.isFinite(distance)) break
    }
    return null
  }
  function overlapsPlayer(x, y, z, w = 1, h = 1, d = 1) {
    const p = world.player
    return Math.abs(p.x - (x + w / 2)) < w / 2 + RADIUS && Math.abs(p.z - (z + d / 2)) < d / 2 + RADIUS && p.y < y + h && p.y + HEIGHT > y
  }
  function place(id, p, angle) {
    if (!blocks[id] || blocks[id].unbreakable || (world.inventory[id] || 0) < 1) return { ok: false, message: '背包里没有这个方块，先挖取或合成。' }
    if (!p || !inside(p.x, p.y, p.z) || !inReach(p) || solid(p.x, p.y, p.z) || cell(p.x, p.y, p.z).locked || overlapsPlayer(p.x, p.y, p.z)) return { ok: false, message: '这里放不下，不能把自己封进方块里。' }
    if (id === 'door' && (block(p.x, p.y + 1, p.z) || !block(p.x, p.y - 1, p.z) || p.y + 1 > TOP)) return { ok: false, message: '木门要放在实地上，留出两格高度。' }
    if (world.furniture.some(f => f.dimension === world.dimension && Math.abs(f.x - p.x - .5) < 1 && Math.abs(f.z - p.z - .5) < 1 && Math.abs(f.y - p.y) < 2)) return { ok: false, message: '这里有家具，先把家具拿起来。' }
    edits[world.dimension].set(key(p.x, p.y, p.z), id)
    if (id === 'mirror') world.orientations[world.dimension][key(p.x, p.y, p.z)] = [0, 90, 180, 270].includes(angle) ? angle : ((Math.round(Math.atan2(world.player.x - p.x - .5, world.player.z - p.z - .5) / (Math.PI / 2)) * 90) % 360 + 360) % 360
    if (id === 'door') { edits[world.dimension].set(key(p.x, p.y + 1, p.z), id); world.doors['block:' + world.dimension + ':' + key(p.x, p.y, p.z)] = false }
    pay({ [id]: 1 }); touch(p.x, p.z)
    return { ok: true, message: blocks[id].name + '放好了。' }
  }
  function craft(id) {
    const r = recipes.find(r => r.id === id)
    if (!r || !pay(r.cost)) return { ok: false, message: '材料还不够，配方下面能看到缺多少。' }
    inventoryAdd(r.output, r.count)
    return { ok: true, message: r.name + '完成 · ' + r.count + ' 件已放进背包' }
  }
  function reflectors() {
    return Object.entries(world.orientations[world.dimension]).flatMap(([k, angle]) => {
      const [x, y, z] = k.split(',').map(Number)
      return block(x, y, z) === 'mirror' ? [{ x, y, z, angle }] : []
    })
  }
  // A receipt is persisted with the inventory, so interrupted transfers cannot duplicate items.
  function receiveNatureTransfer(transfer) {
    if (!transfer || !Number.isSafeInteger(transfer.sequence) || transfer.sequence <= world.natureTransfer || transfer.sequence < 1) return false
    for (const id of ['glass', 'white_glass', 'mirror']) {
      const count = transfer.items && transfer.items[id]
      if (Number.isInteger(count) && count > 0 && count <= 999) inventoryAdd(id, count)
    }
    world.natureTransfer = transfer.sequence; revise(); return true
  }
  function build(kind, p) {
    const n = kind === 'tower' ? 7 : 5, floors = kind === 'tower' ? 2 : 1
    if (!['cottage', 'tower'].includes(kind) || !world.inventory[kind]) return { ok: false, message: '先用采到的材料合成房屋图纸。' }
    if (world.houses.length >= 30) return { ok: false, message: '这片草地已有 30 座新房子啦，可以继续扩建已有的房子。' }
    if (world.dimension !== 'meadow') return { ok: false, message: '房屋图纸用在草地世界，异界可以自由搭方块。' }
    const h = { id: 'built-' + nextId, x: Math.floor(p.x) - Math.floor(n / 2), z: Math.floor(p.z) - Math.floor(n / 2), size: n, floors, locked: false }
    if (h.x < MIN + 1 || h.z < MIN + 1 || h.x + n > MAX || h.z + n > MAX) return { ok: false, message: '这里靠近世界边界，换一片草地。' }
    for (let x = h.x - 1; x <= h.x + n; x++) for (let z = h.z - 1; z <= h.z + n; z++) {
      if (block(x, -1, z) !== 'grass' || overlapsPlayer(x, 0, z, 1, floors * 4)) return { ok: false, message: '需要一片平整的空草地，自己也要站在图纸范围外。' }
      for (let y = 0; y <= floors * 4; y++) if (block(x, y, z)) return { ok: false, message: '这里有树或建筑，清出一片空草地再建。' }
      if (world.furniture.some(f => f.dimension === 'meadow' && Math.abs(f.x - x - .5) < 2 && Math.abs(f.z - z - .5) < 2)) return { ok: false, message: '先移开这片草地上的家具。' }
    }
    world.houses.push(h); nextId++; pay({ [kind]: 1 }); rebuildStructures(); revise()
    return { ok: true, message: floors + ' 层新家建好了！门和楼梯都能使用。' }
  }
  function toggleDoor(id) {
    const cells = [...structures].filter(([, c]) => c.door === id)
    if (!cells.length) return { ok: false, message: '先对准木门。' }
    const [x, , z] = cells[0][0].split(',').map(Number)
    if (Math.hypot(world.player.x - x - .5, world.player.z - z - .5) > 3) return { ok: false, message: '走近木门再开关。' }
    if (world.doors[id] && overlapsPlayer(x, 0, z, 1, 2)) return { ok: false, message: '先从门口走开一点，再关门。' }
    world.doors[id] = !world.doors[id]; touch(x, z)
    return { ok: true, message: world.doors[id] ? '木门打开了。' : '木门关好了。' }
  }
  function toggleBlockDoor(p) {
    let y = p.y
    if (block(p.x, y - 1, p.z) === 'door') y--
    const id = 'block:' + world.dimension + ':' + key(p.x, y, p.z), open = !!world.doors[id]
    if (!inReach(p) || open && overlapsPlayer(p.x, y, p.z, 1, 2)) return { ok: false, message: '先从门口走开一点。' }
    if (open && [0, 1].some(dy => block(p.x, y + dy, p.z))) return { ok: false, message: '门口有方块，先移开才能关门。' }
    for (let dy = 0; dy < 2; dy++) edits[world.dimension].set(key(p.x, y + dy, p.z), open ? 'door' : '')
    world.doors[id] = !open; touch(p.x, p.z)
    return { ok: true, message: open ? '木门关好了。' : '木门打开了。' }
  }
  function furnitureHeight(id) { return id === 'rug' ? .05 : ['chair', 'sofa', 'bed', 'table', 'pool', 'pooltable', 'sectional', 'bathtub'].includes(id) ? .85 : 1.8 }
  function furnitureFits(pos, spec) {
    const w = pos.angle % 180 ? spec.depth : spec.width, d = pos.angle % 180 ? spec.width : spec.depth
    for (let x = pos.x - w / 2 + .05; x < pos.x + w / 2; x += .45) for (let z = pos.z - d / 2 + .05; z < pos.z + d / 2; z += .45) {
      if (!inside(Math.floor(x), pos.y, Math.floor(z)) || !block(x, pos.y - .01, z, pos.dimension)) return false
      for (let y = pos.y + .05; y < pos.y + furnitureHeight(pos.id); y += .5) if (block(x, y, z, pos.dimension)) return false
    }
    if (pos.dimension === 'meadow' && pos.y === 0) for (const h of [home, shop, ...world.houses]) {
      if (Math.abs(pos.x - h.x - Math.floor(h.size / 2) - .5) < w / 2 + .5 && Math.abs(pos.z - h.z - h.size + .5) < d / 2 + .75) return false
    }
    return !world.furniture.some(f => {
      const other = catalog.find(i => i.id === f.id)
      if (!other || f.dimension !== pos.dimension || Math.abs(f.y - pos.y) > .1 || pos.id === 'rug' || f.id === 'rug') return false
      const ow = f.angle % 180 ? other.depth : other.width, od = f.angle % 180 ? other.width : other.depth
      return Math.abs(pos.x - f.x) < (w + ow) / 2 - .01 && Math.abs(pos.z - f.z) < (d + od) / 2 - .01
    })
  }
  function placeFurniture(id, p, angle = 0) {
    const spec = catalog.find(i => i.id === id && i.owned)
    if (!spec) return { ok: false, message: '这件家具还没买，去草地商店挑选吧。' }
    if (world.furniture.some(f => f.id === id)) return { ok: false, message: '先走近家具，拿起来再换位置。' }
    const w = angle % 180 ? spec.depth : spec.width, d = angle % 180 ? spec.width : spec.depth
    const pos = { id, x: Math.round(p.x * 2) / 2, y: Math.round(p.y), z: Math.round(p.z * 2) / 2, angle, dimension: world.dimension }
    if (!inReach({ x: pos.x - .5, y: pos.y, z: pos.z - .5 }) || overlapsPlayer(pos.x - w / 2, pos.y, pos.z - d / 2, w, furnitureHeight(id), d)) return { ok: false, message: '站开一点，把家具放在前面的地面。' }
    if (!furnitureFits(pos, spec)) return { ok: false, message: '家具需要完整地板，不能碰到墙、楼梯、其他家具或挡住门口。' }
    world.furniture.push(pos); revise()
    return { ok: true, message: spec.name + '摆好了。走近后可以再拿起来。' }
  }
  function pickFurniture(id) {
    const f = world.furniture.find(f => f.id === id && f.dimension === world.dimension)
    if (!f || Math.hypot(f.x - world.player.x, f.y - world.player.y, f.z - world.player.z) > 4) return { ok: false, message: '走近家具再拿起来。' }
    world.furniture = world.furniture.filter(p => p !== f); revise()
    return { ok: true, id, message: '拿好了，对准地面按“放置”重新摆放。' }
  }
  function placePortal(p) {
    if (!world.inventory.portal) return { ok: false, message: '先收集月纹石、紫晶矿、回声方块和萤光石来合成星门。' }
    if (!inReach(p) || world.portals.length >= 30) return { ok: false, message: '再走近一点，换一片空地摆放星门。' }
    const x = Math.floor(p.x) - 1, y = Math.floor(p.y), z = Math.floor(p.z)
    for (let dx = 0; dx < 4; dx++) {
      if (!block(x + dx, y - 1, z)) return { ok: false, message: '星门需要四格宽的平地。' }
      for (let dy = 0; dy < 5; dy++) if (!inside(x + dx, y + dy, z) || block(x + dx, y + dy, z) || overlapsPlayer(x + dx, y + dy, z)) return { ok: false, message: '星门需要四格宽、五格高的空地。' }
    }
    const portal = { id: 'gate-' + nextId++, dimension: world.dimension, x, y, z }
    world.portals.push(portal); pay({ portal: 1 }); revise()
    return { ok: true, message: '星门亮起来了！走近后按“互动”穿过去。' }
  }
  function travel(portal) {
    if (!portal || !world.portals.some(p => p.id === portal.id && p.dimension === world.dimension) || Math.hypot(portal.x + 2 - world.player.x, portal.y - world.player.y, portal.z + .5 - world.player.z) > 4) return { ok: false, message: '走到星门旁边才能穿越。' }
    if (world.dimension === 'meadow') {
      world.returnGate = portal.id
      world.dimension = 'aether'
      if (!world.portals.some(p => p.id === 'return')) world.portals.push({ id: 'return', dimension: 'aether', x: 0, y: 0, z: 10 })
      Object.assign(world.player, { x: 2, y: 0, z: 13, yaw: Math.PI, pitch: 0, vy: 0 })
    } else {
      const target = world.portals.find(p => p.id === world.returnGate && p.dimension === 'meadow')
      world.dimension = 'meadow'
      Object.assign(world.player, target ? { x: target.x + 2, y: target.y, z: target.z + 3, yaw: 0, pitch: 0, vy: 0 } : spawn())
    }
    // Returning is always possible even after the arrival area has been edited.
    if (!safePlayer(world.player)) Object.assign(world.player, world.dimension === 'meadow' ? spawn() : { x: 2, y: floorY(2, 13), z: 13, yaw: 0, pitch: 0, vy: 0 })
    world.terrainRevision++; world.dirtyChunks.clear(); populateMobs(); revise()
    return { ok: true, message: world.dimension === 'aether' ? '欢迎来到星苔秘境。回程星门就在身后。' : '回到草地世界啦。' }
  }
  function move(dx, dz, dt, jump = false) {
    const p = world.player, before = { x: p.x, y: p.y, z: p.z }
    const wading = blocks[block(p.x, p.y + .1, p.z)] && blocks[block(p.x, p.y + .1, p.z)].liquid
    if (wading) { dx *= .68; dz *= .68 }
    if (jump && p.grounded) { p.vy = 6.6; p.grounded = false }
    for (const axis of ['x', 'z']) {
      const delta = axis === 'x' ? dx : dz, next = { ...p, [axis]: p[axis] + delta }
      if (headroom(next.x, p.y, next.z)) p[axis] += delta
      else if (p.grounded) {
        const corners = [-RADIUS, RADIUS].flatMap(ox => [-RADIUS, RADIUS].map(oz => block(next.x + ox, p.y + .1, next.z + oz)))
        if ((corners.includes('stair') || wading) && headroom(next.x, Math.floor(p.y + .1) + 1, next.z)) { p[axis] += delta; p.y = Math.floor(p.y + .1) + 1 }
      }
    }
    p.vy = Math.max(-16, (p.vy || 0) - 18 * dt)
    const nextY = p.y + p.vy * dt
    let supported = -Infinity
    for (const ox of [-RADIUS, RADIUS]) for (const oz of [-RADIUS, RADIUS]) {
      const y = floorY(p.x + ox, p.z + oz, p.y - .001)
      if (y <= p.y + .03) supported = Math.max(supported, y)
    }
    if (p.vy <= 0 && nextY <= supported) { p.y = supported; p.vy = 0; p.grounded = true }
    else if (p.vy > 0 && !headroom(p.x, nextY, p.z)) { p.vy = 0; p.grounded = false }
    else { p.y = Math.max(BOTTOM + 1, nextY); p.grounded = false }
    p.moving = Math.hypot(p.x - before.x, p.z - before.z) > .001
    return p.moving || Math.abs(p.y - before.y) > .001
  }
  function populateMobs() {
    const names = world.dimension === 'meadow' ? ['sheep', 'pig', 'rabbit', 'chicken', 'fox', 'deer', 'sheep', 'rabbit'] : ['sprite', 'stag', 'moth', 'sprite', 'moth']
    const xs = world.dimension === 'meadow' ? [-3, 8, 16, -12, 26, 6, 13, 2] : [1, 6, 3, -3, 10]
    const zs = world.dimension === 'meadow' ? [size + 6, size + 7, -5, 13, 22, -8, 30, 28] : [19, 22, 17, 24, 20]
    world.mobs = names.map((kind, i) => {
      let x = xs[i], z = zs[i]
      if (!solid(x, -1, z) || solid(x, 0, z)) {
        for (let d = 1; d < 8; d++) {
          const bank = [x - d, x + d].find(nx => solid(nx, -1, z) && !solid(nx, 0, z))
          if (bank !== undefined) { x = bank; break }
        }
      }
      return { id: 'mob-' + i, kind, x, z, y: 0, angle: i * 1.4, phase: i * 2.3, friendly: 0 }
    })
  }
  function tickMobs(dt) {
    world.time += dt
    for (const m of world.mobs) {
      m.phase += dt
      if (m.friendly > 0) { m.friendly -= dt; m.angle = Math.atan2(world.player.x - m.x, world.player.z - m.z) }
      else m.angle += Math.sin(m.phase * .3 + Number(m.id.slice(4))) * dt * .35
      const speed = m.friendly > 0 ? .35 : .22, nx = m.x + Math.sin(m.angle) * dt * speed, nz = m.z + Math.cos(m.angle) * dt * speed
      if (!solid(nx, .3, nz) && solid(nx, -1, nz) && nx > MIN + 3 && nx < MAX - 3 && nz > MIN + 3 && nz < MAX - 3) { m.x = nx; m.z = nz }
      else m.angle += dt * 3
      m.y = m.kind === 'moth' ? 1.5 + Math.sin(m.phase * 2) * .25 : ['rabbit', 'sprite'].includes(m.kind) ? Math.max(0, Math.sin(m.phase * 3)) * .18 : 0
    }
  }
  function interactMob(id) {
    const m = world.mobs.find(m => m.id === id)
    if (!m || Math.hypot(m.x - world.player.x, m.z - world.player.z) > 4) return { ok: false, message: '再靠近小动物一点。' }
    m.friendly = 8
    return { ok: true, message: species[m.kind].sound }
  }
  function serialize() {
    return { version: 1, dimension: world.dimension, inventory: { ...world.inventory }, orientations: clone(world.orientations), natureTransfer: world.natureTransfer, edits: Object.fromEntries(Object.entries(edits).map(([dim, cells]) => [dim, [...cells].map(([k, id]) => [...k.split(',').map(Number), id])])), houses: clone(world.houses), doors: { ...world.doors }, portals: clone(world.portals), returnGate: world.returnGate || '', furniture: clone(world.furniture), player: { ...world.player }, nextId }
  }
  function restore(s) {
    if (!s || s.version !== 1 || !s.edits || typeof s.inventory !== 'object') return false
    for (const dim of ['meadow', 'aether']) for (const p of (Array.isArray(s.edits[dim]) ? s.edits[dim] : []).slice(0, 60000)) {
      if (!Array.isArray(p) || p.length !== 4 || !inside(p[0], p[1], p[2]) || p[1] === BOTTOM || p[3] !== '' && (!blocks[p[3]] || blocks[p[3]].unbreakable)) continue
      edits[dim].set(key(...p), p[3])
    }
    for (const [id, n] of Object.entries(s.inventory || {})) if ((blocks[id] || ['portal', 'cottage', 'tower'].includes(id)) && finite(n) && n >= 0 && n <= 99999) world.inventory[id] = Math.floor(n)
    for (const dim of ['meadow', 'aether']) for (const [k, id] of edits[dim]) if (id === 'mirror') {
      const angle = s.orientations && s.orientations[dim] && s.orientations[dim][k]
      world.orientations[dim][k] = [0, 90, 180, 270].includes(angle) ? angle : 0
    }
    world.natureTransfer = Number.isSafeInteger(s.natureTransfer) && s.natureTransfer > 0 ? s.natureTransfer : 0
    world.houses = (Array.isArray(s.houses) ? s.houses : []).filter(h => h && /^built-\d+$/.test(h.id) && [5, 7].includes(h.size) && [1, 2].includes(h.floors) && inside(h.x, 0, h.z) && inside(h.x + h.size, 0, h.z + h.size)).slice(0, 30).map(h => ({ ...h, locked: false }))
    world.doors = Object.fromEntries(Object.entries(s.doors || {}).filter(([id, v]) => {
      if (typeof v !== 'boolean') return false
      if (/^(home|shop|built-\d+):door$/.test(id)) return true
      if (!/^block:(meadow|aether):-?\d+,-?\d+,-?\d+$/.test(id)) return false
      return inside(...id.split(':')[2].split(',').map(Number))
    }))
    world.portals = (Array.isArray(s.portals) ? s.portals : []).filter(p => p && typeof p.id === 'string' && p.id.length < 80 && ['meadow', 'aether'].includes(p.dimension) && inside(p.x, p.y, p.z) && inside(p.x + 3, p.y + 4, p.z)).slice(0, 30)
    world.returnGate = typeof s.returnGate === 'string' ? s.returnGate : ''
    world.dimension = s.dimension === 'aether' && world.portals.some(p => p.id === 'return') ? 'aether' : 'meadow'
    world.furniture = (Array.isArray(s.furniture) ? s.furniture : []).filter((f, i, a) => f && catalog.some(c => c.id === f.id && c.owned) && a.findIndex(p => p && p.id === f.id) === i && ['meadow', 'aether'].includes(f.dimension) && ['x', 'y', 'z', 'angle'].every(k => finite(f[k])) && f.x > MIN && f.x < MAX && f.z > MIN && f.z < MAX && f.y >= BOTTOM + 1 && f.y < TOP && [0, 90, 180, 270].includes(f.angle))
    rebuildStructures()
    if (safePlayer(s.player)) world.player = { ...s.player, pitch: Math.max(-1.45, Math.min(1.45, s.player.pitch)), vy: 0, moving: false }
    else if (world.dimension === 'aether') world.player = { x: 2, y: floorY(2, 13), z: 13, yaw: 0, pitch: 0, vy: 0 }
    nextId = Math.max(1, Math.min(100000, Number(s.nextId) || 1), ...world.houses.map(h => Number(h.id.slice(6)) + 1), ...world.portals.map(p => Number(p.id.slice(5)) + 1 || 1))
    return true
  }
  rebuildStructures()
  const restored = restore(saved)
  if (!restored) {
    world.furniture = (resident.room && resident.room.layout || []).filter(p => catalog.some(c => c.id === p.id && c.owned)).map(p => {
      const spec = catalog.find(c => c.id === p.id), angle = p.angle == null ? (p.rotation || 0) * 90 : Math.round(p.angle / 90) * 90 % 360
      return { id: p.id, x: p.x + (p.angle == null ? (p.rotation ? spec.depth : spec.width) / 2 : 0), y: 0, z: p.y + (p.angle == null ? (p.rotation ? spec.width : spec.depth) / 2 : 0), angle, dimension: 'meadow' }
    })
  }
  // Old rooms used thin walls. Re-seat owned furniture against the new full-block walls.
  const oldPlacements = world.furniture; world.furniture = []; world.rearranged = false
  for (const p of oldPlacements) {
    const spec = catalog.find(c => c.id === p.id)
    if (furnitureFits(p, spec)) { world.furniture.push(p); continue }
    world.rearranged = true
    let replacement = null
    for (let x = 1.5; x < size - 1 && !replacement; x += .5) for (let z = 1.5; z < size - 1 && !replacement; z += .5) {
      const candidate = { ...p, x, y: Math.min((home.floors - 1) * 4, p.y), z, dimension: 'meadow' }
      if (furnitureFits(candidate, spec) && !overlapsPlayer(x - spec.width / 2, candidate.y, z - spec.depth / 2, spec.width, furnitureHeight(p.id), spec.depth)) replacement = candidate
    }
    if (replacement) world.furniture.push(replacement)
  }
  function safeSpawn() {
    const p = spawn()
    if (headroom(p.x, p.y, p.z)) return p
    for (let z = size - 1.5; z > 1; z -= .5) for (let x = 1.5; x < size - 1; x += .5) if (headroom(x, 0, z)) return { ...p, x, z }
    return p
  }
  if (!safePlayer(world.player) && world.dimension === 'meadow') world.player = safeSpawn()
  populateMobs()
  function syncResident(state) { catalog = state.furniture || []; world.furniture = world.furniture.filter(f => catalog.some(c => c.id === f.id && c.owned)) }
  function doorways() {
    const doors = new Map()
    if (world.dimension === 'meadow') for (const [k, c] of structures) if (c.door && !doors.has(c.door)) {
      const [x, y, z] = k.split(',').map(Number)
      if (c.locked || !edits.meadow.has(k) || edits.meadow.get(k) === 'door') doors.set(c.door, { id: c.door, x, y, z, open: !!world.doors[c.door] })
    }
    const prefix = 'block:' + world.dimension + ':'
    for (const [id, open] of Object.entries(world.doors)) if (id.startsWith(prefix)) {
      const [x, y, z] = id.slice(prefix.length).split(',').map(Number)
      doors.set(id, { id, x, y, z, open, loose: true })
    }
    return [...doors.values()]
  }
  function goHome() { world.dimension = 'meadow'; Object.assign(world.player, safeSpawn()); world.terrainRevision++; world.dirtyChunks.clear(); populateMobs(); revise() }
  return Object.assign(world, { block, cell, terrain, solid, headroom, floorY, raycast, mine, place, craft, reflectors, receiveNatureTransfer, build, toggleDoor, toggleBlockDoor, placeFurniture, pickFurniture, placePortal, travel, move, tickMobs, interactMob, serialize, syncResident, goHome, inReach, doorways, restored })
}
module.exports = { createWorld, floorCount, hash, key, riverDistance, riverWidth, MIN, MAX, BOTTOM, TOP, HEIGHT, RADIUS }
