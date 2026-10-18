const { strollArt } = require('./stroll-art')

// 与首页的 272rpx 地块 + 72rpx 行间距一致，脚下路线位于名称牌下方。
const ROW_STEP = 344
const LANE_Y = 322
const MAP_WIDTH = 750
const visits = {
  '我的家': '歇一会儿', '学校': '打个招呼', '商店': '买点面包',
  '医院': '问声好', '宠物医院': '看看伙伴', '公园': '看看花儿',
  '餐厅': '闻到饭香啦', '电影院': '看看海报', '图书馆': '找本好书',
  '警察局': '你好呀', '消防站': '辛苦啦', '体育馆': '活动一下'
}

function walkingMap(plots, withHome) {
  const slots = withHome ? [{ occupied: true, name: '我的家' }].concat(plots) : plots
  const rows = Math.max(2, Math.ceil(slots.length / 3))
  const stops = slots.reduce((result, plot, index) => {
    if (plot.occupied) result.push({ name: plot.name, x: (index % 3 + .5) * 100 / 3, y: Math.floor(index / 3) * ROW_STEP + LANE_Y })
    return result
  }, [])
  // 尚未建起邻里时，也可以去草坪另一边逛逛。
  if (stops.length < 2) {
    stops.push({ name: '花丛', x: 100 / 6, y: (rows - 1) * ROW_STEP + LANE_Y })
    stops.push({ name: '草地', x: 500 / 6, y: LANE_Y })
  }
  return { height: rows * ROW_STEP, stops }
}

function routeBetween(from, to, lane = 100 / 3) {
  // 横向走行间草地，纵向走列间空隙，不斜穿建筑。
  const points = from.y === to.y ? [to] : [{ x: lane, y: from.y }, { x: lane, y: to.y }, to]
  let previous = from
  return points.filter(point => {
    const distinct = Math.abs(point.x - previous.x) > .01 || point.y !== previous.y
    previous = point
    return distinct
  }).map(point => ({ x: point.x, y: point.y }))
}

function stepDirection(dx, dy, previous = 'down') {
  if (Math.abs(dx) < .1 && Math.abs(dy) < .1) return previous
  if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? 'down' : 'up'
  return dx > 0 ? 'right' : 'left'
}

function strollingActors(growth, life) {
  const people = []
  if (growth && !(life && life.event && life.event.kind === 'resident_sick')) {
    people.push({ id: 'town-host', outfit: growth.resident.outfit_id || 'everyday', isHost: true, speed: 27 })
  }
  // 邻居使用独立身份和图集，不会与小镇长可购买的四套服装重复。
  people.push(
    { id: 'neighbor-grandpa', villager: 'grandpa', speed: 21 },
    { id: 'neighbor-grandma', villager: 'grandma', speed: 23 },
    { id: 'neighbor-adult', villager: 'adult', speed: 31 },
    { id: 'neighbor-child', villager: 'child', speed: 37 }
  )
  const actors = people.map(person => Object.assign({ type: 'person' }, person))
  if (life && !life.petResting) life.companions.forEach((pet, index) => actors.push({
    id: 'pet-' + pet.id, petId: pet.id, type: 'pet', speed: 39 + index * 5,
    icon: pet.id === 'dog' ? '🐕' : pet.id === 'cat' ? '🐈' : pet.icon
  }))
  return actors
}

// 只在拐弯和停留时更新位置，逐帧移动由 WXSS transition 完成。
function createStroll(onChange, clock = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer)
}, random = Math.random) {
  let actors = [], map = null, signature = '', running = false, disposed = false
  const timers = new Set()
  const emit = () => {
    if (!disposed) onChange(actors.map(actor => ({
      id: actor.id, type: actor.type, icon: actor.icon || '',
      isHost: !!actor.isHost,
      art: strollArt(actor, actor.direction),
      x: actor.x, y: actor.y, direction: actor.direction, moving: actor.moving,
      duration: actor.duration, bubble: actor.bubble
    })))
  }
  function later(actor, delay) {
    if (!running || disposed) return
    const timer = clock.setTimeout(() => {
      timers.delete(timer)
      if (running && !disposed) advance(actor)
    }, delay)
    timers.add(timer)
  }
  function advance(actor) {
    if (!actor.route.length && actor.moving) {
      actor.moving = false
      actor.duration = 0
      actor.bubble = actor.type === 'pet' ? actor.icon === '🐈' ? '喵～' : '闻闻花香' : visits[actor.destination.name] || '晒晒太阳'
      emit()
      later(actor, 1800 + random() * 2400)
      return
    }
    if (!actor.route.length) {
      let choices = map.stops.filter(stop => stop.x !== actor.destination.x || stop.y !== actor.destination.y)
      const otherRows = choices.filter(stop => stop.y !== actor.y)
      if (otherRows.length && random() < .7) choices = otherRows
      actor.destination = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
      actor.route = routeBetween(actor, actor.destination, random() < .5 ? 100 / 3 : 200 / 3)
    }
    const point = actor.route.shift()
    const dx = (point.x - actor.x) * MAP_WIDTH / 100, dy = point.y - actor.y
    actor.duration = Math.max(650, Math.round(Math.hypot(dx, dy) / actor.speed * 1000))
    actor.direction = stepDirection(dx, dy, actor.direction)
    actor.x = point.x
    actor.y = point.y
    actor.moving = true
    actor.bubble = ''
    emit()
    later(actor, actor.duration)
  }
  function stop() {
    running = false
    timers.forEach(timer => clock.clearTimeout(timer))
    timers.clear()
  }
  function start() {
    if (running || disposed) return
    running = true
    actors.forEach((actor, index) => later(actor, 500 + index * 700))
  }
  return {
    sync(nextMap, nextActors) {
      if (disposed) return
      const nextSignature = JSON.stringify([nextMap, nextActors])
      if (nextSignature === signature) return
      const resume = running
      stop()
      signature = nextSignature
      map = nextMap
      const startingStops = nextActors.map((actor, index) => map.stops[Math.floor(index * map.stops.length / nextActors.length)])
      actors = nextActors.map((actor, index) => {
        const destination = startingStops[index]
        const neighbors = startingStops.filter(stop => stop === destination).length
        const order = startingStops.slice(0, index).filter(stop => stop === destination).length
        // 地点较少时也分开站在同一条草地通道，避免新村民遮住小镇长。
        const x = Math.max(5, Math.min(95, destination.x + (order - (neighbors - 1) / 2) * 8))
        return Object.assign({}, actor, destination, { x, destination, route: [], moving: false, duration: 0, direction: 'down', bubble: '' })
      })
      emit()
      if (resume) start()
    },
    start, stop,
    destroy() { stop(); disposed = true; actors = [] }
  }
}

module.exports = { walkingMap, strollingActors, routeBetween, stepDirection, createStroll }
