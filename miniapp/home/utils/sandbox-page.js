const { createWorld, floorCount } = require('./sandbox-world')
const { createSandboxScene } = require('./sandbox-scene')
const { blocks, recipes, special, species, item, hex } = require('./sandbox-catalog')
const { actions, nature } = require('./home-room')
const { transferCrafts } = require('./nature-transfer')

const worldData = {
  loading: true, failed: false, sceneReady: false, sceneFailed: false, state: null,
  dimension: 'meadow', worldName: '草地世界', region: '在自己的家', coordinates: '0 / 0 / 0',
  floors: 1, currentFloor: 1, homeName: '橡木小家', saveLabel: '自动保存到本机',
  panel: '', bagTab: 'blocks', bagItems: [], furnitureItems: [], recipeItems: [], hotbar: [],
  held: '', heldKind: '', heldName: '空手', heldColor: '#d1aa69', rotation: 0,
  targetName: '', targetKind: '', targetHint: '拖动画面转头，按住左下箭头走动', minePercent: 0, interactLabel: '互动',
  message: '按住左下箭头走动，走近木门点“开门”。', keys: {}, tvNature: nature[0], tvIndex: 0,
  firstVisit: true, journal: '砍树取原木 → 合成木板 → 挖矿与建造', mouseLook: false, landmarks: []
}
function keyName(e) {
  // WeChat sends modifier flags as strings; the string "false" is truthy.
  if (!e || [e.metaKey, e.ctrlKey, e.altKey].some(v => v === true || v === 'true')) return ''
  return ({ KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyQ: 'q', KeyF: 'f', KeyR: 'r', KeyB: 'b', KeyC: 'c', Space: 'space', Escape: 'escape', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' })[e.code] || ({ ' ': 'space', Spacebar: 'space', Esc: 'escape', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' })[e.key] || String(e.key || '').toLowerCase()
}
function storageKey(wxApi, state) {
  const info = wxApi.getStorageSync('userInfo') || {}, backend = wxApi.getStorageSync('apiBackend') || 'local'
  let account = info.id || info.user_id || state.resident.user_id || state.resident.id
  if (!account) { let n = 5381; for (const c of String(wxApi.getStorageSync('token') || 'guest')) n = ((n << 5) + n) ^ c.charCodeAt(0); account = 'session-' + (n >>> 0) }
  return 'voxel-world:v1:' + backend + ':' + account
}
function createSandboxPage(api, wxApi, showError = () => {}) {
  return {
    onLoad() { if (!wxApi.getStorageSync('token')) wxApi.redirectTo({ url: '/pages/login/login' }) },
    onShow() {
      this._visible = true; this.bindWorldKeyboard()
      if (this._scene) this._scene.start()
      if (wxApi.getStorageSync('token')) this.loadResident()
    },
    onReady() { this.initWorldScene() },
    onResize() {
      if (!this._scene || !wxApi.createSelectorQuery) return
      wxApi.createSelectorQuery().in(this).select('#world-stage').boundingClientRect(r => {
        if (!r || !this._scene) return
        this._canvasRect = r
        const info = wxApi.getWindowInfo ? wxApi.getWindowInfo() : wxApi.getSystemInfoSync()
        this._scene.resize(r.width, r.height, info.pixelRatio)
      }).exec()
    },
    onHide() { this._visible = false; this.pauseWorld(); this.flushWorldSave() },
    onUnload() { this.onHide(); this._disposed = true; if (this._scene) this._scene.dispose(); this._scene = null },
    loadResident() {
      if (this._loadPromise) return this._loadPromise
      this.setData({ loading: !this._world, failed: false })
      this._loadPromise = api.get('/resident').then(state => this.applyWorldState(state)).catch(err => {
        if (this._disposed) return
        this.setData({ loading: false, failed: !this._world })
        showError(err.message || '小家暂时没连上')
      }).finally(() => { this._loadPromise = null })
      return this._loadPromise
    },
    applyWorldState(state) {
      if (this._disposed) return
      if (!state.room || !Array.isArray(state.furniture)) { this.setData({ loading: false, failed: true }); return }
      const key = storageKey(wxApi, state)
      if (!this._world || this._storageKey !== key || this._world.home.size !== state.room.size || this._world.home.floors !== floorCount(state.home)) {
        if (this._world) this.flushWorldSave()
        let saved
        try { saved = this._storageKey === key && this._world ? this._world.serialize() : wxApi.getStorageSync(key) }
        catch (_) { this.setData({ loading: false, failed: true, message: '世界存档暂时读取失败，请重试。' }); return }
        this._storageKey = key; this._world = createWorld(state, saved)
        if (this._scene) { this._scene.dispose(); this._scene = null }
        this.setData({ firstVisit: !this._world.restored, sceneReady: false })
      } else this._world.syncResident(state)
      this.setData({ state, loading: false, failed: false, floors: this._world.home.floors, homeName: state.home.name })
      this.importNatureCrafts()
      if (this._world.rearranged) { this.setData({ message: '原来的家具已按新地板重新布置，放不下的仍在背包里。' }); this._world.rearranged = false }
      this.refreshWorldInventory(); this.updateWorldHUD()
      const requested = wxApi.getStorageSync('homeRoomRequested')
      if (requested) {
        wxApi.removeStorageSync('homeRoomRequested')
        const owned = state.furniture.find(f => f.id === requested && f.owned)
        if (owned && !this._world.furniture.some(f => f.id === requested)) this.chooseWorldItem(owned.id, 'furniture')
        else if (owned) this.setData({ message: '这件家具已经摆在世界里，走近后按“拿起”。' })
        else this.setData({ panel: 'bag', bagTab: 'furniture' })
      }
      this.initWorldScene()
    },
    initWorldScene() {
      if (!this._visible || !this._world || this._scene || this._scenePending || this._disposed || !wxApi.createSelectorQuery) return
      this._scenePending = true
      const query = wxApi.createSelectorQuery().in(this)
      query.select('#voxel-world').fields({ node: true })
      query.select('#world-stage').boundingClientRect()
      query.exec(results => {
        this._scenePending = false
        if (!this._visible || this._disposed) return
        // The canvas is hidden for loading and panels; its stable stage still has a size.
        const r = results && results[0] && { ...results[1], node: results[0].node }
        if (!r || !r.node || !r.width || !r.height) { this.setData({ sceneFailed: true }); return }
        try {
          const info = wxApi.getWindowInfo ? wxApi.getWindowInfo() : wxApi.getSystemInfoSync()
          this._canvasRect = r
          this._scene = createSandboxScene(r.node, r.width, r.height, this._world, { pixelRatio: info.pixelRatio, outfit: this.data.state.resident.outfit_id, onFrame: dt => this.tickWorld(dt), onError: () => { this.clearWorldInput(); if (!this._disposed) this.setData({ sceneFailed: true, sceneReady: false }) } })
          this._scene.hold(this.data.held, this.data.heldKind === 'furniture'); this._scene.start()
          this.setData({ sceneReady: true, sceneFailed: false })
        } catch (error) { if (this._scene) this._scene.dispose(); this._scene = null; this.setData({ sceneFailed: true, sceneReady: false }) }
      })
    },
    onWorldRetry() { if (this._scene) this._scene.dispose(); this._scene = null; this.setData({ sceneFailed: false }); this.initWorldScene() },
    bindWorldKeyboard() {
      if (this._keyDown || !wxApi.onKeyDown || !wxApi.onKeyUp) return
      this._keyDown = e => this.setWorldKey(keyName(e), true)
      this._keyUp = e => this.setWorldKey(keyName(e), false)
      wxApi.onKeyDown(this._keyDown); wxApi.onKeyUp(this._keyUp)
    },
    pauseWorld() {
      this.clearWorldInput()
      if (this._keyDown && wxApi.offKeyDown) wxApi.offKeyDown(this._keyDown)
      if (this._keyUp && wxApi.offKeyUp) wxApi.offKeyUp(this._keyUp)
      this._keyDown = null; this._keyUp = null; this._gesture = null; this._pointer = null
      if (this._scene) this._scene.stop()
    },
    clearWorldInput() {
      this._keys = new Set(); this._miningOnce = false; this._mineHeld = false; this._mining = null; this._jump = false
      this._mineStartTime = null; this._mineTapSuppressed = false
      this._walkPulse = null; this._walkPressAt = {}; this._lastWalkPress = null
      if (this._scene) { this._scene.swing(false); this._scene.showPreview(null) }
      if (!this._disposed) this.setData({ keys: {}, minePercent: 0 })
    },
    setWorldKey(key, down) {
      if (!this._visible || !key) return
      if (!this._keys) this._keys = new Set()
      const held = this._keys.has(key)
      if (down) this._keys.add(key); else this._keys.delete(key)
      if (!down) { if (key === 'f') this._mineHeld = false; this.setData({ ['keys.' + key]: false }); return }
      if (held) return
      if (key === 'escape') { this.onClosePanel(); this.setData({ mouseLook: false }); this._pointer = null; return }
      if (this.data.panel) return
      if (key === 'space') this._jump = true
      if (key === 'f') this._mineHeld = true
      if (key === 'e') this.onWorldInteract()
      if (key === 'q') this.onWorldPickup()
      if (key === 'r') this.onWorldPlace()
      if (key === 'b') this.onWorldBag()
      if (key === 'c') this.onWorldCraft()
      if (/^[1-5]$/.test(key)) { const row = this.data.hotbar[Number(key) - 1]; if (row) this.chooseWorldItem(row.id, row.kind) }
      if (['w', 'a', 's', 'd'].includes(key)) this.setData({ ['keys.' + key]: true })
    },
    onWorldKeyStart(e) {
      const key = e.currentTarget.dataset.key
      if (!this._walkPressAt) this._walkPressAt = {}
      if (this._walkPulse && this._walkPulse.key !== key && (!this._keys || !this._keys.has(this._walkPulse.key))) this.setData({ ['keys.' + this._walkPulse.key]: false })
      this._walkPressAt[key] = Date.now(); this._walkPulse = null; this.setWorldKey(key, true)
    },
    onWorldKeyEnd(e) {
      const key = e.currentTarget.dataset.key, start = this._walkPressAt && this._walkPressAt[key]
      this._lastWalkPress = { key, duration: start == null ? 0 : Date.now() - start }
      if (this._walkPressAt) delete this._walkPressAt[key]
      this.setWorldKey(key, false)
    },
    onWorldKeyCancel(e) { this.onWorldKeyEnd(e); this._lastWalkPress.duration = Infinity; this._walkPulse = null },
    onWorldKeyTap(e) {
      if (!this._visible || this.data.panel || !this._world) return
      const key = e.currentTarget.dataset.key, last = this._lastWalkPress
      if (!['w', 'a', 's', 'd'].includes(key) || last && last.key === key && last.duration > 200) return
      // A quick click can begin and end between two frames. Still take a small step.
      this._walkPulse = { key, remaining: .16 }; this._lastWalkPress = null
      this.setData({ ['keys.' + key]: true })
    },
    onWorldJump() { if (!this.data.panel && this._visible) this._jump = true },
    onWorldTouchStart(e) {
      if (!this._scene || this.data.panel || !e.touches.length) return
      const t = e.touches[0]; this._gesture = { x: t.clientX == null ? t.x : t.clientX, y: t.clientY == null ? t.y : t.clientY }
    },
    onWorldTouchMove(e) {
      if (!this._gesture || !this._world || !e.touches.length) return
      const t = e.touches[0], x = t.clientX == null ? t.x : t.clientX, y = t.clientY == null ? t.y : t.clientY
      this.lookWorld(x - this._gesture.x, y - this._gesture.y); this._gesture = { x, y }
    },
    onWorldTouchEnd() { this._gesture = null },
    onWorldTouchCancel() { this._gesture = null; this.clearWorldInput() },
    onWorldPointerMove(e) {
      const d = e.detail || e
      if (!this.data.mouseLook || this.data.panel || this._gesture || !this._visible || d.pointerType !== 'mouse' || d.buttons) { this._pointer = null; return }
      if (!Number.isFinite(d.clientX) || !Number.isFinite(d.clientY)) return
      const p = this._pointer; this._pointer = { x: d.clientX, y: d.clientY }
      if (p && Math.abs(d.clientX - p.x) < 120 && Math.abs(d.clientY - p.y) < 120) this.lookWorld(d.clientX - p.x, d.clientY - p.y)
    },
    onWorldPointerLeave() { this._pointer = null },
    onMouseLook() { this._pointer = null; this.setData({ mouseLook: !this.data.mouseLook }) },
    lookWorld(dx, dy) {
      if (!this._world) return
      const p = this._world.player
      p.yaw -= dx * .005; p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch + dy * .004))
    },
    tickWorld(dt) {
      if (!this._visible || !this._world) return
      const w = this._world
      if (!this.data.panel && !this.data.sceneFailed) {
        const keys = new Set(this._keys || []), p = w.player, pulse = this._walkPulse
        if (pulse) {
          keys.add(pulse.key); pulse.remaining -= dt
          if (pulse.remaining <= 0) { this._walkPulse = null; if (!this._keys || !this._keys.has(pulse.key)) this.setData({ ['keys.' + pulse.key]: false }) }
        }
        let dx = Number(keys.has('d')) - Number(keys.has('a')), dz = Number(keys.has('s')) - Number(keys.has('w'))
        const length = Math.hypot(dx, dz) || 1; dx /= length; dz /= length
        const moved = w.move((dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) * dt * 3.2, (-dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) * dt * 3.2, dt, this._jump)
        this._jump = false; w.tickMobs(dt)
        this._saveClock = (this._saveClock || 0) + dt
        if (moved && this._saveClock > 2) { this._saveClock = 0; this.queueWorldSave() }
        this._aimClock = (this._aimClock || 0) + dt
        if (this._scene && this._aimClock > .09) { this._aimClock = 0; this.updateWorldTarget() }
        this.tickWorldMining(dt)
        this._hudClock = (this._hudClock || 0) + dt
        if (this._hudClock > .4) { this._hudClock = 0; this.updateWorldHUD() }
      } else w.player.moving = false
    },
    updateWorldTarget() {
      if (!this._scene) return
      this._target = this._scene.aim(); this._scene.select(this._target)
      const t = this._target
      let name = '', hint = '拖动转头 · 按住左下箭头 / WASD 走动'
      if (t) {
        if (t.kind === 'block') { const c = this._world.cell(t.x, t.y, t.z); name = blocks[t.id].name; hint = blocks[t.id].unbreakable ? '黑色基岩 · 无法挖掘' : c.locked ? '原有建筑 · 受到保护' : 'F / 挖掘 · R / 放置' }
        if (t.kind === 'door') { name = '橡木门'; hint = t.object.door.open ? 'E / 互动 · 关门' : 'E / 互动 · 开门' }
        if (t.kind === 'portal') { name = '星门'; hint = 'E / 互动 · 穿越维度' }
        if (t.kind === 'mob') { const m = this._world.mobs.find(m => m.id === t.id); name = m ? species[m.kind].name : '小动物'; hint = 'E / 互动 · 打个招呼' }
        if (t.kind === 'furniture') { const f = this.data.state.furniture.find(f => f.id === t.id); name = f ? f.name : ''; hint = 'E / 使用 · Q / 拿起家具' }
      }
      const nearDoor = (!t || t.kind === 'block') && this._world.doorways().find(d => Math.hypot(d.x + .5 - this._world.player.x, d.z + .5 - this._world.player.z) < 2 && Math.abs(d.y - this._world.player.y) < 2)
      const door = t && t.kind === 'door' ? t.object.door : nearDoor
      const interactLabel = door ? door.open ? '关门' : '开门' : t && t.kind === 'portal' ? '穿越' : '互动'
      if (this.data.interactLabel !== interactLabel) this.setData({ interactLabel })
      if (this.data.held) hint = 'R / 放置 · 背包切换手持物'
      if (this.data.targetName !== name || this.data.targetHint !== hint || this.data.targetKind !== (t && t.kind || '')) this.setData({ targetName: name, targetHint: hint, targetKind: t && t.kind || '' })
      if (this.data.held && t && t.kind === 'block') {
        const p = this.placementPoint(t), f = this.data.heldKind === 'furniture' && this.data.state.furniture.find(f => f.id === this.data.held)
        this._scene.showPreview({ x: p.x + .5, y: p.y, z: p.z + .5 }, f ? f.width : 1, f ? .12 : 1, f ? f.depth : 1)
      } else this._scene.showPreview(null)
    },
    placementPoint(t) { return { x: t.x + t.normal.x, y: t.y + t.normal.y, z: t.z + t.normal.z } },
    updateWorldHUD() {
      const w = this._world, p = w.player, atHome = w.dimension === 'meadow' && p.x > 0 && p.x < w.home.size && p.z > 0 && p.z < w.home.size
      const region = p.y < -3 ? (p.y < -10 ? '深层矿洞' : '浅层矿洞') : atHome ? '在自己的家' : w.dimension === 'aether' ? '星苔秘境' : '门外的草地'
      this.setData({ dimension: w.dimension, worldName: w.dimension === 'aether' ? '星苔秘境' : '草地世界', region, currentFloor: Math.max(1, Math.floor((p.y + .05) / 4) + 1), coordinates: [p.x, p.y, p.z].map(Math.floor).join(' / '), landmarks: this._scene && this._scene.landmarks ? this._scene.landmarks() : [], journal: w.inventory.portal ? '星门已合成 · 找一片空地把它放下' : w.inventory.moonstone ? '收集奇异矿石 → 合成星门框与星门' : w.inventory.plank ? '木板到手 · 用图纸建房或继续挖矿' : '砍树取原木 → 合成木板 → 挖矿与建造' })
    },
    onWorldMine() {
      if (this._mineTapSuppressed) { this._mineTapSuppressed = false; return }
      if (!this.data.panel) { this.updateWorldTarget(); this._miningOnce = true; this._mining = null }
    },
    onWorldMineStart() { if (!this.data.panel) { this.updateWorldTarget(); this._mineHeld = true; this._mineStartTime = Date.now(); this._mineTapSuppressed = false } },
    onWorldMineEnd() { this._mineHeld = false; this._mineTapSuppressed = this._mineStartTime != null && Date.now() - this._mineStartTime > 200; this._mineStartTime = null },
    tickWorldMining(dt) {
      if (!this._scene) return
      if (!this._mineHeld && !this._miningOnce) { if (this._mining) { this._mining = null; this.setData({ minePercent: 0 }); this._scene.swing(false) }; return }
      const t = this._target
      if (!t || t.kind !== 'block') { this._miningOnce = false; this._mineHeld = false; this._mining = null; this.setData({ minePercent: 0, message: '拖动画面，让中心准星对准附近的草地、树干或矿石，再点“挖掘”。' }); this._scene.swing(false); return }
      const c = this._world.cell(t.x, t.y, t.z), spec = blocks[t.id]
      if (c.locked || spec.unbreakable) { this.worldResult(this._world.mine(t)); this._miningOnce = false; this._mineHeld = false; this._mining = null; this.setData({ minePercent: 0 }); this._scene.swing(false); return }
      const id = t.x + ',' + t.y + ',' + t.z
      if (!this._mining || this._mining.id !== id) this._mining = { id, progress: 0 }
      this._mining.progress += dt / spec.hardness
      const percent = Math.min(100, Math.floor(this._mining.progress * 20) * 5)
      if (this.data.minePercent !== percent) this.setData({ minePercent: percent })
      this._scene.swing(true)
      if (this._mining.progress >= 1) {
        this.worldResult(this._world.mine(t)); this._mining = null; this._miningOnce = false; this._scene.swing(false); this.setData({ minePercent: 0 }); this.updateWorldTarget()
      }
    },
    onWorldPlace() {
      if (!this._world || this.data.panel || !this.data.held) { this.setData({ message: '先打开背包，拿起一件家具或一种方块。' }); return }
      this.updateWorldTarget()
      const t = this._target, id = this.data.held, w = this._world
      if (!t || t.kind !== 'block') { this.setData({ message: '把准星对准地面或方块表面再放置。' }); return }
      const p = this.placementPoint(t)
      let result
      if (this.data.heldKind === 'furniture') result = t.normal.y === 1 ? w.placeFurniture(id, { x: t.point.x, y: t.y + 1, z: t.point.z }, this.data.rotation) : { ok: false, message: '家具需要放在地面上，把准星往下看一点。' }
      else if (id === 'portal') result = t.normal.y === 1 ? w.placePortal(p) : { ok: false, message: '把星门放在平地上。' }
      else if (['cottage', 'tower'].includes(id)) result = w.build(id, p)
      else result = w.place(id, p, id === 'mirror' ? this.data.rotation : undefined)
      this.worldResult(result)
      if (result.ok && (this.data.heldKind === 'furniture' || !w.inventory[id])) this.chooseWorldItem('', '')
      this.updateWorldTarget()
    },
    onWorldInteract() {
      if (!this._scene || this.data.panel) return
      this.updateWorldTarget(); const t = this._target, w = this._world
      if (t && t.kind === 'door') {
        this.worldResult(t.object.door.loose ? w.toggleBlockDoor(t.object.door) : w.toggleDoor(t.id)); return
      }
      if (t && t.kind === 'portal') { this.clearWorldInput(); this.worldResult(w.travel(t.object.portal)); this.updateWorldHUD(); return }
      if (t && t.kind === 'mob') { this.worldResult(w.interactMob(t.id)); return }
      if (t && t.kind === 'furniture') {
        if (t.id === 'tv') { this.clearWorldInput(); this.setData({ panel: 'tv' }) }
        if (this._scene.activate) this._scene.activate(t.id)
        this.setData({ message: actions[t.id] ? actions[t.id].text : '在自己的家里歇一会儿。' }); return
      }
      const s = w.shop, p = w.player
      if (w.dimension === 'meadow' && p.x > s.x && p.x < s.x + s.size && p.z > s.z && p.z < s.z + s.size) { this.onWorldShop(); return }
      const gate = w.portals.find(g => g.dimension === w.dimension && Math.hypot(g.x + 2 - p.x, g.y - p.y, g.z + .5 - p.z) < 3)
      if (gate) { this.clearWorldInput(); this.worldResult(w.travel(gate)); this.updateWorldHUD(); return }
      const door = w.doorways().find(d => Math.hypot(d.x + .5 - p.x, d.z + .5 - p.z) < 2)
      if (door) { this.worldResult(door.loose ? w.toggleBlockDoor(door) : w.toggleDoor(door.id)); return }
      this.setData({ message: '靠近木门、家具、小动物或星门，再按互动。' })
    },
    onWorldPickup() {
      if (!this._scene || this.data.panel) return
      this.updateWorldTarget(); const t = this._target
      if (!t || t.kind !== 'furniture') { this.setData({ message: '把准星对准家具，再按“拿起”。' }); return }
      const result = this._world.pickFurniture(t.id); this.worldResult(result)
      if (result.ok) this.chooseWorldItem(result.id, 'furniture')
    },
    worldResult(result) {
      this.setData({ message: result.message })
      if (result.ok) { this.refreshWorldInventory(); this.queueWorldSave() }
    },
    refreshWorldInventory() {
      if (!this._world || !this.data.state) return
      const w = this._world
      const bagItems = Object.entries(w.inventory).filter(([, n]) => n > 0).map(([id, count]) => ({ id, count, name: item(id).name, color: hex(item(id).color), kind: 'block', selected: this.data.held === id }))
      const furnitureItems = this.data.state.furniture.filter(f => f.owned).map(f => ({ id: f.id, name: f.name, image: '/home/images/' + f.id + '.png', kind: 'furniture', placed: w.furniture.some(p => p.id === f.id), selected: this.data.held === f.id }))
      const recipeItems = recipes.map(r => ({ ...r, affordable: Object.entries(r.cost).every(([id, n]) => (w.inventory[id] || 0) >= n), ingredients: Object.entries(r.cost).map(([id, n]) => ({ id, name: blocks[id].name, count: n, have: w.inventory[id] || 0, enough: (w.inventory[id] || 0) >= n, color: hex(blocks[id].color) })) }))
      const hotIds = [...new Set([this.data.held, 'log', 'plank', 'stone', 'grass', ...bagItems.map(i => i.id)].filter(Boolean))].slice(0, 5)
      const hotbar = hotIds.map((id, i) => { const f = this.data.state.furniture.find(f => f.id === id); return { id, slot: i + 1, name: f ? f.name : item(id).name, color: f ? '#ba975e' : hex(item(id).color), count: f ? 1 : w.inventory[id] || 0, kind: f ? 'furniture' : 'block', image: f ? '/home/images/' + f.id + '.png' : '', selected: this.data.held === id } })
      this.setData({ bagItems, furnitureItems, recipeItems, hotbar })
    },
    chooseWorldItem(id, kind) {
      if (!this._world) return
      if (kind === 'furniture' && this._world.furniture.some(f => f.id === id)) { this.setData({ message: '这件家具已经摆好了，走过去按“拿起”就能移动。' }); return }
      const f = kind === 'furniture' && this.data.state.furniture.find(f => f.id === id && f.owned)
      if (kind === 'furniture' && !f || id && kind !== 'furniture' && !item(id)) return
      this.clearWorldInput()
      if (id === 'mirror') this.setData({ rotation: ((Math.round(this._world.player.yaw / (Math.PI / 2)) * 90) % 360 + 360) % 360 })
      this.setData({ held: id, heldKind: kind, heldName: f ? f.name : id ? item(id).name : '空手', heldColor: f ? '#ba975e' : id ? hex(item(id).color) : '#d1aa69', panel: '', message: id ? '已经拿起' + (f ? f.name : item(id).name) + '，对准地面按“放置”。' : '放下手持物，可以继续探索。' })
      if (this._scene) this._scene.hold(id, kind === 'furniture')
      this.refreshWorldInventory()
    },
    onWorldChoose(e) { this.chooseWorldItem(e.currentTarget.dataset.id, e.currentTarget.dataset.kind) },
    onWorldEmptyHand() { this.chooseWorldItem('', '') },
    onWorldRotate() { this.setData({ rotation: (this.data.rotation + 90) % 360, message: (this.data.held === 'mirror' ? '镜面' : '家具') + '方向：' + (this.data.rotation + 90) % 360 + '°' }) },
    onWorldCraftRecipe(e) { if (this._world) this.worldResult(this._world.craft(e.currentTarget.dataset.id)) },
    openWorldPanel(panel) { this.clearWorldInput(); this.setData({ panel }); this.refreshWorldInventory() },
    onWorldBag() { this.openWorldPanel('bag') },
    onWorldCraft() { this.openWorldPanel('craft') },
    onWorldGuide() { this.openWorldPanel('guide') },
    onBagTab(e) { this.setData({ bagTab: e.currentTarget.dataset.tab }) },
    onClosePanel() { this.clearWorldInput(); this.setData({ panel: '', firstVisit: false }) },
    onWorldTVNext() { const index = (this.data.tvIndex + 1) % nature.length; this.setData({ tvIndex: index, tvNature: nature[index] }) },
    onWorldShop() { this.clearWorldInput(); this.flushWorldSave(); wxApi.navigateTo({ url: '/home/pages/mall/mall' }) },
    onNatureVisit() { this.clearWorldInput(); this.flushWorldSave(); wxApi.navigateTo({ url: '/home/pages/room/room?nature=1' }) },
    onWorldUpgrade() { this.flushWorldSave(); wxApi.setStorageSync('residentTabRequested', 'home'); wxApi.switchTab({ url: '/pages/resident/resident' }) },
    onWorldHome() { if (!this._world) return; this.clearWorldInput(); this._world.goHome(); this.setData({ panel: '', message: '回到家啦，背包里的东西都带回来了。' }); this.updateWorldHUD(); this.queueWorldSave() },
    importNatureCrafts() {
      if (!this._world || !this._storageKey) return
      try {
        const user = wxApi.getStorageSync('userInfo') || {}
        if (!user.id) return
        const source = 'nature-world-v1:' + (wxApi.getStorageSync('apiBackend') || 'local') + ':' + user.id
        const count = transferCrafts(wxApi, source, this._storageKey, this._world)
        if (count) this.setData({ message: '林溪的玻璃与银镜已带回背包，可以在家中自由摆放。' })
        this._transferFailed = false
      } catch (_) { this._transferFailed = true; this.setData({ saveLabel: '保存失败 · 点此重试', message: '带回林溪物品还没保存完成，点底部重试即可继续。' }) }
    },
    queueWorldSave() {
      if (this._disposed || !this._world) return
      clearTimeout(this._saveTimer)
      this.setData({ saveLabel: '正在保存…' }); this._saveTimer = setTimeout(() => this.flushWorldSave(), 650)
    },
    flushWorldSave() {
      clearTimeout(this._saveTimer); this._saveTimer = null
      if (!this._world || !this._storageKey) return
      try {
        wxApi.setStorageSync(this._storageKey, this._world.serialize())
        if (this._transferFailed) { this.importNatureCrafts(); this.refreshWorldInventory() }
        if (!this._disposed && !this._transferFailed) this.setData({ saveLabel: '已保存到本机' })
      }
      catch (_) { if (!this._disposed) this.setData({ saveLabel: '保存失败 · 点此重试', message: '本机空间可能不足，世界仍保留在画面里，请腾出空间后重试保存。' }) }
    },
    onNoop() {}
  }
}
module.exports = { createSandboxPage, worldData, keyName, storageKey }
