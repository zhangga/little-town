const COLUMNS = 3
const ROW_STEP = 344

function valid(position, rows) {
  return position && Number.isInteger(position.position_x) && Number.isInteger(position.position_y) &&
    position.position_x >= 0 && position.position_x < COLUMNS && position.position_y >= 0 && position.position_y < rows
}

function buildTownGrid(raw, withHome = true, saved = {}) {
  const rows = Math.max(6, Number(saved.rows) || 0, Math.ceil((raw.length + 1 + COLUMNS) / COLUMNS))
  const home = valid(saved.home, rows) ? Object.assign({}, saved.home) : {position_x: 0, position_y: 0}
  const used = new Set(withHome ? [home.position_y * COLUMNS + home.position_x] : [])
  const buildings = raw.map(building => {
    const slot = building.position_y * COLUMNS + building.position_x
    const keep = valid(building, rows) && !used.has(slot)
    if (keep) used.add(slot)
    return Object.assign({}, building, {position_x: keep ? building.position_x : -1, position_y: keep ? building.position_y : -1})
  })
  buildings.forEach(building => {
    if (building.position_x >= 0) return
    let slot = 0
    while (used.has(slot)) slot++
    used.add(slot)
    building.position_x = slot % COLUMNS
    building.position_y = Math.floor(slot / COLUMNS)
  })
  const plots = Array.from({length: rows * COLUMNS}, (_, slot) => ({id: 'empty-' + slot, occupied: false, position_x: slot % COLUMNS, position_y: Math.floor(slot / COLUMNS)}))
  buildings.forEach(building => { plots[building.position_y * COLUMNS + building.position_x] = Object.assign({}, building, {occupied: true}) })
  if (withHome) plots[home.position_y * COLUMNS + home.position_x] = Object.assign({id: 'home', name: '我的家', occupied: true, home: true}, home)
  let firstEmpty = true
  plots.forEach((plot, slot) => {
    plot.slot = slot
    plot.left = plot.position_x * 100 / COLUMNS
    plot.top = plot.position_y * ROW_STEP
    plot.next = !plot.occupied && firstEmpty
    if (plot.next) firstEmpty = false
  })
  return {buildings, plots, layout: {columns: COLUMNS, rows, home}}
}

function moveTownBuilding(buildings, home, rows, id, targetSlot) {
  const grid = buildTownGrid(buildings, true, {home, rows})
  const source = grid.plots.find(plot => plot.occupied && String(plot.id) === String(id))
  const target = grid.plots[targetSlot]
  if (!source || !target || !Number.isInteger(targetSlot)) return null
  const nextHome = Object.assign({}, home)
  const nextBuildings = grid.buildings.map(building => Object.assign({}, building))
  function place(plot, position) {
    const item = plot.home ? nextHome : nextBuildings.find(building => building.id === plot.id)
    item.position_x = position.position_x
    item.position_y = position.position_y
  }
  place(source, target)
  if (target.occupied && target.id !== source.id) place(target, source)
  return buildTownGrid(nextBuildings, true, {home: nextHome, rows})
}

function dropCell(touch, geometry, scrollTop, rows) {
  const x = (touch.clientX - geometry.left) / geometry.width * 750
  const y = (touch.clientY - geometry.top + scrollTop - geometry.scrollTop) / geometry.width * 750
  const column = Math.min(COLUMNS - 1, Math.max(0, Math.floor(x / (750 / COLUMNS))))
  const row = Math.min(rows - 1, Math.max(0, Math.floor(y / ROW_STEP)))
  return row * COLUMNS + column
}

function layoutPayload(grid) {
  return {
    home: Object.assign({}, grid.layout.home),
    buildings: grid.buildings.map(building => ({id: building.id, position_x: building.position_x, position_y: building.position_y}))
  }
}

module.exports = {COLUMNS, ROW_STEP, buildTownGrid, moveTownBuilding, dropCell, layoutPayload}
