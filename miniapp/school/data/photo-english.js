// 人工对照用户提供的 2026-11-08 十张照片录入；照片中的文字只作为教材内容。
// aliases 是同一张词卡可接受的另一种形式，textbookForm 保留原图的并列写法。
const word = (english, translation, aliases = [], note = '') => ({
  word: english, translation, aliases, note,
  textbookForm: [english].concat(aliases).join(' / ')
})

module.exports = [
  {
    id: 'unit-1', label: 'Unit 1', title: 'A day on the farm', name: '农场的一天', mark: '田', photoNumber: 9,
    note: '先认识农场的景物，再练一练早晨会做的事。leaf 是一片树叶，leaves 是它的复数。',
    words: [
      word('field', '田地'), word('forest', '森林'), word('grass', '草地'), word('ground', '土地'), word('lake', '湖泊'),
      word('leaf', '树叶', ['leaves']), word('mountain', '山'), word('river', '河流'), word('rock', '岩石'), word('tractor', '拖拉机'),
      word('get dressed', '穿衣服'), word('get up', '起床'), word('have a shower', '洗澡', ['take a shower']), word('have breakfast', '吃早饭'),
      word('toothbrush', '牙刷'), word('toothpaste', '牙膏'), word('towel', '毛巾'), word('wake up', '醒来')
    ]
  },
  {
    id: 'unit-2', label: 'Unit 2', title: 'My week', name: '我的一周', mark: '周', photoNumber: 10,
    note: '星期的英文首字母通常大写。课本里的 comic / comic book、film / movie 两种说法都可以练。',
    words: [
      word('Monday', '星期一'), word('Tuesday', '星期二'), word('Wednesday', '星期三'), word('Thursday', '星期四'),
      word('Friday', '星期五'), word('Saturday', '星期六'), word('Sunday', '星期日'), word('go shopping', '去购物'), word('go skating', '去滑冰'),
      word('listen to a CD', '听光盘'), word('listen to music', '听音乐'), word('read a comic', '读漫画', ['read a comic book']),
      word('watch a DVD', '看数字影碟'), word('watch a film', '看电影', ['watch a movie']), word('write an email', '写邮件')
    ]
  },
  {
    id: 'unit-3', label: 'Unit 3', title: 'Party time!', name: '派对时间', mark: '派', photoNumber: 6,
    note: '认识职业和外貌。照片将 blonde / blond 和 fair / light 都解释为金黄色头发；这里将 fair / light 说明为浅色的头发，便于分清。',
    words: [
      word('clown', '小丑'), word('cook', '厨师'), word('dentist', '牙医'), word('doctor', '医生'), word('farmer', '农民'),
      word('film star', '电影明星', ['movie star']), word('nurse', '护士'), word('pirate', '海盗'), word('pop star', '歌星'), word('present', '礼物'),
      word('treasure', '珠宝；宝藏'), word('beard', '胡须（下巴上的）'), word('blonde', '金黄色的（头发）', ['blond']), word('curly', '卷曲的（头发）'),
      word('fair', '浅色的（头发）', ['light']), word('fat', '胖的'), word('short', '矮的'), word('straight', '直的（头发）'),
      word('tall', '高的'), word('thin', '瘦的'), word('moustache', '胡子（上唇的）', ['mustache'])
    ]
  },
  {
    id: 'unit-4', label: 'Unit 4', title: 'The family at home', name: '家里的家人', mark: '家', photoNumber: 7,
    note: '英式从 ground floor 数起，美式从 first floor 数起。同一层的英美说法都接受：地面层 ground / first，一层之上 first / second，再上一层 second / third。',
    words: [
      word('aunt', '阿姨；姑妈；婶婶'), word('cousin', '表亲；堂亲'), word('daughter', '女儿'), word('granddaughter', '孙女；外孙女'), word('son', '儿子'),
      word('grandparents', '祖父母；外祖父母'), word('grandson', '孙子；外孙子'), word('parents', '父母'), word('uncle', '叔叔；伯伯；舅舅'), word('balcony', '阳台'),
      word('basement', '地下室'), word('downstairs', '楼下'), word('ground floor', '地面层（一楼）', ['first floor']),
      word('first floor', '地面层往上一层（二楼）', ['second floor']), word('second floor', '地面层往上两层（三楼）', ['third floor']),
      word('inside', '在里面'), word('lift', '电梯', ['elevator']), word('outside', '在外面'), word('roof', '楼顶'), word('stairs', '楼梯'), word('upstairs', '楼上')
    ]
  },
  {
    id: 'unit-5', label: 'Unit 5', title: 'Animal world', name: '动物世界', mark: '兽', photoNumber: 5,
    note: '一半是动物名字，一半是动作。先听一听，再试着把英文和中文连起来。',
    words: [
      word('bat', '蝙蝠'), word('bear', '熊'), word('cage', '笼子'), word('dolphin', '海豚'), word('kangaroo', '袋鼠'),
      word('lion', '狮子'), word('panda', '熊猫'), word('parrot', '鹦鹉'), word('penguin', '企鹅'), word('rabbit', '兔子'),
      word('whale', '鲸鱼'), word('climb', '爬'), word('fall', '跌倒'), word('fly', '飞'), word('hide', '躲藏'),
      word('jump', '跳'), word('lose', '丢失'), word('move', '移动'), word('run', '跑'), word('walk', '走')
    ]
  },
  {
    id: 'unit-6', label: 'Unit 6', title: 'Our world', name: '天气与穿衣', mark: '晴', photoNumber: 8,
    note: '照片把 cloud 写成“多云”、windy 写成“风”。cloud 是“云”，多云用 cloudy；windy 是“有风的”。词卡采用这两个词本身的意思。',
    words: [
      word('cloud', '云', [], 'cloud 是名词“云”；“多云的”是 cloudy。'), word('cold', '冷的'), word('hot', '热的'), word('rain', '雨'), word('rainbow', '彩虹'),
      word('snow', '雪'), word('sunny', '晴朗的'), word('windy', '有风的', [], 'wind 是“风”，windy 是“有风的”。'), word('boots', '靴子'), word('coat', '外套'),
      word('put on', '穿上'), word('scarf', '围巾'), word('shorts', '短裤'), word('sweater', '毛衣'), word('T-shirt', 'T恤'), word('take off', '脱掉')
    ]
  },
  {
    id: 'unit-7', label: 'Unit 7', title: "Let's cook!", name: '一起做饭', mark: '厨', photoNumber: 1,
    note: '认一认食物和餐具，再练一练厨房里的动作。cook 在这里是动词“煮饭”，Unit 3 里是名词“厨师”。',
    words: [
      word('bottle', '瓶子'), word('bowl', '碗'), word('cheese', '奶酪'), word('cup', '茶杯'), word('glass', '玻璃杯'),
      word('pasta', '意大利面'), word('plate', '盘子'), word('salad', '沙拉'), word('sandwich', '三明治'), word('soup', '汤'),
      word('vegetables', '蔬菜'), word('boil', '煮沸；用水煮'), word('carry', '拿；搬运'), word('cook', '煮饭'), word('cry', '哭'),
      word('cut', '切'), word('drop', '掉落'), word('fry', '煎；炸'), word('wash', '洗')
    ]
  },
  {
    id: 'unit-8', label: 'Unit 8', title: 'Around town', name: '逛逛小镇', mark: '镇', photoNumber: 2,
    note: '许多地方就在我们的小镇里。照片的 ride 配摩天轮图；ride 在这里指游乐设施，摩天轮本身叫 Ferris wheel。英美拼写和课本并列说法都可作答。',
    words: [
      word('car park', '停车场', ['parking lot']), word('city centre', '市中心', ['city center']), word('funfair', '游乐园', ['amusement park']),
      word('map', '地图'), word('ride', '游乐设施（图中是摩天轮）'), word('road', '道路'), word('station', '车站'), word('ticket', '车票'), word('trip', '旅行；一次出游'),
      word('bus station', '公交站'), word('cafe', '咖啡店'), word('cinema', '电影院', ['movie theater']), word('hospital', '医院'), word('library', '图书馆'), word('market', '菜市场'),
      word('shopping center', '购物中心', ['shopping centre']), word('sports center', '运动中心', ['sports centre']), word('square', '广场'), word('supermarket', '超市'), word('swimming pool', '游泳池')
    ]
  },
  {
    id: 'unit-9', label: 'Unit 9', title: 'A big change', name: '大大的变化', mark: '变', photoNumber: 4,
    note: '分清感受和事物的特点：boring 是“令人无聊的”，exciting 是“令人兴奋的”；害怕可以用 afraid 或 frightened。',
    words: [
      word('afraid', '害怕的', ['frightened']), word('boring', '无聊的；令人无聊的'), word('dangerous', '危险的'), word('difficult', '困难的'), word('easy', '容易的'),
      word('exciting', '令人兴奋的'), word('frightened', '受惊吓的', ['afraid']), word('hungry', '饥饿的'), word('thirsty', '口渴的'), word('tired', '累的'),
      word('surprised', '惊讶的；惊喜的'), word('adventure', '冒险'), word('busy', '忙碌的'), word('email', '邮件'), word('round', '转圈；围绕', ['around']),
      word('travel', '旅行'), word('world', '世界'), word('text', '文本；文字')
    ]
  },
  {
    id: 'kangaroo-story', label: 'Story', title: 'Mummy kangaroo & Joey', name: '袋鼠故事 · 核心词汇', mark: '袋', photoNumber: 3,
    note: '这张照片包含故事的核心词汇及部分画面，这里只整理照片中能看到的词汇。joey 指袋鼠宝宝，pouch 是育儿袋。',
    words: [
      word('mummy kangaroo', '袋鼠妈妈'), word('joey', '袋鼠宝宝'), word('wombat', '袋熊'), word('blind', '失明的'), word('kind', '善良的'), word('hold my tail', '抓住我的尾巴'), word('river', '河流'),
      word('grass', '草地'), word('goodbye', '再见'), word('asleep', '睡着的'), word('tree', '树'), word('pouch', '育儿袋'), word('present', '礼物'), word('carry', '携带')
    ]
  }
]
