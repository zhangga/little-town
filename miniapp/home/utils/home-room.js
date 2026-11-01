const { strollArt } = require('../../utils/stroll-art')
const SIZE = 7
const ENTRY = { x: 3, y: 6 }
const categories = [{ id: 'all', name: '全部家具' }, { id: 'living', name: '客厅' }, { id: 'bedroom', name: '卧室' }, { id: 'study', name: '书房' }, { id: 'dining', name: '餐厨' }]
const nature = [{ id: 'forest', name: '林间的小路', caption: '阳光穿过树叶，沿着小路慢慢走。' }, { id: 'sea', name: '安静的海边', caption: '浪花轻轻拍着沙滩，远处是一片蓝。' }, { id: 'mountain', name: '雪山与湖泊', caption: '山尖戴着白帽子，湖水映着天空。' }].map(item => Object.assign({}, item, { image: '/home/images/' + item.id + '.png' }))
const actions = {
  chair: { verb: '坐一坐', text: '歇歇脚，今天的家也很舒服。', pose: 'sit' },
  sofa: { verb: '坐上沙发', text: '靠着软软的抱枕，放松一下。', pose: 'sit' },
  bed: { verb: '躺下休息', text: '呼噜呼噜…做一个云朵一样的梦。', pose: 'sleep' },
  tv: { verb: '打开电视', text: '今天想看森林、大海，还是雪山？', pose: 'watch' },
  lamp: { verb: '开灯 / 关灯', text: '一盏暖暖的小灯。', pose: 'stand' },
  plant: { verb: '给花浇水', text: '滴答滴答，叶子喝饱水啦！', pose: 'water' },
  desk: { verb: '画一幅画', text: '画好啦！一间小屋，一棵树，还有今天的太阳。', pose: 'draw' },
  bookshelf: { verb: '读一本书', text: '小松鼠沿着森林小路，找到一颗金色的松果。', pose: 'read' },
  wardrobe: { verb: '整理衣柜', text: '衣服挂得整整齐齐，去衣橱挑一套吧。', pose: 'tidy' },
  table: { verb: '喝下午茶', text: '摆好茶杯，和想象中的朋友一起喝杯茶。', pose: 'tea' },
  fridge: { verb: '打开冰箱', text: '苹果、牛奶、果汁，都整整齐齐放好啦。', pose: 'open' },
  rug: { verb: '伸个懒腰', text: '在软软的地毯上伸展一下，真舒服。', pose: 'stretch' }
}
function project(x, y) { return { left: (350 + (x - y) * 40) / 7, top: 210 + (x + y) * 22 } }
function dimensions(item, rotation) { return rotation ? { w: item.depth || 1, d: item.width || 1 } : { w: item.width || 1, d: item.depth || 1 } }
function footprint(p, catalog) {
  const item = catalog.find(item => item.id === p.id)
  if (!item) return []
  const { w, d } = dimensions(item, p.rotation)
  const cells = []
  for (let x = p.x; x < p.x + w; x++) for (let y = p.y; y < p.y + d; y++) cells.push({ x, y })
  return cells
}
const key = p => p.x + ',' + p.y
const inside = p => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < SIZE && p.y >= 0 && p.y < SIZE
function blockedCells(layout, catalog, ignoreID, walk = false) {
  const cells = new Set()
  layout.filter(p => p.id !== ignoreID && (!walk || p.id !== 'rug')).forEach(p => footprint(p, catalog).forEach(c => cells.add(key(c))))
  return cells
}
function canPlace(layout, catalog, placement) {
  const item = catalog.find(item => item.id === placement.id && item.owned)
  if (!item || ![0, 1].includes(placement.rotation)) return false
  const blocked = blockedCells(layout, catalog, placement.id)
  return footprint(placement, catalog).every(p => inside(p) && key(p) !== key(ENTRY) && !blocked.has(key(p)))
}
function pathTo(start, target, layout, catalog) {
  if (!inside(start) || !inside(target)) return null
  const blocked = blockedCells(layout, catalog, null, true)
  if (blocked.has(key(target))) return null
  const queue = [{ p: start, path: [] }], seen = new Set([key(start)])
  while (queue.length) {
    const { p, path } = queue.shift()
    if (key(p) === key(target)) return path
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const next = { x: p.x + dx, y: p.y + dy }
      if (inside(next) && !seen.has(key(next)) && !blocked.has(key(next))) {
        seen.add(key(next)); queue.push({ p: next, path: path.concat(next) })
      }
    }
  }
  return null
}
function approach(start, placed, layout, catalog) {
  const targets = footprint(placed, catalog).flatMap(p => [{ x: p.x - 1, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y - 1 }, { x: p.x, y: p.y + 1 }])
  if (placed.id === 'rug') targets.push({ x: placed.x, y: placed.y })
  return targets.map(p => pathTo(start, p, layout, catalog)).filter(p => p !== null).sort((a, b) => a.length - b.length)[0] || null
}
function presentFurniture(items, wallet, layout = []) {
  return (items || []).map(item => Object.assign({}, item, {
    image: '/home/images/' + item.id + '.png', action: actions[item.id],
    placed: layout.some(p => p.id === item.id), affordable: wallet.coins >= item.price, missing: Math.max(0, item.price - wallet.coins)
  }))
}
function roomView(layout, catalog, selectedID = '', rotation = 0) {
  const furniture = layout.map(p => {
    const item = catalog.find(item => item.id === p.id)
    const { w, d } = dimensions(item || {}, p.rotation)
    return Object.assign({}, item, p, project(p.x + (w - 1) / 2, p.y + (d - 1) / 2), { z: (p.x + p.y + w + d - 2) * 10 + 20, wide: w + d > 2 })
  })
  const cells = []
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) cells.push(Object.assign({ id: x + '-' + y, x, y, valid: !!selectedID && canPlace(layout, catalog, { id: selectedID, x, y, rotation }) }, project(x, y)))
  return { roomFurniture: furniture, roomCells: cells }
}
function actorView(p, outfit, direction = 'down', moving = false, pose = '') {
  return Object.assign({}, p, project(p.x, p.y), { z: (p.x + p.y) * 10 + 25, direction, moving, pose, art: strollArt({ outfit }, direction) })
}
module.exports = { SIZE, ENTRY, categories, nature, actions, project, dimensions, footprint, blockedCells, canPlace, pathTo, approach, presentFurniture, roomView, actorView }
