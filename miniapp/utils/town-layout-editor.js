const { townPlots } = require('./town')
const { moveTownBuilding, dropCell, layoutPayload, ROW_STEP } = require('./town-layout')

function createLayoutEditor(wxApi, api, showError, clock = {setTimeout: (fn, delay) => setTimeout(fn, delay), clearTimeout: id => clearTimeout(id)}) {
  return {
    measureLayout() {
      if (!wxApi.createSelectorQuery) return
      wxApi.createSelectorQuery().in(this).select('.town-neighborhood').boundingClientRect()
        .select('.town-scroll').boundingClientRect().exec(rects => {
          if (this._disposed || !rects[0] || !rects[1]) return
          this._layoutGeometry = Object.assign({}, rects[0], {scrollTop: this._scrollTop || 0})
          this._layoutViewport = rects[1]
        })
    },
    onTownScroll(e) {
      this._scrollTop = Number(e.detail.scrollTop) || 0
      if (this._drag && this.data.dragging) this.updateLayoutTouch(this._drag.touch, true)
    },
    applyLayoutGrid(grid) {
      this.setData(townPlots(grid.buildings, '', true, grid.layout))
    },
    async onToggleLayout() {
      if (this.data.layoutSaving || this.data.dragging || this.data.refreshing || this.data.lifeBusy) return
      if (this.data.editingLayout) {
        if (!this.data.layoutDirty) { this.finishLayoutEditing(); return }
        this.setData({layoutSaving: true})
        try {
          const result = await api.put('/buildings/layout', layoutPayload(this.data))
          if (this._disposed) return
          const positions = new Map(result.layout.buildings.map(item => [item.id, item]))
          this.applyLayoutGrid({buildings: this.data.buildings.map(item => Object.assign({}, item, positions.get(item.id))), layout: result.layout})
          this.finishLayoutEditing()
        } catch (err) {
          if (!this._disposed) showError(err.message || '位置还没保存，点完成可重试')
        } finally {
          if (!this._disposed) this.setData({layoutSaving: false})
        }
        return
      }
      this._layoutSnapshot = JSON.parse(JSON.stringify({buildings: this.data.buildings, layout: this.data.layout}))
      this.setData({editingLayout: true, layoutDirty: false, selected: null, moveSelection: '', townAnchor: ''}, () => this.measureLayout())
      this.stopNeedsClock()
      if (this._stroll) this._stroll.stop()
    },
    finishLayoutEditing() {
      this.stopLayoutDrag()
      this.setData({editingLayout: false, layoutDirty: false, moveSelection: ''})
      this.syncStroll()
      if (this._stroll && this.data.sceneActive) this._stroll.start()
      this.startNeedsClock()
    },
    onCancelLayout() {
      if (this.data.layoutSaving) return
      if (this._layoutSnapshot) this.applyLayoutGrid(this._layoutSnapshot)
      this.finishLayoutEditing()
    },
    placeLayoutBuilding(id, slot) {
      const grid = moveTownBuilding(this.data.buildings, this.data.layout.home, this.data.layout.rows, id, slot)
      if (!grid) return
      if (JSON.stringify(layoutPayload(grid)) === JSON.stringify(layoutPayload(this.data))) {
        this.setData({moveSelection: ''})
        return
      }
      this.applyLayoutGrid(grid)
      this.setData({layoutDirty: true, moveSelection: ''})
    },
    onLayoutPlotTap(e) {
      if (this.data.layoutSaving || Date.now() < (this._ignoreLayoutTapUntil || 0)) return
      const plot = this.data.plots[Number(e.currentTarget.dataset.index)]
      if (!plot) return
      if (this.data.moveSelection !== '') {
        this.placeLayoutBuilding(this.data.moveSelection, plot.slot)
      } else if (plot.occupied) this.setData({moveSelection: plot.id})
    },
    onLayoutTouchStart(e) {
      if (!this.data.editingLayout || this.data.layoutSaving || !this._layoutGeometry) return
      const plot = this.data.plots[Number(e.currentTarget.dataset.index)]
      const touch = e.touches && e.touches[0]
      if (!plot || !plot.occupied || !touch) return
      this._drag = {id: plot.id, plot, start: touch, touch, scrollTop: this._scrollTop || 0}
    },
    onLayoutTouchMove(e) {
      if (this._drag && e.touches && e.touches.length === 1) this.updateLayoutTouch(e.touches[0])
    },
    updateLayoutTouch(touch, fromScroll = false) {
      const drag = this._drag, geometry = this._layoutGeometry
      if (!drag || !geometry) return
      drag.touch = touch
      const dx = touch.clientX - drag.start.clientX
      const dy = touch.clientY - drag.start.clientY
      if (!this.data.dragging && Math.hypot(dx, dy) < 6) return
      this.setData({dragging: true, dragID: drag.id,
        dragLeft: drag.plot.left + dx / geometry.width * 100,
        dragTop: drag.plot.top + (dy + (this._scrollTop || 0) - drag.scrollTop) / geometry.width * 750,
        dropSlot: dropCell(touch, geometry, this._scrollTop || 0, this.data.layout.rows)})
      if (fromScroll || !this._layoutViewport) return
      const viewport = this._layoutViewport
      const direction = touch.clientY < viewport.top + 48 ? -1 : touch.clientY > viewport.bottom - 48 ? 1 : 0
      if (direction === this._layoutScrollDirection) return
      this.stopLayoutAutoScroll()
      this._layoutScrollDirection = direction
      if (!direction) return
      const tick = () => {
        if (this._disposed || !this._drag || !this.data.dragging) return
        const mapBottom = geometry.top + geometry.scrollTop - viewport.top + this.data.layout.rows * ROW_STEP * geometry.width / 750
        const maximum = Math.max(0, mapBottom - viewport.height)
        const next = Math.min(maximum, Math.max(0, (this._scrollTop || 0) + direction * 12))
        if (next === (this._scrollTop || 0)) { this.stopLayoutAutoScroll(); return }
        this._scrollTop = next
        this.setData({mapScrollTop: next})
        this.updateLayoutTouch(this._drag.touch, true)
        this._layoutScrollTimer = clock.setTimeout(tick, 40)
      }
      this._layoutScrollTimer = clock.setTimeout(tick, 40)
    },
    stopLayoutAutoScroll() {
      clock.clearTimeout(this._layoutScrollTimer)
      this._layoutScrollTimer = null
      this._layoutScrollDirection = 0
    },
    onLayoutTouchEnd(e) {
      if (!this._drag) return
      if (this.data.dragging) {
        if (e.changedTouches && e.changedTouches[0]) this.updateLayoutTouch(e.changedTouches[0], true)
        this.placeLayoutBuilding(this._drag.id, this.data.dropSlot)
        this._ignoreLayoutTapUntil = Date.now() + 300
      }
      this.stopLayoutDrag()
    },
    stopLayoutDrag() {
      this.stopLayoutAutoScroll()
      this._drag = null
      if (!this._disposed) this.setData({dragging: false, dragID: '', dropSlot: -1})
    }
  }
}

module.exports = { createLayoutEditor }
