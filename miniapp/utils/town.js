const { townSprite } = require('./assets')
const { buildingLife } = require('./town-life')

function describeBuilding(item, user) {
  const cost = Math.max(0, Number(item.cost_bricks) || 0)
  const bricks = Math.max(0, Number(user.bricks) || 0)
  const built = !!item.is_built
  const missing = Math.max(0, cost - bricks)
  // 解锁由接口决定；当前版本按砖块开放，不展示尚未实现的等级门槛。
  const ready = !built && !!item.can_build && missing === 0
  return Object.assign({}, item, {
    sprite: townSprite(item.name), lifeHint: buildingLife[item.name] || '', cost_bricks: cost,
    is_built: built, can_build: ready, missing,
    progress: cost ? Math.min(100, Math.floor(bricks / cost * 100)) : 100,
    materialCount: Math.min(bricks, cost),
    status: built ? '已落成' : ready ? '可以建造' : missing ? '还差 ' + missing + ' 砖' : '暂未开放'
  })
}

function catalogState(raw, user, filter, selectedID) {
  const buildings = raw.map(item => describeBuilding(item, user))
    .sort((a, b) => a.cost_bricks - b.cost_bricks || a.id - b.id)
  const ready = buildings.filter(item => item.can_build)
  const built = buildings.filter(item => item.is_built)
  return {
    buildings,
    visibleBuildings: filter === 'ready' ? ready : filter === 'built' ? built : buildings,
    builtCount: built.length, readyCount: ready.length,
    recommended: ready[0] || buildings.find(item => !item.is_built) || null,
    selected: buildings.find(item => item.id === selectedID) || null
  }
}

function townPlots(raw, recentName, withHome) {
  const buildings = raw.map((item, index) => Object.assign({}, item, {
    sprite: townSprite(item.name), lifeHint: buildingLife[item.name] || '', builtDate: String(item.built_at || '').slice(0, 10),
    isNew: item.name === recentName, delay: Math.min(index, 5) * 60
  }))
  // 旧数据的第四列会超出屏幕；展示统一使用三列，不改动已存建筑位置。
  const homeCount = withHome ? 1 : 0
  const count = Math.max(6, Math.ceil((buildings.length + 1 + homeCount) / 3) * 3) - homeCount
  const plots = buildings.map(item => Object.assign({ occupied: true }, item))
  while (plots.length < count) {
    plots.push({ id: 'empty-' + plots.length, occupied: false, next: plots.length === buildings.length, sprite: townSprite('空地') })
  }
  // 草地按完整纹理块铺满地图，地图变长时也不会露出背景或拉伸花朵。
  const rows = Math.ceil((plots.length + homeCount) / 3)
  const meadowTiles = Array.from({ length: Math.ceil((rows * 300 + 160) / 720) }, (_, index) => ({ id: 'meadow-' + index }))
  return { buildings, plots, meadowTiles }
}

module.exports = { describeBuilding, catalogState, townPlots }
