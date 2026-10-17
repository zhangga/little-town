// utils/assets.js
// 单词插画保留 emoji；小镇使用随包加载的原创方块风图集。
const TOWN_SPRITES = {
  '学校': 0, '商店': 1, '医院': 2, '公园': 3,
  '餐厅': 4, '电影院': 5, '图书馆': 6, '警察局': 7,
  '消防站': 8, '体育馆': 9, '宠物医院': 2, '空地': 10, '树林': 11,
  '砖块': 12, '金币': 13, '工具': 14, '旗帜': 15
}

function townSprite(name) {
  const index = Object.prototype.hasOwnProperty.call(TOWN_SPRITES, name) ? TOWN_SPRITES[name] : 10
  const sprite = { x: -(index % 4) * 100, y: -Math.floor(index / 4) * 100 }
  if (name === '金币') sprite.image = '/images/town/gold-coin.png'
  return sprite
}

const BUILDING_EMOJI = {
  '学校': '🏫',
  '商店': '🏪',
  '医院': '🏥',
  '公园': '🌳',
  '餐厅': '🍜',
  '电影院': '🎬',
  '图书馆': '📚',
  '警察局': '🚓',
  '消防站': '🚒',
  '体育馆': '⚽',
  '宠物医院': '🐾'
}

const WORD_EMOJI = {
  'apple': '🍎',
  'book': '📕',
  'cat': '🐱',
  'dog': '🐶',
  'elephant': '🐘',
  'fish': '🐟',
  'girl': '👧',
  'hand': '✋',
  'ice cream': '🍦',
  'juice': '🧃',
  'king': '🤴',
  'lion': '🦁',
  'monkey': '🐵',
  'nose': '👃',
  'orange': '🍊',
  'pencil': '✏️',
  'queen': '👸',
  'rabbit': '🐰',
  'sun': '☀️',
  'tiger': '🐯',
  'umbrella': '☂️',
  'violin': '🎻',
  'window': '🪟',
  'yellow': '💛',
  'zebra': '🦓'
}

const DEFAULT_BUILDING = '🏠'
const DEFAULT_WORD = '🧩'

function buildingEmoji(name) {
  return Object.prototype.hasOwnProperty.call(BUILDING_EMOJI, name) ? BUILDING_EMOJI[name] : DEFAULT_BUILDING
}

function wordEmoji(word) {
  if (!word) return DEFAULT_WORD
  const key = String(word).trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(WORD_EMOJI, key) ? WORD_EMOJI[key] : DEFAULT_WORD
}

// 年级选项，登录与个人中心共用
const GRADES = [
  { value: 1, label: '一年级' },
  { value: 2, label: '二年级' },
  { value: 3, label: '三年级' },
  { value: 4, label: '四年级' },
  { value: 5, label: '五年级' },
  { value: 6, label: '六年级' }
]

module.exports = {
  townSprite,
  buildingEmoji,
  wordEmoji,
  GRADES
}
