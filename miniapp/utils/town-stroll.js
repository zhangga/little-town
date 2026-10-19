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
  const actors = people.map(person => Object.assign({ type: 'person', visitor: !person.isHost }, person))
  if (life && !life.petResting) life.companions.forEach((pet, index) => actors.push({
    id: 'pet-' + pet.id, petId: pet.id, type: 'pet', speed: 39 + index * 5,
    icon: pet.id === 'dog' ? '🐕' : pet.id === 'cat' ? '🐈' : pet.icon
  }))
  return actors
}

const visitorKinds = [
  { villager: 'grandpa', speed: 21, names: ['陈爷爷', '林爷爷', '周爷爷'] },
  { villager: 'grandma', speed: 23, names: ['刘奶奶', '何奶奶', '李奶奶'] },
  { villager: 'adult', speed: 31, names: ['小乔', '阿远', '小南', '阿青'] },
  { villager: 'child', speed: 37, names: ['小雨', '可可', '乐乐', '小满'] }
]

// 只在拐弯、停留和人员进出时更新；帧间移动由 WXSS transition 完成。
function createStroll(onChange, clock = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer)
}, random = Math.random) {
  let actors = [], map = null, signature = '', running = false, disposed = false, serial = 0, needs = null
  const visitPrefix = Date.now().toString(36)
  const timers = new Set()
  const pick = list => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
  const emit = () => {
    if (!disposed) onChange(actors.map(actor => ({
      id: actor.id, type: actor.type, icon: actor.icon || '',
      isHost: !!actor.isHost, villager: actor.villager || '', outfit: actor.outfit || '', petId: actor.petId || '',
      visitor: !!actor.visitor, name: actor.name || '', phase: actor.phase || 'resident',
      art: strollArt(actor, actor.direction),
      x: actor.x, y: actor.y, direction: actor.direction, moving: actor.moving,
      duration: actor.duration, bubble: actor.isHost && !actor.moving && needs && needs.enabled && (needs.food <= 35 || needs.water <= 35) ? (needs.water <= 35 ? '想喝点水 💧' : '肚子饿了 🥖') : actor.bubble
    })))
  }
  function cancel(actor) {
    if (actor.timer != null) { clock.clearTimeout(actor.timer); timers.delete(actor.timer); actor.timer = null }
  }
  function later(actor, delay) {
    cancel(actor)
    if (!running || disposed) return
    const timer = clock.setTimeout(() => {
      timers.delete(timer); actor.timer = null
      if (running && !disposed && actors.includes(actor)) advance(actor)
    }, delay)
    actor.timer = timer
    timers.add(timer)
  }
  function newVisitor(source, index, previousKind) {
    const kind = previousKind ? pick(visitorKinds.filter(kind => kind.villager !== previousKind)) : visitorKinds.find(kind => kind.villager === source.villager) || pick(visitorKinds)
    const id = ++serial
    const destination = pick(map.stops)
    const start = { x: id % 2 ? -10 : 110, y: (index % Math.min(2, Math.round(map.height / ROW_STEP))) * ROW_STEP + LANE_Y }
    return Object.assign({}, source, kind, start, {
      id: 'visitor-' + visitPrefix + '-' + id, sourceID: source.sourceID || source.id,
      name: kind.names[id % kind.names.length], destination,
      route: routeBetween(start, destination, id % 2 ? 100 / 3 : 200 / 3),
      moving: false, duration: 0, direction: start.x < 0 ? 'right' : 'left', bubble: '',
      phase: 'entering', visitsLeft: 2 + Math.floor(random() * 2),
      wait: previousKind ? 5000 + random() * 7000 : 500 + index * 6500, timer: null
    })
  }
  function advance(actor) {
    if (actor.requestedDestination) {
      actor.destination = actor.requestedDestination
      actor.requestedDestination = null
      actor.route = routeBetween(actor, actor.destination, random() < .5 ? 100 / 3 : 200 / 3)
      if (!actor.route.length) {
        actor.moving = false; actor.duration = 0; actor.bubble = visits[actor.destination.name] || '休息一会儿'
        emit(); later(actor, 4000); return
      }
    }
    if (!actor.route.length && actor.moving) {
      if (actor.phase === 'leaving') {
        const index = actors.indexOf(actor)
        const newcomer = newVisitor(actor, index, actor.villager)
        actors[index] = newcomer
        emit(); later(newcomer, newcomer.wait); return
      }
      actor.moving = false; actor.duration = 0
      const arriving = actor.phase === 'entering'
      if (actor.visitor) { actor.phase = 'visiting'; actor.visitsLeft-- }
      actor.bubble = arriving ? actor.name + '来逛逛' : actor.type === 'pet' ? actor.petId === 'cat' ? '喵～' : '闻闻花香' : visits[actor.destination.name] || '晒晒太阳'
      emit(); later(actor, 2200 + random() * 2400); return
    }
    if (!actor.route.length) {
      if (actor.visitor && actor.visitsLeft <= 0) {
        actor.phase = 'leaving'
        actor.route = [{ x: random() < .5 ? -10 : 110, y: actor.y }]
      } else {
        let choices = map.stops.filter(stop => stop.x !== actor.destination.x || stop.y !== actor.destination.y)
        const otherRows = choices.filter(stop => stop.y !== actor.y)
        if (otherRows.length && random() < .7) choices = otherRows
        actor.destination = pick(choices) || map.stops[0]
        actor.route = routeBetween(actor, actor.destination, random() < .5 ? 100 / 3 : 200 / 3)
      }
    }
    const point = actor.route.shift()
    if (!point) { later(actor, 3000); return }
    const dx = (point.x - actor.x) * MAP_WIDTH / 100, dy = point.y - actor.y
    actor.duration = Math.max(650, Math.round(Math.hypot(dx, dy) / actor.speed * 1000))
    actor.direction = stepDirection(dx, dy, actor.direction)
    actor.x = point.x; actor.y = point.y; actor.moving = true
    actor.bubble = actor.phase === 'leaving' ? '下次再逛别处啦' : ''
    emit(); later(actor, actor.duration)
  }
  function stop() {
    running = false
    actors.forEach(cancel)
    timers.forEach(timer => clock.clearTimeout(timer)); timers.clear()
  }
  function start() {
    if (running || disposed) return
    running = true
    actors.forEach((actor, index) => {
      later(actor, actor.wait || 500 + index * 700)
      actor.wait = 0
    })
  }
  return {
    sync(nextMap, nextActors) {
      if (disposed) return
      const nextSignature = JSON.stringify([nextMap, nextActors])
      if (nextSignature === signature) return
      const sameMap = JSON.stringify(map) === JSON.stringify(nextMap)
      const resume = running
      if (!sameMap) stop()
      signature = nextSignature; map = nextMap
      const previous = actors
      const residents = nextActors.filter(actor => !actor.visitor)
      actors = nextActors.map((actor, index) => {
        const existing = previous.find(old => (old.sourceID || old.id) === actor.id)
        if (existing && sameMap) return actor.visitor ? existing : Object.assign(existing, actor)
        if (actor.visitor) return newVisitor(actor, nextActors.filter(candidate => candidate.visitor).indexOf(actor))
        const residentIndex = residents.indexOf(actor)
        const destination = map.stops[Math.floor(residentIndex * map.stops.length / residents.length)]
        const x = Math.max(5, Math.min(95, destination.x + residentIndex * 3))
        return Object.assign({}, actor, destination, { x, destination, route: [], moving: false, duration: 0, direction: 'down', bubble: '', timer: null })
      })
      previous.filter(actor => !actors.includes(actor)).forEach(cancel)
      emit()
      if (!sameMap && resume) start()
      else if (running) actors.filter(actor => !previous.includes(actor)).forEach((actor, index) => later(actor, actor.wait || 500 + index * 700))
    },
    setNeeds(next) {
      if (JSON.stringify(needs) === JSON.stringify(next)) return
      needs = next; emit()
    },
    visitHost(name) {
      const actor = actors.find(actor => actor.isHost), destination = map && map.stops.find(stop => stop.name === name)
      if (!actor || !destination || disposed) return false
      actor.requestedDestination = destination
      if (!actor.moving && running) { cancel(actor); advance(actor) }
      return true
    },
    start, stop,
    destroy() { stop(); disposed = true; actors = [] }
  }
}

module.exports = { walkingMap, strollingActors, routeBetween, stepDirection, createStroll }
