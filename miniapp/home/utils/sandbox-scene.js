const { createScopedThreejs } = require('../vendor/three')
const { createModels } = require('./home-models')
const { blocks, species } = require('./sandbox-catalog')
const { MIN, MAX, BOTTOM, TOP, hash } = require('./sandbox-world')
const { createEnvironment } = require('./sandbox-environment')
const { createWorldReflections } = require('./sandbox-reflections')

// Only exposed voxel faces are uploaded. Editing replaces the affected 8×8 chunks.
const faces = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: .84 },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: .72 },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1 },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: .65 },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: .92 },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: .78 }
]

function createSandboxScene(canvas, width, height, world, options = {}) {
  const T = createScopedThreejs(canvas), models = createModels(T, { physical: true, linearColors: true }), scene = new T.Scene()
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(options.pixelRatio || 1, 1.8)); renderer.setSize(width, height, false)
  const environment = createEnvironment(T, renderer), materials = environment.materials
  const camera = new T.PerspectiveCamera(72, width / height, .04, 100)
  scene.add(camera)
  // The native canvas also covers HTML crosshairs, so draw the aiming mark in WebGL.
  const reticle = new T.Group(), reticleMaterial = new T.MeshBasicMaterial({ color: 0xfff8dc, depthTest: false, depthWrite: false, fog: false })
  for (const [w, h] of [[12, 2], [2, 12]]) {
    const line = new T.Mesh(new T.PlaneGeometry(w, h), reticleMaterial); line.renderOrder = 1000; reticle.add(line)
  }
  reticle.position.z = -.2; camera.add(reticle)
  function resizeReticle() { reticle.scale.setScalar(2 * .2 * Math.tan(camera.fov * Math.PI / 360) / height) }
  resizeReticle()
  const sky = new T.Color(0xb8d6d4), night = new T.Color(0x526b80), cave = new T.Color(0x283330)
  scene.background = sky; scene.fog = new T.Fog(sky, 23, 57)
  const ambient = new T.HemisphereLight(0xf4f6ec, 0x889a91, .85)
  const sun = new T.DirectionalLight(0xfff3df, 1.4); sun.position.set(-12, 30, 16)
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -.00025
  Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 1, far: 85 })
  sun.shadow.camera.updateProjectionMatrix(); scene.add(sun.target)
  const torch = new T.PointLight(0xffda9c, .8, 12, 1.4)
  scene.add(ambient, sun, torch)
  const chunks = new Map(), props = new T.Group(), fauna = new T.Group(), furnishings = new T.Group(), gates = new T.Group()
  scene.add(props, fauna, furnishings, gates)
  const doorModels = new Map(), mobModels = new Map(), furnitureModels = new Map()
  const ray = new T.Raycaster()
  const outlineMaterial = new T.LineBasicMaterial({ color: 0xfff2bf, transparent: true, opacity: .9 })
  const outline = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.008, 1.008, 1.008)), outlineMaterial)
  outline.visible = false; scene.add(outline)
  const previewMaterial = new T.MeshBasicMaterial({ color: 0xcee5a4, transparent: true, opacity: .22, depthWrite: false })
  const preview = new T.Mesh(new T.BoxGeometry(1, 1, 1), previewMaterial); preview.visible = false; scene.add(preview)
  const hand = new T.Group(); camera.add(hand)
  const skin = models.box(hand, .14, -.27, -.5, .13, .28, .15, 0xf0c597)
  models.box(hand, .15, -.45, -.48, .15, .16, .17, { explorer: 0x78969c, gardener: 0x789362, builder: 0xd6aa46 }[options.outfit] || 0xd1aa69)
  hand.rotation.z = -.18
  const avatar = models.actor(options.outfit); avatar.scale.setScalar(1.5); avatar.visible = false; scene.add(avatar)
  const reflections = createWorldReflections(T, scene, renderer)
  let heldModel = null, heldId = '', disposed = false, running = false, raf = null, last = 0, elapsed = 0, mineSwing = false
  let lastTerrain = -1, lastRevision = -1, lastDimension = '', pendingChunks = [], gatePulse = [], mirrors = []

  function disposeGroup(g) {
    g.traverse(m => { if (m.geometry && m.geometry !== models.cube) m.geometry.dispose() })
    if (g.parent) g.parent.remove(g)
  }
  function clearGroup(g) { while (g.children.length) disposeGroup(g.children[0]) }
  function buffer() { return { p: [], n: [], c: [] } }
  function addQuad(b, vertices, n, color) {
    for (const i of [0, 1, 2, 0, 2, 3]) { b.p.push(...vertices[i]); b.n.push(...n); b.c.push(color.r, color.g, color.b) }
  }
  function inset(vertices, from, to, offset, normal) {
    const a = vertices[0], u = vertices[1].map((v, i) => v - a[i]), v = vertices[3].map((v, i) => v - a[i])
    return [[from[0], from[1]], [to[0], from[1]], [to[0], to[1]], [from[0], to[1]]].map(([s, t]) => a.map((n, i) => n + u[i] * s + v[i] * t + normal[i] * offset))
  }
  function makeChunk(cx, cz) {
    const id = cx + ',' + cz, previous = chunks.get(id)
    if (previous) disposeGroup(previous)
    const group = new T.Group(), data = Object.fromEntries(Object.keys(materials).map(id => [id, buffer()]))
    for (let x = Math.max(MIN, cx * 8); x <= Math.min(MAX, cx * 8 + 7); x++) for (let z = Math.max(MIN, cz * 8); z <= Math.min(MAX, cz * 8 + 7); z++) for (let y = BOTTOM; y <= TOP; y++) {
      const id = world.block(x, y, z), spec = blocks[id]
      if (!spec || id === 'door') continue
      for (const f of faces) {
        const other = world.block(x + f.n[0], y + f.n[1], z + f.n[2])
        if (other && other !== 'door' && (!blocks[other].transparent || other === id && spec.transparent)) continue
        const color = new T.Color(id === 'mirror' ? 0x9e8056 : f.n[1] === 1 ? spec.top || spec.color : spec.side || spec.color).convertSRGBToLinear()
        color.multiplyScalar(f.shade * (.92 + hash(x, y, z) * .12))
        const layer = spec.wind ? 'leaves' : spec.transparent ? id : 'solid'
        const b = data[layer], vertices = f.v.map(v => [x + v[0], y + v[1] * (spec.liquid ? .86 : 1), z + v[2]])
        addQuad(b, vertices, f.n, color)
        if (id === 'mirror') {
          const angle = (world.orientations[world.dimension][x + ',' + y + ',' + z] || 0) * Math.PI / 180
          if (f.n[0] === Math.round(Math.sin(angle)) && f.n[2] === Math.round(Math.cos(angle))) addQuad(data.mirror, inset(vertices, [.08, .08], [.92, .92], .003, f.n), f.n, new T.Color(0xffffff))
        }
        if (spec.transparent) continue
        // Sparse square flecks give the minerals and the grass a quiet pixel texture.
        const fleck = new T.Color(spec.ore || (id === 'bedrock' ? 0x30343a : spec.color)).convertSRGBToLinear().multiplyScalar(spec.ore ? 1.1 : 1.06)
        const seed = hash(z, x, y)
        for (let i = 0; i < (spec.ore ? 4 : 2); i++) {
          const u = .12 + ((seed * 13 + i * .31) % .65), v = .12 + ((seed * 7 + i * .27) % .65)
          if (id !== 'mirror') addQuad(spec.ore ? data[spec.glow ? 'glow' : 'ore'] : b, inset(vertices, [u, v], [u + .11, v + .09], .001, f.n), f.n, fleck)
        }
        if (['plank', 'brick', 'log', 'stair'].includes(id)) addQuad(b, inset(vertices, [.025, .48], [.975, .50], .002, f.n), f.n, color.clone().multiplyScalar(.76))
      }
    }
    Object.entries(data).forEach(([layer, b]) => {
      if (!b.p.length) return
      const geo = new T.BufferGeometry()
      geo.addAttribute('position', new T.Float32BufferAttribute(b.p, 3)); geo.addAttribute('normal', new T.Float32BufferAttribute(b.n, 3)); geo.addAttribute('color', new T.Float32BufferAttribute(b.c, 3))
      geo.computeBoundingSphere(); geo.boundingSphere.radius += .12
      const mesh = new T.Mesh(geo, materials[layer]); mesh.receiveShadow = true
      mesh.castShadow = ['solid', 'leaves'].includes(layer)
      mesh.userData.layer = layer
      if (layer === 'leaves') mesh.customDepthMaterial = environment.leafDepth
      group.add(mesh)
    })
    scene.add(group); chunks.set(id, group)
  }
  function refreshTerrain() {
    const dimensionChanged = lastDimension !== world.dimension
    if (lastTerrain === world.terrainRevision && !dimensionChanged) return
    if (world.dirtyChunks.size && !dimensionChanged && chunks.size) {
      for (const id of world.dirtyChunks) { const [x, z] = id.split(',').map(Number); makeChunk(x, z) }
    } else {
      chunks.forEach(disposeGroup); chunks.clear(); pendingChunks = []
      for (let x = Math.floor(MIN / 8); x <= Math.floor(MAX / 8); x++) for (let z = Math.floor(MIN / 8); z <= Math.floor(MAX / 8); z++) pendingChunks.push([x, z])
      pendingChunks.sort((a, b) => Math.hypot(a[0] * 8 + 4 - world.player.x, a[1] * 8 + 4 - world.player.z) - Math.hypot(b[0] * 8 + 4 - world.player.x, b[1] * 8 + 4 - world.player.z))
      pendingChunks.splice(0, 9).forEach(([x, z]) => makeChunk(x, z))
    }
    world.dirtyChunks.clear(); lastTerrain = world.terrainRevision
    if (dimensionChanged) { clearGroup(fauna); mobModels.clear(); buildNature(); lastDimension = world.dimension }
  }
  function makeDoor(d) {
    const g = new T.Group(), leaf = new T.Group(); g.add(leaf)
    g.position.set(d.x + .035, d.y, d.z + .5)
    models.box(leaf, .46, .5, 0, .92, .98, .12, 0xb1854f)
    for (const x of [.035, .46, .885]) models.box(leaf, x, 1.49, 0, .07, 1, .12, 0xa0713f)
    for (const y of [1.03, 1.5, 1.98]) models.box(leaf, .46, y, 0, .94, .07, .12, 0xd5b477)
    for (const x of [.23, .68]) for (const y of [1.25, 1.75]) models.box(leaf, x, y, 0, .35, .39, .025, 0xb1c5b1)
    models.box(leaf, .8, .9, .1, .07, .13, .09, 0x524c36)
    models.bake(leaf); g.userData = { kind: 'door', id: d.id, door: d, leaf, progress: Number(d.open) }; props.add(g); doorModels.set(d.id, g)
    return g
  }
  function makeMob(m) {
    const s = species[m.kind], g = new T.Group(), head = new T.Group(), legs = []
    const small = ['rabbit', 'chicken', 'sprite', 'moth'].includes(m.kind)
    const scale = small ? .62 : 1
    g.scale.setScalar(scale)
    if (m.kind === 'moth') {
      models.box(g, 0, .12, 0, .14, .24, .4, s.face)
      const wings = []
      for (const side of [-1, 1]) { const wing = new T.Group(); models.box(wing, side * .32, .15, 0, .6, .07, .65, s.color); g.add(wing); wings.push(wing) }
      g.userData.wings = wings
    } else if (m.kind === 'sprite') {
      models.box(g, 0, .36, 0, .7, .7, .7, s.color)
      for (const x of [-.16, .16]) models.box(g, x, .47, .36, .07, .1, .02, 0x273b45)
      models.box(g, 0, .89, 0, .13, .3, .13, 0xd5eb9b)
    } else {
      models.box(g, 0, .55, 0, .6, .52, .88, s.color)
      head.position.set(0, .85, .43); g.add(head)
      models.box(head, 0, 0, 0, .43, .43, .42, m.kind === 'sheep' ? s.face : s.color)
      models.box(head, 0, -.07, .23, .28, .2, .11, s.face)
      for (const x of [-.22, .22]) {
        models.box(head, x, .18, 0, .13, m.kind === 'rabbit' ? .55 : .17, .14, s.color)
        models.box(head, x * .64, .04, .222, .055, .065, .02, 0x2d3a32)
      }
      if (['stag', 'deer'].includes(m.kind)) for (const x of [-.17, .17]) { models.box(head, x, .47, -.08, .07, .6, .07, m.kind === 'stag' ? 0xc8efdb : 0x886c48); models.box(head, x * 1.5, .59, -.08, .2, .07, .07, 0xd9d4b0) }
      if (m.kind === 'chicken') { models.box(head, 0, .25, .02, .1, .16, .2, 0xd37754); models.box(head, 0, -.02, .29, .16, .12, .17, 0xdfb45e) }
      for (const x of [-.19, .19]) for (const z of [-.3, .28]) { const leg = new T.Group(); leg.position.set(x, .31, z); models.box(leg, 0, -.12, 0, .13, .26, .15, s.face); g.add(leg); legs.push(leg) }
      const tail = models.box(g, 0, .55, -.57, m.kind === 'fox' ? .26 : .12, .2, m.kind === 'fox' ? .65 : .18, s.face); tail.rotation.x = -.35
    }
    g.userData = { ...g.userData, kind: 'mob', id: m.id, legs, head }; fauna.add(g); mobModels.set(m.id, g); return g
  }
  function makeGate(p) {
    const g = new T.Group(); g.position.set(p.x, p.y, p.z + .5)
    for (let x = 0; x < 4; x++) for (let y = 0; y < 5; y++) if (!x || x === 3 || !y || y === 4) {
      models.box(g, x + .5, y + .5, 0, .98, .98, .65, 0x384956)
      models.box(g, x + .5, y + .5, .335, .22, .22, .015, 0xb4e4ca)
    }
    const material = new T.MeshBasicMaterial({ color: 0x8ed5c3, transparent: true, opacity: .62, side: T.DoubleSide, depthWrite: false })
    const surface = new T.Mesh(new T.PlaneGeometry(2, 3), material); surface.position.set(2, 2.5, 0); g.add(surface)
    for (let i = 0; i < 9; i++) models.box(g, 1.15 + hash(i, 0, 0) * 1.65, 1.2 + hash(0, i, 0) * 2.65, .03, .08, .08, .04, 0xe0f7d0)
    g.userData = { kind: 'portal', id: p.id, portal: p }; gates.add(g); gatePulse.push({ surface, material }); return g
  }
  function buildNature() {
    clearGroup(props); doorModels.clear()
    const meadow = world.dimension === 'meadow'
    for (let i = 0; i < 260; i++) {
      const x = MIN + hash(i, 5, 2) * (MAX - MIN), z = MIN + hash(3, i, 9) * (MAX - MIN)
      if (world.block(x, 0, z) || world.block(x, -1, z) !== (meadow ? 'grass' : 'aether')) continue
      const flower = hash(i, 4, 0) > .6
      models.box(props, x, .12, z, .05, .24, .05, meadow ? 0x6c8c45 : 0x739f9c)
      if (flower) models.box(props, x, .25, z, .15, .09, .15, meadow ? [0xf1dda1, 0xe9ba9d, 0xecede0][i % 3] : 0xd7b9df)
    }
    // Pale block clouds and a square sun provide a readable horizon without image assets.
    for (let i = 0; i < 12; i++) {
      const x = MIN + hash(i, 4, 6) * 75, z = MIN + hash(2, i, 4) * 75
      models.box(props, x, 11 + i % 3, z, 6 + i % 5, .9, 2.7, meadow ? 0xf2efe0 : 0x8798ae)
      models.box(props, x - 1, 11.5 + i % 3, z, 3, .8, 2.3, meadow ? 0xf7f2df : 0x91a4b2)
    }
    models.box(props, -17, 24, -26, 4, 4, .3, meadow ? 0xffe1a0 : 0xe0d8ec)
    models.bake(props)
  }
  function refreshObjects() {
    const currentDoors = world.doorways(), doorIds = new Set(currentDoors.map(d => d.id))
    for (const [id, g] of doorModels) if (!doorIds.has(id)) { disposeGroup(g); doorModels.delete(id) }
    for (const d of currentDoors) { const g = doorModels.get(d.id) || makeDoor(d); g.userData.door = d }
    if (lastRevision === world.revision) return
    mirrors = world.reflectors().filter(p => {
      const a = p.angle * Math.PI / 180, neighbor = world.block(p.x + Math.round(Math.sin(a)), p.y, p.z + Math.round(Math.cos(a)))
      return !neighbor || blocks[neighbor].transparent
    })
    const placed = world.furniture.filter(p => p.dimension === world.dimension), ids = new Set(placed.map(p => p.id))
    for (const [id, g] of furnitureModels) if (!ids.has(id)) { disposeGroup(g); furnitureModels.delete(id) }
    for (const p of placed) {
      let g = furnitureModels.get(p.id)
      if (!g) { g = models.furniture(p.id); g.userData.kind = 'furniture'; g.userData.id = p.id; furnitureModels.set(p.id, g); furnishings.add(g) }
      g.position.set(p.x, p.y, p.z); g.rotation.y = -p.angle * Math.PI / 180
    }
    for (const [id, light] of furnitureLights) { const g = furnitureModels.get(id); light.visible = !!g; if (g) light.position.set(g.position.x, g.position.y + 1.3, g.position.z + .3) }
    gatePulse.forEach(p => p.material.dispose()); gatePulse = []; clearGroup(gates)
    world.portals.filter(p => p.dimension === world.dimension).forEach(makeGate)
    lastRevision = world.revision
  }
  function updateCamera() {
    const p = world.player, bob = p.moving && p.grounded ? Math.sin(elapsed * 11) * .022 : 0
    camera.position.set(p.x, p.y + 1.45 + bob, p.z)
    camera.lookAt(new T.Vector3(p.x - Math.sin(p.yaw) * Math.cos(p.pitch), camera.position.y - Math.sin(p.pitch), p.z - Math.cos(p.yaw) * Math.cos(p.pitch)))
    camera.updateMatrixWorld()
    torch.position.copy(camera.position); torch.intensity = p.y < -2 ? 2.2 : .18
    const underground = p.y < -2, aether = world.dimension === 'aether'
    scene.background = underground ? cave : aether ? night : sky
    scene.fog.color.copy(scene.background).convertSRGBToLinear(); scene.fog.near = underground ? 7 : 23; scene.fog.far = underground ? 24 : 57
    ambient.intensity = underground ? .28 : aether ? .65 : .85
    sun.intensity = aether ? .9 : 1.4
    const sx = Math.round(p.x / 4) * 4, sz = Math.round(p.z / 4) * 4
    sun.target.position.set(sx, 0, sz); sun.position.set(sx - 16, 30, sz + 18)
    avatar.position.set(p.x, p.y, p.z); avatar.rotation.y = p.yaw + Math.PI
    Object.values(avatar.userData.limbs).forEach((limb, i) => { limb.rotation.x = p.moving ? Math.sin(elapsed * 8 + i * Math.PI) * .3 : 0 })
    hand.position.x = Math.max(0, Math.min(.2, camera.aspect * .3 - .14))
    hand.position.y = mineSwing ? Math.sin(elapsed * 20) * .035 : bob * .5
    hand.rotation.x = mineSwing ? Math.sin(elapsed * 20) * .23 : 0
  }
  function render(dt = 0) {
    if (disposed) return
    elapsed += dt; environment.update(dt); refreshTerrain(); refreshObjects()
    pendingChunks.splice(0, 2).forEach(([x, z]) => makeChunk(x, z))
    for (const d of world.doorways()) {
      const g = doorModels.get(d.id); if (!g) continue
      g.userData.progress += (Number(d.open) - g.userData.progress) * Math.min(1, dt * 13)
      g.userData.leaf.rotation.y = -g.userData.progress * Math.PI / 2
    }
    for (const m of world.mobs) {
      const g = mobModels.get(m.id) || makeMob(m)
      g.position.set(m.x, m.y, m.z); g.rotation.y = m.angle
      g.userData.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(m.phase * 5 + i * 2) * .25 })
      if (g.userData.wings) g.userData.wings.forEach((wing, i) => { wing.rotation.z = Math.sin(m.phase * 8) * .45 * (i ? -1 : 1) })
    }
    gatePulse.forEach(({ surface, material }) => { material.opacity = .55 + Math.sin(elapsed * 2) * .12; surface.scale.x = 1 + Math.sin(elapsed * 1.4) * .015 })
    updateCamera(); scene.updateMatrixWorld(true)
    const reflectiveMeshes = []
    chunks.forEach(g => g.children.forEach(m => { if (['water', 'glass', 'white_glass', 'mirror'].includes(m.userData.layer)) reflectiveMeshes.push(m) }))
    environment.capture(scene, camera, world, !pendingChunks.length, [hand, reticle, outline, preview, ...reflections.surfaces, ...reflectiveMeshes])
    reflections.update(camera, mirrors, avatar, [hand, reticle, outline, preview], dt)
    renderer.render(scene, camera)
  }
  function aim() {
    updateCamera(); scene.updateMatrixWorld(true); ray.setFromCamera(new T.Vector2(0, 0), camera)
    const origin = camera.position, direction = ray.ray.direction
    const voxel = world.raycast(origin, direction)
    ray.far = 6
    const objects = ray.intersectObjects([props, fauna, furnishings, gates], true)
    let objectHit = null
    for (const hit of objects) {
      let g = hit.object; while (g && !g.userData.kind) g = g.parent
      if (g && (!voxel || hit.distance < voxel.distance + (voxel.id === 'door' ? .8 : .01))) { objectHit = { kind: g.userData.kind, id: g.userData.id, object: g.userData, distance: hit.distance }; break }
    }
    return objectHit || (voxel ? { kind: 'block', ...voxel } : null)
  }
  function select(hit) { outline.visible = !!hit && hit.kind === 'block'; if (outline.visible) outline.position.set(hit.x + .5, hit.y + .5, hit.z + .5) }
  function showPreview(p, w = 1, h = 1, d = 1, valid = true) {
    preview.visible = !!p
    if (p) { preview.position.set(p.x, p.y + h / 2, p.z); preview.scale.set(w, h, d); previewMaterial.color.setHex(valid ? 0xc5e6a1 : 0xdd9980) }
  }
  function hold(id, furniture = false) {
    if (id === heldId) return
    if (heldModel) disposeGroup(heldModel)
    heldId = id; heldModel = null; skin.visible = !id
    if (!id) return
    heldModel = furniture ? models.furniture(id) : new T.Group()
    if (!furniture) models.box(heldModel, 0, 0, 0, 1, 1, 1, (blocks[id] || {}).color || 0x8ec3b4)
    const bounds = new T.Box3().setFromObject(heldModel).getSize(new T.Vector3())
    heldModel.scale.setScalar(.18 / Math.max(1, bounds.x, bounds.y, bounds.z)); heldModel.position.set(.11, -.24, -.48); heldModel.rotation.y = -.5; hand.add(heldModel)
  }
  function frame(ms) {
    if (!running || disposed) return
    raf = canvas.requestAnimationFrame(frame)
    if (!last) last = ms
    if (ms - last < 1000 / 32) return
    const dt = Math.min((ms - last) / 1000, .05); last = ms
    try { if (options.onFrame) options.onFrame(dt); render(dt) } catch (error) { stop(); if (options.onError) options.onError(error) }
  }
  function start() { if (running || disposed) return; running = true; last = 0; raf = canvas.requestAnimationFrame(frame) }
  function stop() { running = false; if (raf !== null) canvas.cancelAnimationFrame(raf); raf = null; last = 0 }
  function resize(w, h, pixelRatio) { width = w; height = h; renderer.setPixelRatio(Math.min(pixelRatio || 1, 1.8)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); resizeReticle() }
  function contextLost(e) { if (e.preventDefault) e.preventDefault(); stop(); if (options.onError) options.onError(new Error('画面连接中断')) }
  if (canvas.addEventListener) canvas.addEventListener('webglcontextlost', contextLost)
  function dispose() {
    if (disposed) return
    stop(); disposed = true
    if (canvas.removeEventListener) canvas.removeEventListener('webglcontextlost', contextLost)
    gatePulse.forEach(p => p.material.dispose()); scene.traverse(m => { if (m.geometry && m.geometry !== models.cube) m.geometry.dispose() })
    reflections.dispose(); environment.dispose(); outlineMaterial.dispose(); previewMaterial.dispose(); reticleMaterial.dispose(); models.dispose()
    if (sun.shadow.map) sun.shadow.map.dispose()
    renderer.dispose()
  }
  const furnitureLights = new Map()
  function activate(id) {
    if (!['lamp', 'fireplace'].includes(id)) return
    const g = furnitureModels.get(id)
    if (!g) return
    let light = furnitureLights.get(id)
    if (!light) { light = new T.PointLight(id === 'lamp' ? 0xffdb98 : 0xffab66, 0, 6, 1.5); scene.add(light); furnitureLights.set(id, light) }
    light.position.set(g.position.x, g.position.y + 1.3, g.position.z + .3); light.intensity = light.intensity ? 0 : 1.8
  }
  function landmarks() {
    if (world.dimension !== 'meadow') return []
    return [{ id: 'home', name: '我的家 · ' + world.home.floors + ' 层', x: world.home.size / 2, y: world.home.floors * 4 + .5, z: world.home.size / 2 }, { id: 'shop', name: '草地商店', x: -14.5, y: 4.5, z: 21.5 }, { id: 'mine', name: '露天矿道 · 石英 / 银矿', x: -7.5, y: 1, z: 16 }, { id: 'river', name: '缓流河岸', x: 28, y: 1, z: 24 }].map(p => {
      const v = new T.Vector3(p.x, p.y, p.z), distance = camera.position.distanceTo(v); v.project(camera)
      return { id: p.id, name: p.name, x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2, distance: Math.round(distance), visible: distance > 5 && distance < 42 && v.z < 1 && v.x > -.8 && v.x < .8 && v.y > -.6 && v.y < .5 }
    }).filter(p => p.visible)
  }
  return { start, stop, render, resize, dispose, aim, select, showPreview, hold, activate, landmarks, swing(value) { mineSwing = value },
    stats() { const layers = {}; chunks.forEach(g => g.children.forEach(m => { layers[m.userData.layer] = (layers[m.userData.layer] || 0) + 1 })); return { dimension: world.dimension, chunks: chunks.size, pending: pendingChunks.length, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, eye: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, doors: doorModels.size, furniture: [...furnitureModels.keys()], mobs: mobModels.size, running, layers, environment: environment.stats(), mirrors: reflections.stats() } }
  }
}
module.exports = { createSandboxScene }
