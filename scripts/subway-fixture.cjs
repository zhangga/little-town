// Offline preview only. Production always uses the authenticated Go service.
function createSubwayFixture(options = {}) {
  const clone = value => JSON.parse(JSON.stringify(value))
  const catalog = [
    { id: 'coins', name: '小镇金币 ×10', description: '可在小镇商场购买家具、食物和装扮', price: 50, kind: 'exchange', color: '#ffc545' },
    { id: 'bricks', name: '建造砖块 ×1', description: '兑换后直接进入小镇建造钱包', price: 100, kind: 'exchange', color: '#ff845e' },
    { id: 'mint', name: '薄荷巡航', description: '经典滑板 · 每次启动可抵挡一次碰撞', price: 0, kind: 'skin', color: '#25dfbd' },
    { id: 'sunset', name: '落日涂鸦', description: '橙红板面与金色尾焰 · 永久拥有', price: 120, kind: 'skin', color: '#ff7048' },
    { id: 'aurora', name: '极光电流', description: '蓝色电光板面与冰蓝尾焰 · 永久拥有', price: 180, kind: 'skin', color: '#49b9ff' }
  ]
  const state = options.saved || { tokens: options.tokens || 0, best: 0, equipped: 'mint', earned_today: 0, daily_cap: 1000, wallet: { coins: 100, bricks: 15 }, skins: ['mint'], starts: {}, runs: {}, purchases: {} }
  const save = () => { if (options.save) options.save(clone(state)) }
  const reject = message => { throw Object.assign(Error(message), { statusCode: 400 }) }
  const view = run => clone({ tokens: state.tokens, best: state.best, equipped: state.equipped, earned_today: state.earned_today, daily_cap: state.daily_cap, wallet: state.wallet, items: catalog.map(item => ({ ...item, owned: state.skins.includes(item.id), equipped: state.equipped === item.id })), ...(run ? { run } : {}) })
  return {
    state,
    async get(url) {
      if (url === '/buildings/my-town') return { buildings: options.locked ? [] : [{ name: '地铁站' }] }
      if (url === '/subway') return view()
      throw Error('Unexpected fixture GET: ' + url)
    },
    async post(url, body) {
      let run
      if (url === '/subway/start') {
        const id = state.starts[body.request_id] || 'demo-' + (Object.keys(state.runs).length + 1)
        if (!state.starts[body.request_id]) {
          Object.values(state.runs).filter(r => r.status === 'active').forEach(r => { r.status = 'abandoned' })
          state.starts[body.request_id] = id; state.runs[id] = { run_id: id, status: 'active', awarded: 0 }
        }
        run = state.runs[id]
      } else if (url === '/subway/finish') {
        run = state.runs[body.run_id]
        if (!run || run.status === 'abandoned') reject('这程已失效')
        if (run.status === 'active') {
          Object.assign(run, body, { status: 'finished', awarded: Math.max(0, Math.min(500, body.coins + body.stars * 5, 1000 - state.earned_today)) })
          state.tokens += run.awarded; state.earned_today += run.awarded
          state.best = Math.max(state.best, body.distance + body.coins * 5 + body.stars * 50)
        }
      } else if (url === '/subway/purchase') {
        if (state.purchases[body.request_id] && state.purchases[body.request_id] !== body.item_id) reject('请求已变化')
        if (!state.purchases[body.request_id]) {
          const item = catalog.find(i => i.id === body.item_id)
          if (!item) reject('商品不存在')
          const price = state.skins.includes(item.id) ? 0 : item.price
          if (state.tokens < price) reject('星光币还不够，再跑一程吧')
          state.tokens -= price
          if (item.id === 'coins') state.wallet.coins += 10
          else if (item.id === 'bricks') state.wallet.bricks++
          else { if (!state.skins.includes(item.id)) state.skins.push(item.id); state.equipped = item.id }
          state.purchases[body.request_id] = body.item_id
        }
      } else if (url === '/subway/equip') {
        if (!state.skins.includes(body.item_id)) reject('未拥有该滑板')
        state.equipped = body.item_id
      } else throw Error('Unexpected fixture POST: ' + url)
      save(); return view(run)
    }
  }
}
module.exports = { createSubwayFixture }
