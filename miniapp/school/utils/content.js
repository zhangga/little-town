const SUBJECTS = [
  { id: 'chinese', name: '语文', mark: '字', title: '一笔一画，写好一个字', hint: '电脑用鼠标拖动，手机用手指写。', unit: '个字' },
  { id: 'math', name: '数学', mark: '算', title: '动动脑筋，算出答案', hint: '在答案框里输入数字，算好再检查。', unit: '道题' },
  { id: 'english', name: '英语', mark: 'Aa', title: '听一听，把单词拼出来', hint: '看中文、听发音，用键盘输入英文。', unit: '个词' }
]
const CHARACTERS = [
  { text: '人', pinyin: 'rén', meaning: '大人 · 人们' }, { text: '口', pinyin: 'kǒu', meaning: '人口 · 门口' },
  { text: '日', pinyin: 'rì', meaning: '日出 · 日子' }, { text: '月', pinyin: 'yuè', meaning: '月亮 · 月光' },
  { text: '山', pinyin: 'shān', meaning: '高山 · 山水' }, { text: '水', pinyin: 'shuǐ', meaning: '喝水 · 河水' },
  { text: '火', pinyin: 'huǒ', meaning: '火光 · 火苗' }, { text: '木', pinyin: 'mù', meaning: '木头 · 树木' },
  { text: '大', pinyin: 'dà', meaning: '大地 · 大小' }, { text: '小', pinyin: 'xiǎo', meaning: '小手 · 小鸟' }
]
const ENGLISH = [
  { word: 'apple', translation: '苹果' }, { word: 'cat', translation: '猫' }, { word: 'dog', translation: '狗' },
  { word: 'book', translation: '书' }, { word: 'sun', translation: '太阳' }, { word: 'bird', translation: '鸟' },
  { word: 'fish', translation: '鱼' }, { word: 'rabbit', translation: '兔子' }, { word: 'pencil', translation: '铅笔' },
  { word: 'school', translation: '学校' }
]
const MAX_ITEMS = 40
const EXAMPLES = {
  chinese: '日 月 山 水\n也可以写：春天来了',
  math: '3 + 5 =\n12 - 4 =\n6 × 3 =\n20 ÷ 5 =',
  english: 'apple 苹果\nbook 书\nice cream 冰淇淋'
}

function subjectInfo(subject) { return SUBJECTS.find(item => item.id === subject) || SUBJECTS[0] }
function normalized(value) {
  return String(value == null ? '' : value).replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).trim()
}
function mathProblem(source) {
  const line = normalized(source).replace(/[×xX]/g, '*').replace(/[÷]/g, '/').replace(/[−–]/g, '-')
  const match = line.match(/^(\d{1,3})\s*([+\-*/])\s*(\d{1,3})\s*(?:=\s*(?:[?？＿_□]|\d{1,4})?)?$/)
  if (!match) throw Error('数学每行写一道算式，例如 3 + 5 =；支持加、减、乘、除。')
  const left = Number(match[1]), right = Number(match[3]), operator = match[2]
  if (operator === '/' && (right === 0 || left % right !== 0)) throw Error('除法请用能整除的题目，除数不能是 0。')
  const answer = operator === '+' ? left + right : operator === '-' ? left - right : operator === '*' ? left * right : left / right
  if (answer < 0 || answer > 9999) throw Error('请添加答案在 0 到 9999 之间的整数算式。')
  const symbol = { '+': '+', '-': '−', '*': '×', '/': '÷' }[operator]
  return { text: left + ' ' + symbol + ' ' + right, answer: String(answer) }
}
function parseMaterial(subject, raw) {
  const source = normalized(raw)
  if (!source) throw Error('先填入要练的内容，再保存教材。')
  if (source.length > 2000) throw Error('每份教材最多 2000 个字符，请分成几份保存。')
  let items
  if (subject === 'chinese') {
    const chars = source.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []
    if (!chars.length) throw Error('语文教材里需要有汉字，例如：日 月 山 水。')
    items = [...new Set(chars)].map(text => CHARACTERS.find(item => item.text === text) || { text, pinyin: '', meaning: '来自我的教材' })
  } else if (subject === 'math') {
    items = source.split(/\n+/).filter(line => line.trim()).map(mathProblem)
  } else if (subject === 'english') {
    items = source.split(/\n+/).filter(line => line.trim()).map(line => {
      const match = line.trim().match(/^([A-Za-z]+(?:['’-][A-Za-z]+)*(?:\s+[A-Za-z]+(?:['’-][A-Za-z]+)*)*)\s*(?:[|｜:：,，\t]|\s)\s*(.+)$/)
      if (!match || !/[\u3400-\u9fff]/.test(match[2])) throw Error('英语每行写英文和中文，例如 apple 苹果；短语也可以。')
      if (match[1].trim().length > 80) throw Error('英文单词或短语最多 80 个字符，请拆成更短的练习。')
      return { word: match[1].trim().replace(/\s+/g, ' '), translation: match[2].trim() }
    })
  } else throw Error('请选择语文、数学或英语。')
  if (items.length > MAX_ITEMS) throw Error('一份教材最多 ' + MAX_ITEMS + ' 项，请分成几份保存。')
  return items
}
function makeMathRound(level = '20', count = 5, random = Math.random) {
  const max = level === '100' ? 100 : 20
  const integer = top => Math.min(top, Math.floor(Math.max(0, random()) * (top + 1)))
  const problems = [], seen = new Set()
  for (let attempt = 0; problems.length < count && attempt < count * 30; attempt++) {
    let source
    if (level === 'times') {
      const a = integer(8) + 1, b = integer(8) + 1
      source = attempt % 2 ? a * b + ' / ' + a : a + ' * ' + b
    } else {
      const a = integer(max), b = integer(max - a)
      source = attempt % 2 ? a + b + ' - ' + a : a + ' + ' + b
    }
    const problem = mathProblem(source)
    if (!seen.has(problem.text)) { seen.add(problem.text); problems.push(problem) }
  }
  // 即使随机源固定也能生成有限、完整的题组。
  for (let n = 0; problems.length < count; n++) {
    const problem = mathProblem(level === 'times' ? (n % 9 + 1) + ' * 2' : (n % max) + ' + 1')
    if (!seen.has(problem.text)) { seen.add(problem.text); problems.push(problem) }
  }
  return problems
}
function checkAnswer(subject, answer, item) {
  const value = normalized(answer)
  if (!value) return { empty: true, correct: false }
  if (subject === 'math') return { empty: false, correct: /^\d{1,5}$/.test(value) && Number(value) === Number(item.answer) }
  const clean = text => normalized(text).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ')
  return { empty: false, correct: [item.word].concat(item.aliases || []).some(form => clean(value) === clean(form)) }
}

module.exports = { SUBJECTS, CHARACTERS, ENGLISH, EXAMPLES, MAX_ITEMS, subjectInfo, mathProblem, parseMaterial, makeMathRound, checkAnswer }
