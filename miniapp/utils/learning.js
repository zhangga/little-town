const content = require('../data/word-content')
const { wordEmoji } = require('./assets')

const FALLBACK = [
  ['banana', '香蕉'], ['bird', '小鸟'], ['cake', '蛋糕'], ['car', '汽车'],
  ['chair', '椅子'], ['duck', '鸭子'], ['egg', '鸡蛋'], ['flower', '花'],
  ['milk', '牛奶'], ['moon', '月亮'], ['tree', '树'], ['water', '水']
].map(([word, translation]) => ({ word, translation }))

const TYPES = {
  pic: { title: '看图选词', hint: '看看图片，找到它的英文名字', icon: '🖼️' },
  meaning: { title: '看词选义', hint: '这个单词是什么意思？', icon: '📖' },
  translate: { title: '看义选词', hint: '找到这个意思对应的英文', icon: '💬' },
  listen: { title: '听音辨词', hint: '先听一听，再选出你听到的单词', icon: '🎧' },
  spell: { title: '字母拼词', hint: '按顺序点字母，拼出它的英文名字', icon: '🧩' },
  cloze: { title: '例句填空', hint: '选一个单词，把句子补完整', icon: '✏️' }
}

function normalize(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function shuffle(items, random = Math.random) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = result[i]
    result[i] = result[j]
    result[j] = tmp
  }
  return result
}

function enrichWord(word) {
  const key = normalize(word.word)
  const meaningKey = key + '|' + word.translation
  const extra = Object.prototype.hasOwnProperty.call(content, meaningKey) ? content[meaningKey] :
    (Object.prototype.hasOwnProperty.call(content, key) ? content[key] : null)
  const stem = key.replace(/'/g, '').replace(/ /g, '-')
  const audioRoot = extra && extra.audioPackage ? '/' + extra.audioPackage : '/audio'
  return Object.assign({}, word, {
    emoji: wordEmoji(word.word),
    sentence: extra ? extra.sentence : '',
    sentenceMeaning: extra ? extra.meaning : '',
    fullSentence: extra ? extra.sentence.replace('___', word.word) : '',
    // 优先使用内置音频，避免旧库里的远端地址影响已支持的单词。
    audio: extra ? audioRoot + '/words/' + stem + '.mp3' : (word.audio_url || ''),
    slowAudio: extra ? audioRoot + '/words/' + stem + '-slow.mp3' : '',
    audioPackage: extra ? extra.audioPackage || '' : ''
  })
}

function availableType(word, requested, listening) {
  if (requested === 'listen' && (!listening || !word.audio)) return 'meaning'
  if (requested === 'pic' && word.emoji === '🧩') return 'translate'
  if (requested === 'cloze' && !word.sentence) return 'translate'
  if (requested === 'spell' && (!/^[a-z]+(?:[ '-][a-z]+)*$/i.test(word.word) || word.word.length > 20)) return 'meaning'
  return requested
}

function makeQuestion(word, words, requested, listening = true, random = Math.random) {
  const type = availableType(word, requested, listening)
  const field = type === 'meaning' ? 'translation' : 'word'
  const seenWords = new Set([normalize(word.word)])
  const seenLabels = new Set([normalize(word[field])])
  const distractors = []
  // 同形词、同义词不能成为另一个“错误答案”。
  shuffle(words.concat(FALLBACK), random).forEach((candidate) => {
    const key = normalize(candidate.word)
    const label = normalize(candidate[field])
    if (!key || !label || seenWords.has(key) || seenLabels.has(label) || distractors.length === 3) return
    seenWords.add(key)
    seenLabels.add(label)
    distractors.push({ label: candidate[field], correct: false })
  })
  const options = shuffle([{ label: word[field], correct: true }].concat(distractors), random)
    .map((option, index) => Object.assign({ key: 'option-' + index }, option))
  const chars = normalize(word.word).split('')
  const slots = chars.map((letter, index) => ({
    key: 'slot-' + index,
    fixed: !/[a-z]/.test(letter),
    letter: /[a-z]/.test(letter) ? '' : letter,
    tile: -1
  }))
  const letters = chars.filter((letter) => /[a-z]/.test(letter))
  const tiles = shuffle(letters, random).map((letter, index) => ({ key: 'tile-' + index, letter, used: false }))
  const sentence = (word.sentence || '').split('___')
  return Object.assign({}, TYPES[type], {
    type, word, options, slots, tiles,
    sentenceBefore: sentence[0] || '', sentenceAfter: sentence[1] || ''
  })
}

function makePlan(words, mode, listening, random = Math.random) {
  const rotation = shuffle(['pic', 'meaning', 'listen', 'spell', 'cloze'], random)
  return words.map((word, index) => makeQuestion(
    word, words, mode === 'mixed' ? rotation[index % rotation.length] : mode, listening, random
  ))
}

function makePairs(words, random = Math.random) {
  const seenWords = new Set()
  const seenMeanings = new Set()
  const unique = words.filter((word) => {
    const key = normalize(word.word)
    const meaning = normalize(word.translation)
    if (seenWords.has(key) || seenMeanings.has(meaning)) return false
    seenWords.add(key)
    seenMeanings.add(meaning)
    return true
  })
  // 分批呈现，由页面在完成后进入下一批；小屏最多显示 5 对。
  return {
    left: unique.map((word, index) => ({ key: 'left-' + index, pair: index, label: word.word, matched: false })),
    right: shuffle(unique.map((word, index) => ({ key: 'right-' + index, pair: index, label: word.translation, matched: false })), random)
  }
}

module.exports = { enrichWord, normalize, shuffle, makeQuestion, makePlan, makePairs }
