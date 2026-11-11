const source = require('../data/photo-english')
const BATCH_SIZE = 5
const MODES = [
  { id: 'meaning', name: '认词选义' }, { id: 'listening', name: '听音选义' }, { id: 'spelling', name: '自己拼写' }
]
const stem = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const audioFor = text => '/coursebook-voice/audio/' + stem(text) + '.m4a'
const COURSES = source.map(course => Object.assign({}, course, {
  photo: '/coursebook/photos/' + course.id + '.jpg', count: course.words.length,
  words: course.words.map((item, index) => Object.assign({}, item, { courseID: course.id, courseWordID: course.id + ':' + index,
    audio: audioFor(item.word), audioPackage: '', solution: item.textbookForm,
    explanation: [item.textbookForm + '：' + item.translation + '。', item.note || '先听声音，再把字母、词义连起来记。',
      item.aliases.length ? '这张词卡的并列说法都可以作答：' + item.textbookForm + '。' : '合上词卡，自己拼一遍，再对照检查。'] }))
}))
function courseFor(id) { return COURSES.find(course => course.id === id) || null }
function courseWords(course, batch = 0) {
  if (!course || !Number.isInteger(batch) || batch < 0) return []
  return course.words.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE)
}
function shuffle(items, random) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))))
    const swap = result[i]; result[i] = result[j]; result[j] = swap
  }
  return result
}
function makeCourseRound(id, mode = 'meaning', batch = 0, random = Math.random) {
  const course = courseFor(id)
  if (!course || !MODES.some(item => item.id === mode)) return []
  return courseWords(course, batch).map(item => {
    if (mode === 'spelling') return Object.assign({}, item, { mode, kind: 'spell', prompt: '看中文，写出英文单词或短语' })
    // 同义词及楼层的英美同形说法不能互相充当错误选项。
    const forms = [item.word].concat(item.aliases).map(text => text.toLowerCase())
    const meanings = new Set([item.translation])
    const others = shuffle(course.words, random).filter(other => {
      if (meanings.has(other.translation) || [other.word].concat(other.aliases).some(text => forms.includes(text.toLowerCase()))) return false
      meanings.add(other.translation); return true
    }).slice(0, 3)
    return Object.assign({}, item, { mode, kind: 'choice', listening: mode === 'listening',
      prompt: mode === 'listening' ? '听发音，选出它的中文意思' : '这个英文单词或短语是什么意思？',
      display: mode === 'listening' ? '' : item.word, answer: item.translation,
      options: shuffle([item.translation].concat(others.map(other => other.translation)), random).map((label, index) => ({ id: String(index), label })) })
  })
}
function courseLibrary(progress = {}) {
  return COURSES.map(course => ({ id: course.id, label: course.label, title: course.title, name: course.name, mark: course.mark, count: course.count,
    practiced: course.words.filter(word => (progress[course.id] || {})[word.courseWordID]).length }))
}

module.exports = { COURSES, MODES, BATCH_SIZE, stem, audioFor, courseFor, courseWords, makeCourseRound, courseLibrary }
