// utils/assets.js
// 在美术素材接入前，用 emoji 充当建筑与单词的图形。
// 后端返回 image_url 时优先用图片，此处仅作为兜底。

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
  '体育馆': '⚽'
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
  return BUILDING_EMOJI[name] || DEFAULT_BUILDING
}

function wordEmoji(word) {
  if (!word) return DEFAULT_WORD
  return WORD_EMOJI[String(word).toLowerCase()] || DEFAULT_WORD
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
  buildingEmoji,
  wordEmoji,
  GRADES
}
