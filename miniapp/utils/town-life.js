const { residentArt } = require('./resident')

const buildingLife = {
  '医院': '建成后解锁居民感冒，呼叫小镇医生只需 1 金币。',
  '消防站': '建成后解锁小火情，模拟拨打消防电话只需 1 金币。',
  '宠物医院': '同时拥有宠物后才会出现宠物生病，看宠物医生只需 1 金币。',
  '警察局': '建成后可以帮邻居找失物，联系小镇警员只需 1 金币。',
  '公园': '建成后可以和邻居赏花散步。',
  '商店': '建成后可以帮店主给邻居送面包。',
  '餐厅': '建成后可以和邻居一起准备聚餐。',
  '图书馆': '建成后可以一起听窗边的故事。',
  '学校': '建成后可以在放学时和孩子们打招呼。',
  '电影院': '建成后可以和邻居一起逛逛电影夜。',
  '体育馆': '建成后可以和邻居一起传球。'
}

function presentLife(state) {
  const coins = state.wallet.coins
  return Object.assign({}, state, {
    pets: state.pets.map(pet => Object.assign({}, pet, { affordable: coins >= pet.price, missing: Math.max(0, pet.price - coins) })),
    companions: state.pets.filter(pet => pet.owned),
    petResting: !!state.event && state.event.kind === 'pet_sick',
    event: state.event ? Object.assign({}, state.event, { affordable: coins >= state.event.cost }) : null,
    hasVet: state.buildings.includes('宠物医院')
  })
}

function townScene(buildings, hour) {
  const has = name => buildings.includes(name)
  const evening = hour >= 18 || hour < 6
  const activities = [
    has('学校') ? '孩子们背着书包，从学校一路聊回家。' : '',
    has('商店') ? '店主摆好了面包，门口飘来暖暖的香气。' : '',
    has('公园') ? '邻居在公园散步，小鸟落在树梢上。' : '',
    has('餐厅') ? '餐厅的锅咕嘟咕嘟，正准备一顿热饭。' : '',
    has('图书馆') ? '图书馆翻过一页书，窗边又多了一个故事。' : '',
    has('电影院') && evening ? '影院门口的灯亮了，邻居结伴去看海报。' : ''
  ].filter(Boolean)
  return {
    evening, icon: evening ? '🌙' : hour < 11 ? '🌤️' : '☀️',
    label: evening ? '小镇的灯亮起来了' : hour < 11 ? '小镇醒来啦' : '小镇的悠闲午后',
    description: activities.length ? activities[hour % activities.length] : evening ? '小屋亮起暖灯，晚风轻轻吹过门口。' : '阳光照进小院，邻居在路边向你挥手。',
    walkers: [residentArt('everyday', 2), residentArt('gardener', 2)]
  }
}

module.exports = { presentLife, townScene, buildingLife }
