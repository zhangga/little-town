const categories = [{ id: 'all', name: '全部家具' }, { id: 'living', name: '客厅' }, { id: 'bedroom', name: '卧室' }, { id: 'study', name: '书房' }, { id: 'dining', name: '餐厨' }, { id: 'bathroom', name: '卫浴' }, { id: 'leisure', name: '娱乐' }]
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
  kitchen: { verb: '做点心', text: '搅一搅面糊，烤一份香香的小点心。', pose: 'cook' },
  bathtub: { verb: '泡个澡', text: '咕噜咕噜，洗掉一整天的疲倦。', pose: 'bath' },
  vanity: { verb: '洗洗手', text: '搓搓手心和手背，清清爽爽。', pose: 'wash' },
  toilet: { verb: '整理卫生间', text: '打扫干净，家里的每个角落都整整齐齐。', pose: 'clean' },
  piano: { verb: '弹一段琴', text: '小手在黑白琴键上跳舞。', pose: 'play' },
  arcade: { verb: '玩一会儿街机', text: '方块跳过小障碍，今天也过关啦！', pose: 'play' },
  aquarium: { verb: '看看小鱼', text: '小鱼穿过水草，安静的家也有小小的热闹。', pose: 'watch' },
  fireplace: { verb: '点亮壁炉', text: '暖暖的炉光，让大别墅也像小木屋一样舒服。', pose: 'stand' },
  pool: { verb: '玩一会儿水', text: '扑通，小泳池里荡起了水花。', pose: 'swim' },
  treadmill: { verb: '慢跑一下', text: '一步两步，今天也动起来啦。', pose: 'run' },
  pooltable: { verb: '打一杆台球', text: '瞄准，小球沿着绿色桌面轻轻滚动。', pose: 'play' },
  sectional: { verb: '靠在大沙发上', text: '转角这里最舒服，可以看很久的书。', pose: 'sit' },
  rug: { verb: '伸个懒腰', text: '在软软的地毯上伸展一下，真舒服。', pose: 'stretch' }
}
function presentFurniture(items, wallet, layout = []) {
  return (items || []).map(item => Object.assign({}, item, {
    image: '/home/images/' + item.id + '.png', action: actions[item.id],
    placed: layout.some(p => p.id === item.id), affordable: wallet.coins >= item.price, missing: Math.max(0, item.price - wallet.coins)
  }))
}
module.exports = { categories, nature, actions, presentFurniture }
