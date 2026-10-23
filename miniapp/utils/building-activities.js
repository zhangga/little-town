// Local, replayable activities. Payment is handled by building-interior before creating a session.
// Every transition returns a fresh value so a hidden page can safely keep its last scene.
const pick = (id, label, icon) => ({ id, label, icon })
const turn = (prompt, answer, choices, hero, prop, caption, hint) => ({ prompt, answer, choices, hero, prop, caption, hint })
const colors = {
  cloud: '#d8effc', space: '#252b62', classroom: '#ffedc4', forest: '#d7eed6', ocean: '#c5edf5',
  market: '#ffead3', kitchen: '#fff0cb', garden: '#daf0d4', court: '#d4e9ef', clinic: '#e0f1ef', fire: '#ffe2d3', police: '#dce9fa'
}

const games = {
  cinema_cloud: {
    title: '云朵快递员', kind: 'movie', theme: 'cloud', icon: '☁️', duration: '约 22 秒', seconds: 22,
    description: '灯光暗下来啦！看小兔驾驶云朵车，给干渴的花园送来一场雨。',
    result: '小兔送到了第一场春雨。谢谢你陪它完成这趟云朵旅行！',
    frames: [
      { hero: '🐰', prop: '✉️', caption: '清晨，小兔收到一封信：“花园好渴呀，你能来吗？”', motion: 'bounce', sky: '#d8effc' },
      { hero: '🐰', prop: '☁️', caption: '它坐上软绵绵的云朵车，带着一袋小雨滴出发了。', motion: 'drive', sky: '#cce9ff' },
      { hero: '🐦', prop: '🌈', caption: '彩虹桥太高了，小鸟带着云朵车绕过了山峰。', motion: 'float', sky: '#e6dcfa' },
      { hero: '🐰', prop: '🌧️', caption: '到啦！小兔轻轻打开雨滴口袋，滴答，滴答。', motion: 'wave', sky: '#ccdae9' },
      { hero: '🌷', prop: '🦋', caption: '花儿伸了伸懒腰，蝴蝶跳起舞，花园又有颜色了。', motion: 'bounce', sky: '#e0f2d9' },
      { hero: '🐰', prop: '🌈', caption: '“谢谢你，云朵快递员！”小兔带着彩虹寄回了一封信。', motion: 'drive', sky: '#ffead4' }
    ]
  },
  cinema_space: {
    title: '月亮的晚安灯', kind: 'movie', theme: 'space', icon: '🚀', duration: '约 22 秒', seconds: 22,
    description: '跟小熊乘上纸火箭，去找一颗迷路的小星星。',
    result: '小星星回家了，月亮亮起晚安灯。今晚做一个甜甜的太空梦。',
    frames: [
      { hero: '🐻', prop: '⭐', caption: '窗台上，一颗小星星小声说：“我找不到回家的路了。”', motion: 'float', sky: '#34345f' },
      { hero: '🐻', prop: '🚀', caption: '小熊折了一架纸火箭：“别担心，我陪你去找月亮！”', motion: 'drive', sky: '#282d5c' },
      { hero: '🚀', prop: '🪐', caption: '火箭绕过圆圆的星球，星球的光环像一条滑滑梯。', motion: 'orbit', sky: '#29254f' },
      { hero: '⭐', prop: '🌙', caption: '远处，月亮举起一盏灯：“小星星，我在这里！”', motion: 'wave', sky: '#223459' },
      { hero: '⭐', prop: '✨', caption: '小星星找到自己的位置，和朋友们一起眨眼睛。', motion: 'bounce', sky: '#252b62' },
      { hero: '🐻', prop: '🌙', caption: '小熊回到被窝。月亮把晚安灯，轻轻照在它的窗前。', motion: 'float', sky: '#36345c' }
    ]
  },
  school_words: {
    title: '动物单词课堂', kind: 'quiz', theme: 'classroom', icon: '🔤', duration: '1–2 分钟', seconds: 90,
    description: '看单词卡，把英文单词和可爱的小动物配成一对。', result: '你完成了三个动物单词的配对，认识了 cat、dog 和 bird！',
    rounds: [
      turn('哪个小动物是 cat？', 'cat', [pick('dog', '小狗', '🐶'), pick('cat', '小猫', '🐱'), pick('bird', '小鸟', '🐦')], '🧑‍🏫', '🔤', '第一张单词卡：cat', 'cat 是会“喵喵”叫的小动物，再找找。'),
      turn('哪个小动物是 dog？', 'dog', [pick('bird', '小鸟', '🐦'), pick('rabbit', '小兔', '🐰'), pick('dog', '小狗', '🐶')], '🧑‍🏫', '📝', '第二张单词卡：dog', 'dog 是会“汪汪”叫的小动物。'),
      turn('哪个小动物是 bird？', 'bird', [pick('bird', '小鸟', '🐦'), pick('cat', '小猫', '🐱'), pick('fish', '小鱼', '🐟')], '🧑‍🏫', '🌟', '最后一张单词卡：bird', 'bird 有羽毛和翅膀，会在树枝上唱歌。')
    ]
  },
  school_numbers: {
    title: '水果数学课', kind: 'quiz', theme: 'classroom', icon: '🧮', duration: '1–2 分钟', seconds: 90,
    description: '数水果、帮同桌分点心，完成三道生活里的小算题。', result: '点心分好啦！你完成了数草莓、加苹果和分香蕉三道水果数学题。',
    rounds: [
      turn('盘子里有几颗草莓？', 'three', [pick('two', '2 颗', '2️⃣'), pick('three', '3 颗', '3️⃣'), pick('four', '4 颗', '4️⃣')], '🧑‍🏫', '🍓', '🍓 🍓 🍓 · 一颗一颗慢慢数。', '从左往右数：1、2、3。'),
      turn('2 个苹果，再放 1 个，一共有几个？', 'three', [pick('three', '3 个', '3️⃣'), pick('one', '1 个', '1️⃣'), pick('four', '4 个', '4️⃣')], '🐻', '🍎', '🍎 🍎 ＋ 🍎', '先数两个，再往后数一个。'),
      turn('4 根香蕉，分给同桌 2 根，还剩几根？', 'two', [pick('four', '4 根', '4️⃣'), pick('three', '3 根', '3️⃣'), pick('two', '2 根', '2️⃣')], '🐰', '🍌', '🍌 🍌 🍌 🍌 · 分享让点心更好吃。', '拿走两根，再数一数留下的两根。')
    ]
  },
  library_forest: {
    title: '森林里的借书卡', kind: 'story', theme: 'forest', icon: '📗', duration: '2–3 分钟', seconds: 150,
    description: '一边读故事，一边寻找画面里的线索，帮小狐狸办好借书卡。', result: '狐狸借到了喜欢的书，你也读完了森林故事。读完记得归还，让故事继续旅行。',
    rounds: [
      turn('谁来森林图书馆借书？', 'fox', [pick('bear', '小熊', '🐻'), pick('fox', '小狐狸', '🦊'), pick('rabbit', '小兔', '🐰')], '🦊', '📚', '小狐狸抱着一只空书袋，走进树洞里的图书馆。', '找找谁抱着空书袋走进来了。'),
      turn('借书前，小狐狸要先办什么？', 'card', [pick('card', '借书卡', '🪪'), pick('ticket', '电影票', '🎟️'), pick('menu', '菜单', '📋')], '🦉', '🪪', '猫头鹰馆长说：“先办一张借书卡，就能把故事带回家。”', '馆长准备了一张写着小狐狸名字的卡。'),
      turn('狐狸想认识星星，应该借哪一本？', 'stars', [pick('flowers', '花园故事', '🌷'), pick('food', '小小厨房', '🍲'), pick('stars', '星空旅行', '🌌')], '🦊', '🌌', '书架上有花园、厨房和星空。狐狸想知道夜里谁在闪闪发光。', '夜里闪闪发光的是星星，找一本讲星空的书。'),
      turn('读完书以后，怎么让朋友也能读到？', 'return', [pick('hide', '一直藏起来', '📦'), pick('return', '送回图书馆', '📚'), pick('draw', '画在书上', '🖍️')], '🦊', '📗', '狐狸读完最后一页，想让小兔也看看这趟星空旅行。', '把书送回原来的地方，下一个读者就能借到。')
    ]
  },
  library_ocean: {
    title: '小海龟找朋友', kind: 'story', theme: 'ocean', icon: '📘', duration: '2–3 分钟', seconds: 150,
    description: '翻开蓝色故事书，沿着海底线索，找到小海龟的朋友。', result: '小海龟找到了伙伴，你读完了这趟海洋旅行！把海边的垃圾带走，让大海保持干净。',
    rounds: [
      turn('小海龟要去哪里找朋友？', 'ocean', [pick('ocean', '蓝色大海', '🌊'), pick('mountain', '高高雪山', '🏔️'), pick('city', '热闹车站', '🚉')], '🐢', '🌊', '清晨，小海龟从沙滩出发，游进蓝色的大海。', '故事里，小海龟从沙滩游进了哪里？'),
      turn('谁挥着八条腕足向它打招呼？', 'octopus', [pick('fish', '小鱼', '🐟'), pick('octopus', '章鱼', '🐙'), pick('crab', '螃蟹', '🦀')], '🐢', '🐙', '珊瑚后面伸出八条腕足，一个朋友开心地挥挥手。', '章鱼有八条腕足。'),
      turn('故事里的海豚带来什么声音？', 'song', [pick('clock', '闹钟声', '⏰'), pick('car', '汽车声', '🚗'), pick('song', '快乐的歌', '🎵')], '🐬', '🎵', '海豚跃出水面，唱起一首快乐的歌，大家跟着拍水花。', '海豚唱起了一首快乐的歌。'),
      turn('回到沙滩，他们把空包装放在哪里？', 'bin', [pick('sand', '埋进沙里', '🏖️'), pick('bin', '垃圾桶里', '🗑️'), pick('sea', '丢进海里', '🌊')], '🐢', '♻️', '太阳快落山了。朋友们把野餐的空包装收进袋子，准备带走。', '垃圾要带离沙滩，再按分类放进垃圾桶。')
    ]
  },
  shop_basket: {
    title: '周末采购清单', kind: 'targets', theme: 'market', icon: '🧺', duration: '约 1 分钟', seconds: 60,
    description: '看着购物清单，找齐野餐需要的三件商品，装进自己的小篮子。', result: '面包、水和苹果都装进购物篮啦！野餐采购完成。',
    hero: '🧑‍🍳', prop: '🧺', caption: '野餐清单：面包、饮用水、苹果。只拿清单上的商品哦。',
    prompt: '点选清单上的 3 件商品', hint: '这件不在清单里。再看看：面包、饮用水、苹果。',
    targets: ['bread', 'water', 'apple'], choices: [pick('milk', '牛奶', '🥛'), pick('bread', '面包', '🥖'), pick('soap', '香皂', '🧼'), pick('apple', '苹果', '🍎'), pick('water', '饮用水', '💧'), pick('ball', '皮球', '⚽')]
  },
  shop_sort: {
    title: '小小理货员', kind: 'sequence', theme: 'market', icon: '📦', duration: '1–2 分钟', seconds: 90,
    description: '新货到店啦！把水果、文具和清洁用品放回正确的货架。', result: '四件商品各就各位，货架整整齐齐。今天你是小镇的优秀理货员！',
    rounds: [
      turn('苹果应该放在哪个货架？', 'fruit', [pick('fruit', '水果架', '🍊'), pick('stationery', '文具架', '✏️'), pick('clean', '清洁用品架', '🧼')], '🧑‍💼', '🍎', '第一箱新货是红红的苹果。', '苹果和橘子、香蕉是同一类。'),
      turn('铅笔应该放在哪个货架？', 'stationery', [pick('clean', '清洁用品架', '🧼'), pick('fruit', '水果架', '🍊'), pick('stationery', '文具架', '✏️')], '🧑‍💼', '✏️', '接着是一盒写字用的铅笔。', '铅笔是学习时用的文具。'),
      turn('香皂应该放在哪个货架？', 'clean', [pick('stationery', '文具架', '✏️'), pick('clean', '清洁用品架', '🧼'), pick('fruit', '水果架', '🍊')], '🧑‍💼', '🧼', '这箱是洗手用的香皂。', '洗手用的香皂属于清洁用品。'),
      turn('最后，这把尺子应该放在哪里？', 'stationery', [pick('fruit', '水果架', '🍊'), pick('stationery', '文具架', '✏️'), pick('clean', '清洁用品架', '🧼')], '🧑‍💼', '📏', '最后一件商品：画直线用的尺子。', '尺子和铅笔都属于文具。')
    ]
  },
  restaurant_soup: {
    title: '主厨的彩虹汤', kind: 'sequence', theme: 'kitchen', icon: '🍲', duration: '1–2 分钟', seconds: 90,
    description: '在小游戏厨房里，按主厨的食谱选食材，做出一碗彩虹蔬菜汤。', result: '胡萝卜、玉米和青菜变成了一碗彩虹汤。主厨为你点了一个赞！',
    rounds: [
      turn('食谱第一样：橙色的胡萝卜', 'carrot', [pick('carrot', '胡萝卜', '🥕'), pick('cake', '蛋糕', '🍰'), pick('grape', '葡萄', '🍇')], '🧑‍🍳', '🍲', '主厨打开食谱：“先找橙色的蔬菜。”', '长长的、橙色的蔬菜是胡萝卜。'),
      turn('再找金黄色的玉米', 'corn', [pick('apple', '苹果', '🍎'), pick('corn', '玉米', '🌽'), pick('bread', '面包', '🥖')], '🧑‍🍳', '🥕', '锅里已经有胡萝卜啦，加入一点金黄色。', '玉米的颗粒像金黄色的小珠子。'),
      turn('最后添一份绿色的青菜', 'leaf', [pick('cookie', '饼干', '🍪'), pick('peach', '桃子', '🍑'), pick('leaf', '青菜', '🥬')], '🧑‍🍳', '🌽', '彩虹汤还需要绿色的叶子。', '找有绿色叶片的青菜。'),
      turn('主厨做好汤了，用什么盛上餐桌？', 'bowl', [pick('bowl', '汤碗', '🥣'), pick('bag', '纸袋', '🛍️'), pick('basket', '果篮', '🧺')], '🧑‍🍳', '🍲', '咕嘟咕嘟，游戏里的汤做好了！主厨负责烹饪，你来选餐具。', '汤需要装进能盛液体的碗里。')
    ]
  },
  restaurant_bento: {
    title: '我的缤纷便当', kind: 'sequence', theme: 'kitchen', icon: '🍱', duration: '1–2 分钟', seconds: 90,
    description: '按订单给便当盒填满四个格子，主食、蔬菜和水果都要有。', result: '米饭、西兰花、鸡蛋和草莓都装好了！这份缤纷便当可以上桌啦。',
    rounds: [
      turn('第一格的订单是：米饭', 'rice', [pick('berry', '草莓', '🍓'), pick('rice', '米饭', '🍚'), pick('broccoli', '西兰花', '🥦')], '🧑‍🍳', '🍱', '客人点了一份四格便当，先放主食。', '白白的一小碗就是米饭。'),
      turn('第二格的订单是：西兰花', 'broccoli', [pick('broccoli', '西兰花', '🥦'), pick('egg', '鸡蛋', '🥚'), pick('rice', '米饭', '🍚')], '🧑‍🍳', '🍚', '主食有了，再加一格蔬菜。', '西兰花像一棵绿色的小树。'),
      turn('第三格的订单是：鸡蛋', 'egg', [pick('rice', '米饭', '🍚'), pick('berry', '草莓', '🍓'), pick('egg', '鸡蛋', '🥚')], '🧑‍🍳', '🥦', '便当还空着两格，看看订单上的鸡蛋。', '找到椭圆形的鸡蛋。'),
      turn('最后一格的订单是：草莓', 'berry', [pick('egg', '鸡蛋', '🥚'), pick('berry', '草莓', '🍓'), pick('broccoli', '西兰花', '🥦')], '🧑‍🍳', '🍱', '再放上一份红红的水果，便当就完成了。', '红红的草莓是这一格的水果。')
    ]
  },
  park_garden: {
    title: '花园浇水日', kind: 'targets', theme: 'garden', icon: '🌻', duration: '约 1 分钟', seconds: 60,
    description: '观察花园里的小标牌，只给标着“口渴”的花朵浇水。', result: '三朵口渴的小花都喝到水了，花园开出一片明亮的颜色！',
    hero: '🧑‍🌾', prop: '🚿', caption: '园丁留下标牌：口渴的花需要水；已经喝饱的花，先让它休息。',
    prompt: '点选 3 朵标着“口渴”的花', hint: '这朵已经喝饱啦，找找标着“口渴”的花。',
    targets: ['tulip', 'sunflower', 'rose'], choices: [pick('tulip', '郁金香 · 口渴', '🌷'), pick('daisy', '小雏菊 · 喝饱了', '🌼'), pick('sunflower', '向日葵 · 口渴', '🌻'), pick('hibiscus', '木槿花 · 喝饱了', '🌺'), pick('rose', '小玫瑰 · 口渴', '🌹'), pick('clover', '幸运草 · 喝饱了', '☘️')]
  },
  park_birds: {
    title: '树梢观察家', kind: 'targets', theme: 'garden', icon: '🔎', duration: '约 1 分钟', seconds: 60,
    description: '安静观察公园，在树梢和草地的小伙伴里找到三种鸟。', result: '你找到了小鸟、鸭子和猫头鹰！三种鸟类都被你发现了，静静观察也是一种爱护。',
    hero: '🧒', prop: '🔎', caption: '保持安静，用眼睛观察。看看哪些朋友长着羽毛和翅膀？',
    prompt: '找到画面中的 3 种鸟', hint: '它也是公园的朋友，但不是鸟类。再找找有羽毛的小伙伴。',
    targets: ['bird', 'duck', 'owl'], choices: [pick('butterfly', '蝴蝶', '🦋'), pick('bird', '小鸟', '🐦'), pick('rabbit', '兔子', '🐰'), pick('duck', '鸭子', '🦆'), pick('owl', '猫头鹰', '🦉'), pick('snail', '蜗牛', '🐌')]
  },
  stadium_hoops: {
    title: '三球投篮挑战', kind: 'sport', theme: 'court', icon: '🏀', duration: '约 1 分钟', seconds: 60,
    description: '观察每回合篮筐亮起的位置，选准方向，把三个篮球送进篮筐。', result: '三球全部入筐！记分牌亮起了 3 分，你完成了今天的投篮挑战。',
    rounds: [
      turn('篮筐在左边，选择投球方向', 'left', [pick('left', '向左投', '↖️'), pick('center', '向中投', '⬆️'), pick('right', '向右投', '↗️')], '🏀', '🥅', '第一球：← 左侧篮筐亮起来了。', '看亮起的篮筐，向左边试试。'),
      turn('篮筐换到右边啦，选准方向', 'right', [pick('left', '向左投', '↖️'), pick('center', '向中投', '⬆️'), pick('right', '向右投', '↗️')], '🏀', '🥅', '第二球：右侧篮筐亮起来了 →', '这次篮筐在右边。'),
      turn('最后一球，瞄准中间的篮筐', 'center', [pick('left', '向左投', '↖️'), pick('center', '向中投', '⬆️'), pick('right', '向右投', '↗️')], '🏀', '🥅', '第三球：↑ 中间篮筐亮起来了。', '最后一球，向中间投。')
    ]
  },
  stadium_goal: {
    title: '小镇点球练习', kind: 'sport', theme: 'court', icon: '⚽', duration: '约 1 分钟', seconds: 60,
    description: '看球门里的星星标记，选择射门方向，完成三次定点练习。', result: '左、中、右三个星星靶全部命中！你完成了今天的三轮定点射门练习。',
    rounds: [
      turn('射向右边的星星靶', 'right', [pick('left', '向左踢', '↖️'), pick('center', '向中踢', '⬆️'), pick('right', '向右踢', '↗️')], '⚽', '🥅', '第一轮：星星在球门右侧 ⭐ →', '瞄准右边的星星。'),
      turn('这次星星亮在球门中间', 'center', [pick('left', '向左踢', '↖️'), pick('center', '向中踢', '⬆️'), pick('right', '向右踢', '↗️')], '⚽', '🥅', '第二轮：↑ 星星在球门中间。', '球门中间的星星在等着你。'),
      turn('最后射向左边的星星靶', 'left', [pick('left', '向左踢', '↖️'), pick('center', '向中踢', '⬆️'), pick('right', '向右踢', '↗️')], '⚽', '🥅', '第三轮：← 星星换到了球门左侧。', '这次往左踢，就能找到星星。')
    ]
  },
  hospital_checkup: {
    title: '玩偶体检日', kind: 'sequence', theme: 'clinic', icon: '🧸', duration: '1–2 分钟', seconds: 90,
    description: '在玩偶体验区帮医生整理体检道具，给紧张的小熊送上鼓励。', result: '小熊完成了玩偶体检，贴上了勇气星星。这是角色扮演游戏，不是真实体检。',
    rounds: [
      turn('先帮小熊找到自己的预约卡', 'bear', [pick('rabbit', '小兔预约卡', '🐰'), pick('bear', '小熊预约卡', '🐻'), pick('cat', '小猫预约卡', '🐱')], '🧑‍⚕️', '🪪', '玩偶体验区开放啦！今天来体检的是小熊。', '预约卡上要有小熊的头像。'),
      turn('医生要记录身高，递上哪个玩具道具？', 'ruler', [pick('ruler', '玩具身高尺', '📏'), pick('ball', '皮球', '⚽'), pick('book', '故事书', '📗')], '🧑‍⚕️', '🧸', '游戏里的医生负责体检，你来找一找道具。', '测量长短和高矮，用有刻度的尺子。'),
      turn('小熊有些紧张，给它什么鼓励？', 'kind', [pick('rush', '催它快一点', '⏩'), pick('leave', '转身走开', '🚪'), pick('kind', '陪它讲个小故事', '📖')], '🧸', '💛', '小熊小声说：“我想有人陪着我。”', '陪伴和温柔的话，能让小熊安心。'),
      turn('体检游戏完成，找一颗勇气星星', 'star', [pick('box', '空纸箱', '📦'), pick('star', '勇气星星', '⭐'), pick('sock', '小袜子', '🧦')], '🧑‍⚕️', '🧸', '医生说：“小熊做得很好，送它一颗星星吧！”', '找找闪亮的五角星。')
    ]
  },
  hospital_bandage: {
    title: '玩偶贴纸工坊', kind: 'sequence', theme: 'clinic', icon: '🩹', duration: '1–2 分钟', seconds: 90,
    description: '给布偶的游戏护理贴挑选图案，再配一条小毯子。这是玩偶角色扮演。', result: '玩偶盖上小毯子，抱着爱心卡休息了。你完成了温柔的玩偶照护游戏。',
    rounds: [
      turn('小熊喜欢星星，选哪张装饰护理贴？', 'star', [pick('flower', '花朵图案', '🌷'), pick('star', '星星图案', '⭐'), pick('moon', '月亮图案', '🌙')], '🧸', '🩹', '这是给布偶用的装饰贴。小熊说：“我最喜欢星星！”', '选择五角星图案就对啦。'),
      turn('小兔喜欢月亮，选哪张装饰护理贴？', 'moon', [pick('moon', '月亮图案', '🌙'), pick('star', '星星图案', '⭐'), pick('flower', '花朵图案', '🌷')], '🐰', '🩹', '小兔也来了，它想要弯弯的月亮图案。', '弯弯的月亮像一条小船。'),
      turn('玩偶想休息，帮它选一条小毯子', 'blanket', [pick('drum', '响亮的小鼓', '🥁'), pick('ball', '弹跳皮球', '🏀'), pick('blanket', '柔软小毯子', '🛏️')], '🧸', '💤', '图案配好啦，让玩偶在游戏里的休息角坐一会儿。', '柔软的毯子适合休息时盖着。'),
      turn('最后送给玩偶一张祝福卡', 'heart', [pick('heart', '爱心祝福卡', '💌'), pick('receipt', '购物小票', '🧾'), pick('map', '公交地图', '🗺️')], '🧸', '💛', '在卡片上写下：“希望你每天都开开心心。”', '装着爱心的卡片就是祝福卡。')
    ]
  },
  vet_checkup: {
    title: '毛茸茸体检室', kind: 'sequence', theme: 'clinic', icon: '🐾', duration: '1–2 分钟', seconds: 90,
    description: '扮演宠物医生的小助手，核对预约、准备道具，陪伴游戏里的小动物。', result: '猫咪安心地完成了游戏体检，小狗也领到了自己的预约卡。宠物医生谢谢你的帮助！',
    rounds: [
      turn('今天先来的是猫咪，找到它的预约卡', 'cat', [pick('dog', '小狗预约卡', '🐶'), pick('rabbit', '小兔预约卡', '🐰'), pick('cat', '猫咪预约卡', '🐱')], '🧑‍⚕️', '🐱', '宠物医生在游戏里迎接第一位小客人。', '找有猫咪头像的预约卡。'),
      turn('医生要记录猫咪体重，准备哪个游戏道具？', 'scale', [pick('scale', '体重秤', '⚖️'), pick('camera', '相机', '📷'), pick('brush', '画笔', '🖌️')], '🐱', '📋', '体检由游戏里的宠物医生完成，你负责整理桌面。', '体重秤可以帮助医生记录重量。'),
      turn('猫咪想安静地等一等，选哪个休息角？', 'quiet', [pick('drum', '鼓声练习室', '🥁'), pick('quiet', '安静的软垫角', '🧺'), pick('race', '赛车跑道', '🏎️')], '🐱', '💛', '等候时，猫咪想躺在柔软、安静的地方。', '软垫角比较安静，也很柔软。'),
      turn('下一位是小狗，应该递给它哪张卡？', 'dog', [pick('dog', '小狗预约卡', '🐶'), pick('cat', '猫咪预约卡', '🐱'), pick('rabbit', '小兔预约卡', '🐰')], '🧑‍⚕️', '🪪', '猫咪的体检游戏结束了，门口传来“汪汪”的声音。', '会“汪汪”叫的是小狗。')
    ]
  },
  vet_groom: {
    title: '宠物造型工作室', kind: 'sequence', theme: 'clinic', icon: '🎀', duration: '1–2 分钟', seconds: 90,
    description: '为游戏里的毛绒小狗选梳子、毛巾和蝴蝶结，拍一张造型纪念照。', result: '毛绒小狗戴上蝴蝶结，留下了一张可爱的造型照。今天的造型师就是你！',
    rounds: [
      turn('毛绒小狗想梳毛，选哪个玩具道具？', 'brush', [pick('spoon', '汤勺', '🥄'), pick('brush', '柔软小梳子', '🪮'), pick('pencil', '铅笔', '✏️')], '🐶', '🧺', '这里是毛绒玩偶造型室，小狗准备换个新造型。', '梳理玩偶的毛发，要找小梳子。'),
      turn('桌上需要一条柔软的毛巾', 'towel', [pick('towel', '小毛巾', '🧻'), pick('book', '故事书', '📚'), pick('ball', '网球', '🎾')], '🐶', '✨', '造型师开始整理工作台，准备好柔软的小毛巾。', '找能铺在桌上的小毛巾。'),
      turn('小狗的订单是一个粉色蝴蝶结', 'bow', [pick('cap', '棒球帽', '🧢'), pick('crown', '金色王冠', '👑'), pick('bow', '粉色蝴蝶结', '🎀')], '🐶', '📋', '“我想戴一个粉色蝴蝶结！”毛绒小狗的订单上写着。', '粉色的蝴蝶结在这里。'),
      turn('造型做好了，用什么留下纪念？', 'camera', [pick('clock', '闹钟', '⏰'), pick('camera', '照相机', '📸'), pick('umbrella', '小雨伞', '☂️')], '🐶', '🎀', '咔嚓！准备给今天的新造型拍一张照片。', '照相机可以拍下纪念照。')
    ]
  },
  fire_drill: {
    title: '安全小课堂', kind: 'quiz', theme: 'fire', icon: '🧯', duration: '1–2 分钟', seconds: 90,
    description: '阅读消防安全故事，练习远离危险、及时求助和听从疏散指引。', result: '三道安全题完成！记住：远离危险、告诉大人、听从专业人员的指引。',
    rounds: [
      turn('发现烟雾和危险时，小朋友应该怎么做？', 'help', [pick('closer', '走近看看', '🔎'), pick('help', '远离危险并告诉大人', '🧑‍🚒'), pick('hide', '躲起来不告诉别人', '📦')], '🧑‍🚒', '🧯', '消防员在课堂上讲故事：“安全永远排在第一位。”', '不要靠近危险，及时告诉身边的大人。'),
      turn('学校进行疏散演练时，应该怎么做？', 'follow', [pick('follow', '跟随老师的疏散指引', '🧑‍🏫'), pick('toy', '回去找玩具', '🧸'), pick('race', '推挤着跑', '🏃')], '🧑‍🚒', '🚪', '老师开始组织演练，大家要一起有秩序地行动。', '跟着老师，不推挤，也不回头取物。'),
      turn('看到专业消防员工作时，我们应该在哪里？', 'safe', [pick('truck', '爬上消防车', '🚒'), pick('near', '凑到作业区旁边', '👀'), pick('safe', '留在安全区域听从指引', '🚧')], '🧑‍🚒', '🚧', '消防员说：“我们的装备很重，工作区域要保持畅通。”', '在安全区域等候，把通道留给专业人员。')
    ]
  },
  fire_rescue: {
    title: '消防队模拟出勤', kind: 'sequence', theme: 'fire', icon: '🚒', duration: '1–2 分钟', seconds: 90,
    description: '在模拟指挥台为专业消防员配齐出勤图卡，跟随故事完成一次救援。', result: '模拟消防队安全返回！所有救援都由故事里的专业消防员完成，你整理好了出勤记录。',
    rounds: [
      turn('模拟指挥台要派出哪支专业队伍？', 'firefighters', [pick('bakers', '面包师队伍', '🧑‍🍳'), pick('firefighters', '专业消防队', '🧑‍🚒'), pick('players', '足球队', '⚽')], '🧑‍🚒', '📻', '模拟演练开始。你负责匹配图卡，救援由故事里的专业人员完成。', '消防出勤交给专业消防队。'),
      turn('把消防车图卡放上出勤看板', 'truck', [pick('truck', '消防车图卡', '🚒'), pick('bus', '公交车图卡', '🚌'), pick('bike', '自行车图卡', '🚲')], '🧑‍🚒', '📋', '专业队员准备出发，出勤看板还缺一张车辆图卡。', '找到红色消防车图卡。'),
      turn('专业人员设好了安全区，配上哪张标志？', 'barrier', [pick('party', '派对标志', '🎉'), pick('food', '餐厅标志', '🍽️'), pick('barrier', '安全围挡标志', '🚧')], '🧑‍🚒', '🚒', '故事里的专业人员完成了现场布置，大家留在安全区域。', '围挡标志提醒大家远离作业区域。'),
      turn('队员安全返回，把记录归到哪里？', 'record', [pick('menu', '餐厅菜单', '📜'), pick('record', '演练记录册', '📒'), pick('novel', '童话故事书', '📗')], '🧑‍🚒', '✅', '模拟演练结束，指挥台要保存今天的出勤记录。', '把演练结果放进专门的记录册。')
    ]
  },
  police_lost: {
    title: '失物招领小侦探', kind: 'sequence', theme: 'police', icon: '🔍', duration: '1–2 分钟', seconds: 90,
    description: '根据居民提供的颜色和图案线索，帮警员找回三件丢失的物品。', result: '雨伞、书包和小熊都找到主人了！你根据三条线索，帮警员完成了失物核对。',
    rounds: [
      turn('第一条线索：一把紫色的雨伞', 'umbrella', [pick('cap', '蓝色帽子', '🧢'), pick('umbrella', '紫色雨伞', '☂️'), pick('bag', '黄色手袋', '👜')], '👮', '📋', '小兔说：“我把紫色的雨伞落在公园长椅上了。”', '找一把紫色的雨伞。'),
      turn('第二条线索：上学背的红色书包', 'backpack', [pick('backpack', '红色书包', '🎒'), pick('basket', '野餐篮', '🧺'), pick('case', '旅行箱', '🧳')], '👮', '🔎', '小狐狸说：“我的书包是红色的，里面有课本。”', '上学时背的红色书包，前面有一个小口袋。'),
      turn('第三条线索：棕色的毛绒小熊', 'bear', [pick('rabbit', '白色小兔', '🐰'), pick('ball', '黑白足球', '⚽'), pick('bear', '棕色小熊', '🧸')], '👮', '💛', '小猫说：“我的好朋友是一只棕色的毛绒小熊。”', '找找棕色的小熊玩偶。')
    ]
  },
  police_traffic: {
    title: '交通灯小课堂', kind: 'quiz', theme: 'police', icon: '🚦', duration: '1–2 分钟', seconds: 90,
    description: '跟警员观察红绿灯和人行横道，完成三道出行安全小题。', result: '交通课堂完成！过马路时和大人在一起，观察交通情况，听从信号与指引。',
    rounds: [
      turn('行人红灯亮起时，应该怎么做？', 'wait', [pick('run', '赶快冲过去', '🏃'), pick('wait', '在人行道安全位置等待', '🛑'), pick('ball', '走到路上玩球', '⚽')], '👮', '🔴', '警员指向行人信号灯：“看，红灯亮了。”', '红灯时要等待，不进入车道。'),
      turn('准备过马路，应该找哪里？', 'crossing', [pick('crossing', '有人行横道的过街位置', '🚶'), pick('gap', '停着的汽车中间', '🚗'), pick('fence', '翻过路边护栏', '🚧')], '👮', '🦓', '小朋友和大人一起出门，要选择合适的过街位置。', '和大人一起寻找人行横道，按信号与现场指引通行。'),
      turn('行人绿灯亮起后，小朋友应怎么做？', 'adult', [pick('eyes', '闭着眼跑过去', '🙈'), pick('phone', '低头看屏幕', '📱'), pick('adult', '和大人确认安全后通行', '🧑‍🤝‍🧑')], '👮', '🟢', '绿灯亮了，也要留意车辆和周围情况。', '和大人一起观察、确认安全，按指引通行。')
    ]
  }
}

const clone = value => JSON.parse(JSON.stringify(value))
const gameFor = id => Object.prototype.hasOwnProperty.call(games, id) ? games[id] : null

function activityDetails(id) {
  const game = gameFor(id)
  if (!game) return null
  return { id, title: game.title, kind: game.kind, description: game.description, duration: game.duration, seconds: game.seconds, icon: game.icon, theme: game.theme }
}

function renderSession(session, game) {
  const next = clone(session)
  const index = Math.min(next.step, next.total - 1)
  const current = game.frames ? game.frames[index] : game.rounds ? game.rounds[index] : game
  const labels = { movie: '幕', story: '页', quiz: '题', sequence: '步', targets: '个', sport: '球' }
  const currentChoices = game.kind === 'movie' || next.complete ? [] : current.choices
  next.choices = (currentChoices || []).map(item => Object.assign({}, item, {
    selected: next.collected.indexOf(item.id) >= 0,
    disabled: next.collected.indexOf(item.id) >= 0
  }))
  next.progress = next.complete ? 100 : Math.round(next.step / next.total * 100)
  next.scene = {
    theme: game.theme, sky: current.sky || colors[game.theme], hero: current.hero || game.icon,
    prop: current.prop || game.icon, caption: next.complete ? game.result : current.caption || game.description,
    prompt: next.complete ? '体验完成，留下这份小镇回忆吧' : current.prompt || '坐好啦，小电影正在放映',
    eyebrow: next.complete ? '体验完成' : game.kind === 'targets' ? '已完成 ' + next.step + ' / ' + next.total + ' 个' : '第 ' + (index + 1) + ' / ' + next.total + ' ' + labels[game.kind],
    motion: current.motion || (game.kind === 'sport' ? 'bounce' : 'float'),
    items: game.kind === 'targets' ? game.choices.map(item => Object.assign({}, item, { selected: next.collected.indexOf(item.id) >= 0 })) : [],
    target: game.kind === 'sport' && !next.complete ? current.answer : '',
    warning: next.id.indexOf('hospital_') === 0 || next.id.indexOf('vet_') === 0 ? '玩偶与角色扮演体验；真实照护请向医生或宠物医生求助。' : next.id.indexOf('fire_') === 0 ? '模拟课堂；现实中的救援由专业消防人员完成。' : ''
  }
  return next
}

function createActivitySession(id, receipt) {
  const game = gameFor(id)
  if (!game) return null
  return renderSession({
    id, title: game.title, kind: game.kind, receipt: receipt == null ? null : clone(receipt),
    step: 0, total: game.frames ? game.frames.length : game.rounds ? game.rounds.length : game.targets.length,
    progress: 0, complete: false, paused: false, feedback: '', result: '', score: 0, attempts: 0,
    collected: [], choices: [], scene: {}
  }, game)
}

function advanceActivity(session, input) {
  if (!session || !gameFor(session.id)) return null
  const next = clone(session)
  const game = gameFor(next.id)
  if (next.complete || !input) return next
  if (game.kind === 'movie') {
    if (input.kind === 'toggle_pause') {
      next.paused = !next.paused
      next.feedback = next.paused ? '放映已暂停，准备好后可以继续。' : '继续放映啦。'
      return next
    }
    if (input.kind !== 'next' && (input.kind !== 'tick' || next.paused)) return next
    next.step += 1
    next.feedback = ''
  } else {
    if (input.kind !== 'choose') return next
    const choiceID = input.id || input.position
    const current = game.rounds ? game.rounds[next.step] : game
    if (!current.choices.some(choice => choice.id === choiceID)) return next
    if (next.collected.indexOf(choiceID) >= 0 && game.kind === 'targets') return next
    next.attempts += 1
    const correct = game.kind === 'targets' ? game.targets.indexOf(choiceID) >= 0 : current.answer === choiceID
    if (!correct) {
      next.feedback = current.hint || game.hint || '再观察一下，慢慢试试。'
      return next
    }
    if (game.kind === 'targets') next.collected.push(choiceID)
    next.step += 1
    next.score += 1
    next.feedback = game.kind === 'sport' ? '命中！记分牌 +1，准备下一球。' : game.kind === 'targets' ? '找到啦！完成 ' + next.step + ' / ' + next.total + ' 个。' : '做得对！继续看看接下来的任务。'
  }
  if (next.step >= next.total) {
    next.step = next.total
    next.complete = true
    next.paused = false
    next.result = game.result
    next.feedback = game.kind === 'movie' ? '放映结束，谢谢观看！' : '全部完成啦！'
  }
  return renderSession(next, game)
}

const activityIDs = () => Object.keys(games)

module.exports = { activityIDs, activityDetails, createActivitySession, advanceActivity }
