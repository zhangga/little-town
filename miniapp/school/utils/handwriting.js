// 笔迹使用 0–1 坐标存储；改变窗口大小时可重画，撤销以完整一笔为单位。
function createHandwriting(page, wxApi, onState) {
  let ctx = null, width = 0, height = 0, strokes = [], current = null
  let generation = 0, guide = true, character = '', ready = false
  function notify() { onState({ hasInk: strokes.length > 0, strokeCount: strokes.length, canvasReady: ready }) }
  function segment(points) {
    if (!ctx || !points.length) return
    ctx.strokeStyle = '#344c42'
    ctx.fillStyle = '#344c42'
    ctx.lineWidth = Math.max(4, width / 55)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (points.length === 1) {
      ctx.beginPath(); ctx.arc(points[0].x * width, points[0].y * height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.beginPath(); ctx.moveTo(points[0].x * width, points[0].y * height)
      points.slice(1).forEach(point => ctx.lineTo(point.x * width, point.y * height))
      ctx.stroke()
    }
  }
  function redraw() {
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#fffcf2'; ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#d9b8a1'; ctx.lineWidth = 1
    ctx.setLineDash([5, 5]); ctx.beginPath()
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height)
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2)
    ctx.moveTo(0, 0); ctx.lineTo(width, height)
    ctx.moveTo(width, 0); ctx.lineTo(0, height); ctx.stroke(); ctx.setLineDash([])
    if (guide && character) {
      ctx.fillStyle = '#dfd8c9'; ctx.font = (width * 0.76) + 'px "Kaiti SC", "STKaiti", "KaiTi", serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(character, width / 2, height / 2 + width * 0.035)
    }
    strokes.forEach(segment)
  }
  function init() {
    const ticket = ++generation
    ready = false; current = null; ctx = null; notify()
    try {
      wxApi.createSelectorQuery().in(page).select('#writing-canvas').fields({ node: true, size: true }).exec(result => {
        if (ticket !== generation) return
        const box = result && result[0]
        if (!box || !box.node || !box.width || !box.height) { onState({ canvasError: '写字板没准备好，点一下重新加载。' }); return }
        try {
          const info = wxApi.getWindowInfo ? wxApi.getWindowInfo() : wxApi.getSystemInfoSync()
          const ratio = info.pixelRatio || 1
          width = box.width; height = box.height
          box.node.width = Math.round(width * ratio); box.node.height = Math.round(height * ratio)
          ctx = box.node.getContext('2d'); ctx.scale(ratio, ratio)
          ready = true; redraw(); onState({ canvasError: '' }); notify()
        } catch (_) { ready = false; ctx = null; onState({ canvasError: '写字板暂时不可用，请重试或更新微信。' }); notify() }
      })
    } catch (_) { onState({ canvasError: '写字板暂时不可用，请重试或更新微信。' }) }
  }
  function point(event) {
    const touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0])
    if (!touch || !Number.isFinite(touch.x) || !Number.isFinite(touch.y)) return null
    return { x: Math.max(0, Math.min(1, touch.x / width)), y: Math.max(0, Math.min(1, touch.y / height)) }
  }
  function start(event) {
    if (!ready || strokes.length >= 100) return
    const p = point(event)
    if (!p) return
    current = [p]; strokes.push(current); segment(current); notify()
  }
  function move(event) {
    if (!current || !ready || current.length >= 2000) return
    const p = point(event)
    if (!p) return
    const last = current[current.length - 1]
    if (Math.abs(last.x - p.x) + Math.abs(last.y - p.y) < 0.002) return
    current.push(p); segment([last, p])
  }
  return {
    init, start, move, end() { current = null },
    reset(text) { character = text || ''; strokes = []; current = null; redraw(); notify() },
    toggleGuide(value) { guide = value; redraw() },
    undo() { current = null; strokes.pop(); redraw(); notify() },
    clear() { current = null; strokes = []; redraw(); notify() },
    suspend() { generation++; current = null; ctx = null; ready = false },
    destroy() { generation++; current = null; ctx = null; ready = false; strokes = [] }
  }
}

module.exports = { createHandwriting }
