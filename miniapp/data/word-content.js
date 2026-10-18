// sentence 的 ___ 是唯一的填空位置。课本词表保留单元，供核对和生成音频。
const textbook = require('./textbook-words')
const content = {
  apple: { sentence: 'I eat an ___.', meaning: '我吃一个苹果。' },
  book: { sentence: 'I read a ___.', meaning: '我读一本书。' },
  cat: { sentence: 'The ___ says meow.', meaning: '小猫喵喵叫。' },
  dog: { sentence: 'The ___ says woof.', meaning: '小狗汪汪叫。' },
  elephant: { sentence: 'The ___ has a long nose.', meaning: '大象有长长的鼻子。' },
  fish: { sentence: 'The ___ swims in the water.', meaning: '鱼在水里游。' },
  girl: { sentence: 'The ___ is my sister.', meaning: '那个女孩是我的姐姐。' },
  hand: { sentence: 'Raise your ___.', meaning: '举起你的手。' },
  'ice cream': { sentence: 'The ___ is cold and sweet.', meaning: '冰淇淋又凉又甜。' },
  juice: { sentence: 'I drink orange ___.', meaning: '我喝橙汁。' },
  king: { sentence: 'The ___ wears a crown.', meaning: '国王戴着王冠。' },
  lion: { sentence: 'The ___ has a big mane.', meaning: '狮子有浓密的鬃毛。' },
  monkey: { sentence: 'The ___ likes bananas.', meaning: '猴子喜欢香蕉。' },
  nose: { sentence: 'I smell with my ___.', meaning: '我用鼻子闻气味。' },
  orange: { sentence: 'I peel an ___.', meaning: '我剥一个橙子。' },
  pencil: { sentence: 'I write with a ___.', meaning: '我用铅笔写字。' },
  queen: { sentence: 'The ___ wears a beautiful crown.', meaning: '女王戴着漂亮的王冠。' },
  rabbit: { sentence: 'The ___ has long ears.', meaning: '兔子有长长的耳朵。' },
  sun: { sentence: 'The ___ shines in the sky.', meaning: '太阳在天空中照耀。' },
  tiger: { sentence: 'The ___ has black stripes.', meaning: '老虎身上有黑色条纹。' },
  umbrella: { sentence: 'Take an ___ on a rainy day.', meaning: '下雨天带一把雨伞。' },
  violin: { sentence: 'She plays the ___.', meaning: '她拉小提琴。' },
  window: { sentence: 'Open the ___, please.', meaning: '请打开窗户。' },
  yellow: { sentence: 'The banana is ___.', meaning: '香蕉是黄色的。' },
  zebra: { sentence: 'The ___ is black and white.', meaning: '斑马是黑白相间的。' }
}

textbook.forEach((unit) => unit.words.forEach((word) => {
  const key = word.word.toLowerCase()
  const extra = {
    sentence: word.sentence, meaning: word.meaning,
    audioPackage: Object.prototype.hasOwnProperty.call(content, key) ? content[key].audioPackage : 'textbook-audio'
  }
  // 按释义区分同形词，例如原有 orange（橙子）和课本 orange（橙色）。
  content[key + '|' + word.translation] = extra
  if (!Object.prototype.hasOwnProperty.call(content, key)) content[key] = extra
}))

module.exports = content
