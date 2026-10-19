const { strollArt } = require('./stroll-art')

const buildingLife = {
  '医院': '建成后解锁居民感冒，呼叫小镇医生只需 1 金币。',
  '消防站': '建成后解锁小火情，模拟拨打消防电话只需 1 金币。',
  '宠物医院': '同时拥有宠物后才会出现宠物生病，看宠物医生只需 1 金币。',
  '警察局': '建成后可以帮邻居找失物，联系小镇警员只需 1 金币。',
  '公园': '建成后可以和邻居赏花散步。',
  '商店': '点击购买面包和水，补充饱食度和水分。',
  '餐厅': '点击购买热饭套餐，也可以参加邻里聚餐。',
  '图书馆': '建成后可以一起听窗边的故事。',
  '学校': '建成后可以在放学时和孩子们打招呼。',
  '电影院': '建成后可以和邻居一起逛逛电影夜。',
  '体育馆': '建成后可以和邻居一起传球。'
}

function presentLife(state) {
  const coins = state.wallet.coins
  const needs = Object.assign({ enabled: false, food: 100, water: 100 }, state.needs)
  needs.hungry = needs.enabled && needs.food <= 35
  needs.thirsty = needs.enabled && needs.water <= 35
  needs.caption = needs.hungry && needs.thirsty ? '肚子饿了，也想喝点水' : needs.hungry ? '肚子咕咕叫，去买点吃的吧' : needs.thirsty ? '有点渴了，去喝点水吧' : '吃好喝好，慢慢逛小镇'
  const supplies = (state.supplies || []).map(item => Object.assign({}, item, {
    affordable: coins >= item.price, missing: Math.max(0, item.price - coins),
    needed: !!needs.enabled && ((item.food > 0 && needs.food < 100) || (item.water > 0 && needs.water < 100)),
    effect: (item.food ? '饱食 +' + item.food : '') + (item.food && item.water ? ' · ' : '') + (item.water ? '水分 +' + item.water : ''),
    consume: item.water && !item.food ? '买来喝' : '买来吃'
  }))
  const pets = state.pets.map(pet => Object.assign({}, pet, {
    art: strollArt({ type: 'pet', petId: pet.id }, 'down'),
    affordable: coins >= pet.price,
    missing: Math.max(0, pet.price - coins)
  }))
  return Object.assign({}, state, {
    needs, supplies,
    pets,
    companions: pets.filter(pet => pet.owned),
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
    description: activities.length ? activities[hour % activities.length] : evening ? '小屋亮起暖灯，晚风轻轻吹过门口。' : '阳光照进小院，邻居在路边向你挥手。'
  }
}

module.exports = { presentLife, townScene, buildingLife }
