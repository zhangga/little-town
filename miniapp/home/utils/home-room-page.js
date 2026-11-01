const { ENTRY, nature, actions, project, dimensions, pathTo, approach, canPlace, presentFurniture, roomView, actorView } = require('./home-room')
const roomData = {
  roomSupported: false, roomEditing: false, roomDirty: false, roomVersion: 0, roomDraft: [], roomFurniture: [], roomCells: [],
  roomInventory: [], roomSelected: '', roomRotation: 0, roomActor: null, roomMessage: '点地板走过去，点家具试试看。',
  roomAction: '', roomLamp: false, roomTV: false, roomNatureIndex: 0, roomNature: nature[0], roomSaving: false
}
function createHomeRoom(api, wxApi, showError, clock = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) }) {
  return {
    syncRoom(state) {
      if (!state.room || !Array.isArray(state.furniture)) { this.setData({ roomSupported: false }); return }
      const patch = { roomSupported: true }
      if (!this.data.roomEditing) {
        patch.roomDraft = state.room.layout.map(p => Object.assign({}, p))
        patch.roomVersion = state.room.version
        const actor = this.data.roomActor || ENTRY
        const valid = pathTo(ENTRY, actor, patch.roomDraft, state.furniture) !== null
        patch.roomActor = actorView(valid ? actor : ENTRY, state.resident.outfit_id)
      }
      this.setData(patch)
      this.refreshRoom()
    },
    refreshRoom() {
      const catalog = presentFurniture(this.data.state.furniture, this.data.state.wallet, this.data.roomDraft)
      this.setData(Object.assign({ roomInventory: catalog.filter(i => i.owned) }, roomView(this.data.roomDraft, catalog, this.data.roomSelected, this.data.roomRotation)))
    },
    stopRoomWalk() {
      clock.clearTimeout(this._roomTimer); this._roomTimer = null
      if (!this._disposed && this.data.roomActor) this.setData({ 'roomActor.moving': false, roomTV: false })
    },
    onRoomEdit() {
      if (this.data.busy || this.data.roomSaving || !this.data.roomSupported) return
      this.stopRoomWalk()
      this.setData({ roomEditing: true, roomAction: '', roomMessage: '先选一件家具，再点亮起的地板放下。' })
    },
    onRoomCancel() {
      if (this.data.roomSaving) return
      this.setData({ roomEditing: false, roomDirty: false, roomSelected: '', roomRotation: 0, roomMessage: '点地板走过去，点家具试试看。' })
      this.syncRoom(this.data.state)
    },
    onRoomChoose(e) {
      if (!this.data.roomEditing || this.data.roomSaving) return
      const id = e.currentTarget.dataset.id
      const item = this.data.roomInventory.find(item => item.id === id)
      if (!item) return
      const placed = this.data.roomDraft.find(p => p.id === id)
      this.setData({ roomSelected: id, roomRotation: placed ? placed.rotation : 0, roomMessage: '正在摆放「' + item.name + '」，点一个亮起的位置。' })
      this.refreshRoom()
    },
    onRoomRotate() {
      if (!this.data.roomSelected || this.data.roomSaving) return
      const rotation = 1 - this.data.roomRotation
      const placed = this.data.roomDraft.find(p => p.id === this.data.roomSelected)
      if (placed) {
        const rotated = Object.assign({}, placed, { rotation })
        if (!canPlace(this.data.roomDraft, this.data.state.furniture, rotated)) { this.setData({ roomMessage: '这个位置转不开，先换个空一点的地方吧。' }); return }
        this.setData({ roomDraft: this.data.roomDraft.map(p => p.id === placed.id ? rotated : p), roomDirty: true, roomMessage: '换个方向摆好了，记得保存布置。' })
      } else this.setData({ roomMessage: '方向选好啦，点亮起的地板放下。' })
      this.setData({ roomRotation: rotation }); this.refreshRoom()
    },
    onRoomStore() {
      if (!this.data.roomSelected || this.data.roomSaving) return
      this.setData({ roomDraft: this.data.roomDraft.filter(p => p.id !== this.data.roomSelected), roomDirty: true, roomMessage: '已收进家具箱，记得保存布置。' })
      this.refreshRoom()
    },
    async onRoomSave() {
      if (!this.data.roomEditing || this.data.roomSaving || this.data.busy || this._loadPromise) return
      if (!this.data.roomDirty) { this.onRoomCancel(); return }
      this.setData({ roomSaving: true, busy: true })
      const layout = this.data.roomDraft.map(p => Object.assign({}, p))
      try {
        const state = await api.put('/resident/room', { expected_version: this.data.roomVersion, layout })
        if (this._disposed) return
        this.setData({ roomEditing: false, roomDirty: false, roomSelected: '', roomMessage: '布置保存好啦，来家里走走吧。' })
        this.applyState(state)
      } catch (err) {
        if (this._disposed) return
        let recovered = false
        try {
          const state = await api.get('/resident')
          if (this._disposed) return
          recovered = JSON.stringify(state.room.layout) === JSON.stringify(layout)
          if (recovered || state.room.version !== this.data.roomVersion) this.setData({ roomEditing: false, roomDirty: false, roomSelected: '' })
          this.applyState(state)
        } catch (_) {}
        if (!this._disposed) {
          if (recovered) this.setData({ roomMessage: '布置已经保存好啦。' })
          else showError(err.message || '布置尚未确认，草稿还在，请稍后再试')
        }
      } finally { if (!this._disposed) this.setData({ roomSaving: false, busy: false }) }
    },
    onRoomCell(e) {
      if (this.data.busy || !this.data.roomSupported) return
      const target = { x: Number(e.currentTarget.dataset.x), y: Number(e.currentTarget.dataset.y) }
      if (this.data.roomEditing) {
        if (!this.data.roomSelected) { this.setData({ roomMessage: '先在下面的家具箱里选一件家具。' }); return }
        const p = Object.assign({ id: this.data.roomSelected, rotation: this.data.roomRotation }, target)
        if (!canPlace(this.data.roomDraft, this.data.state.furniture, p)) { this.setData({ roomMessage: '这里放不下，试试亮起的地板吧。' }); return }
        this.setData({ roomDraft: this.data.roomDraft.filter(i => i.id !== p.id).concat(p), roomDirty: true, roomMessage: '放好啦！可以继续调整，最后点「保存布置」。' })
        this.refreshRoom(); return
      }
      this.walkRoom(pathTo(this.data.roomActor, target, this.data.roomDraft, this.data.state.furniture))
    },
    onRoomMove(e) {
      if (this.data.roomEditing || this.data.busy || !this.data.roomActor) return
      const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[e.currentTarget.dataset.direction]
      if (!delta) return
      const p = { x: this.data.roomActor.x + delta[0], y: this.data.roomActor.y + delta[1] }
      const path = pathTo(this.data.roomActor, p, this.data.roomDraft, this.data.state.furniture)
      this.walkRoom(path && path.length <= 1 ? path : null)
    },
    walkRoom(path, done) {
      this.stopRoomWalk()
      if (path === null) { this.setData({ roomMessage: '前面走不过去，换个方向试试吧。' }); return }
      this.setData({ roomAction: '', roomMessage: '在自己的小家里，慢慢走。' })
      const step = () => {
        if (this._disposed || !this._visible || this.data.tab !== 'room') return
        const next = path.shift()
        if (!next) {
          this.setData({ 'roomActor.moving': false })
          if (done) done()
          return
        }
        const prev = this.data.roomActor
        const direction = next.x !== prev.x ? next.x > prev.x ? 'right' : 'left' : next.y > prev.y ? 'down' : 'up'
        this.setData({ roomActor: actorView(next, this.data.state.resident.outfit_id, direction, true) })
        this._roomTimer = clock.setTimeout(step, 220)
      }
      step()
    },
    onRoomFurniture(e) {
      if (this.data.busy) return
      if (this.data.roomEditing) { this.onRoomChoose(e); return }
      const id = e.currentTarget.dataset.id
      const placed = this.data.roomDraft.find(p => p.id === id)
      if (!placed || !actions[id]) return
      this.walkRoom(approach(this.data.roomActor, placed, this.data.roomDraft, this.data.state.furniture), () => {
        const action = actions[id]
        this.setData({ roomAction: id, roomMessage: action.text, 'roomActor.pose': action.pose })
        if (['chair', 'sofa', 'bed'].includes(id)) {
          const item = this.data.state.furniture.find(item => item.id === id)
          const { w, d } = dimensions(item, placed.rotation)
          const seat = project(placed.x + (w - 1) / 2, placed.y + (d - 1) / 2)
          this.setData({ 'roomActor.left': seat.left, 'roomActor.top': seat.top - (id === 'bed' ? 16 : 22), 'roomActor.z': (placed.x + placed.y + w + d - 2) * 10 + 26 })
        }
        if (id === 'lamp') this.setData({ roomLamp: !this.data.roomLamp, roomMessage: this.data.roomLamp ? '灯关上了，窗外的阳光也很好。' : '小灯亮起来，房间暖暖的。' })
        if (id === 'tv') this.setData({ roomTV: true })
      })
    },
    onRoomNature(e) {
      const roomNatureIndex = (this.data.roomNatureIndex + Number(e.currentTarget.dataset.step) + nature.length) % nature.length
      this.setData({ roomNatureIndex, roomNature: nature[roomNatureIndex] })
    },
    onRoomTVClose() { this.setData({ roomTV: false }) },
    onGoMall() {
      if (this.data.busy) return
      this.stopRoomWalk()
      wxApi.navigateTo({ url: '/home/pages/mall/mall' })
    }
  }
}
module.exports = { roomData, createHomeRoom }
