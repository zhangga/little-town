const { CHARACTERS, ENGLISH, makeMathRound, checkAnswer } = require('./content')
const { enrichWord } = require('../../utils/learning')
const LESSONS = require('../data/mini-lessons')

const MODES = {
  chinese: [
    { id: 'writing', name: '田字格写字', icon: '字', note: '鼠标 / 手指慢慢写' },
    { id: 'pinyin', name: '拼音找朋友', icon: 'ā', note: '看汉字，认读音' },
    { id: 'words', name: '词语填空', icon: '词', note: '把词放进句子里' },
    { id: 'reading', name: '短文小侦探', icon: '读', note: '在短文里找答案' }
  ],
  math: [
    { id: 'arithmetic', name: '数字口算', icon: '算', note: '输入数字算一算' },
    { id: 'compare', name: '比大小', icon: '≶', note: '先计算，再比较' },
    { id: 'missing', name: '算式补空', icon: '□', note: '找到藏起来的数字' },
    { id: 'story', name: '生活应用题', icon: '题', note: '买东西、分点心' }
  ],
  english: [
    { id: 'spelling', name: '单词拼写', icon: 'Aa', note: '听一听，自己拼' },
    { id: 'meaning', name: '词义配对', icon: '↔', note: '英文中文配成对' },
    { id: 'listening', name: '听音选意思', icon: '♫', note: '用耳朵来认单词' },
    { id: 'sentence', name: '句子小积木', icon: '▤', note: '点词语，排成句子' }
  ]
}
const WORD_CLOZE = [
  ['晚上，天空中有一轮（ ）。', '月亮', ['书本', '铅笔', '雨伞'], '“晚上”和“一轮”是线索，填“月亮”最合适。'],
  ['下雨了，出门要带上（ ）。', '雨伞', ['月亮', '石头', '星星'], '下雨时，雨伞能帮我们挡雨。'],
  ['小鱼在（ ）里游来游去。', '水', ['火', '云', '沙'], '小鱼生活在水里，游泳也需要水。'],
  ['我用（ ）在本子上写字。', '铅笔', ['饭碗', '皮球', '树叶'], '本子上写字要用笔，铅笔是一种写字工具。'],
  ['天气很冷，我穿上厚厚的（ ）。', '棉衣', ['凉鞋', '短裤', '泳衣'], '“很冷”和“厚厚的”说明需要保暖的棉衣。'],
  ['小鸟展开（ ），飞上蓝天。', '翅膀', ['尾巴', '嘴巴', '爪子'], '小鸟展开翅膀飞行，展开嘴巴或爪子都不能代替翅膀。'],
  ['早晨，我先刷牙，再吃（ ）。', '早饭', ['午饭', '晚饭', '夜宵'], '时间是早晨，所以吃的是早饭。'],
  ['树上长着绿绿的（ ）。', '叶子', ['雪花', '石头', '铅笔'], '叶子长在树上，绿绿的也是叶子的常见颜色。']
]
const READINGS = [
  ['小雨在院子里种了一棵小树。每天放学后，她都给小树浇水。', '小雨把小树种在哪里？', '院子里', ['教室里', '河边', '山顶'], '原文第一句说“在院子里种了一棵小树”。'],
  ['星期天，乐乐和爸爸去图书馆。乐乐借了一本讲星星的书，回家后认真地读起来。', '乐乐借了什么书？', '讲星星的书', ['教做饭的书', '画小狗的书', '讲火车的书'], '第二句写的是“一本讲星星的书”。'],
  ['早上，天上飘起小雨。小禾带上雨伞，穿好雨鞋，准备去上学。', '小禾为什么带雨伞？', '因为下雨了', ['因为要画画', '因为天气很热', '因为要踢球'], '开头说“天上飘起小雨”，这就是带雨伞的原因。'],
  ['果园里，爷爷摘下三个苹果。奶奶把苹果洗干净，放进盘子里。', '是谁把苹果洗干净的？', '奶奶', ['爷爷', '小鸟', '老师'], '第二句的开头是“奶奶把苹果洗干净”。'],
  ['小猫先在树下打了个盹，接着跑到草地上追蝴蝶，最后回家喝水。', '小猫最后做了什么？', '回家喝水', ['在树下睡觉', '追蝴蝶', '爬到树上'], '看到“最后”两个字，它后面说的是“回家喝水”。'],
  ['操场上，明明跑步，安安跳绳。铃声响了，他们收好东西，一起回教室。', '铃声响后，他们去了哪里？', '教室', ['食堂', '公园', '商店'], '最后一句说他们“一起回教室”。']
]
const SENTENCES = [
  ['我有一本书。', ['I', 'have', 'a', 'book.'], '先说谁：I；再说有：have；最后是一本书：a book。'],
  ['这是一只猫。', ['This', 'is', 'a', 'cat.'], '先用 This is 表示“这是”，再接 a cat。'],
  ['我喜欢苹果。', ['I', 'like', 'apples.'], 'I 是“我”，like 是“喜欢”，apples 是“苹果”的复数。'],
  ['那是一只狗。', ['That', 'is', 'a', 'dog.'], 'That is 表示“那是”，后面放 a dog。'],
  ['我看见太阳。', ['I', 'see', 'the', 'sun.'], '先说 I see（我看见），再接 the sun（太阳）。'],
  ['这是我的铅笔。', ['This', 'is', 'my', 'pencil.'], 'This is 表示“这是”，my pencil 表示“我的铅笔”。']
]
const DEFAULT_MODE = { chinese: 'writing', math: 'arithmetic', english: 'spelling' }
function shuffled(items, random = Math.random) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))))
    const temp = result[i]; result[i] = result[j]; result[j] = temp
  }
  return result
}
function choice(prompt, display, answer, others, mode, explanation, random) {
  return { kind: 'choice', mode, prompt, display, answer,
    options: shuffled([answer].concat(others), random).map((label, index) => ({ id: String(index), label })),
    explanation: [explanation], solution: answer }
}
function mathExplanation(item) {
  const match = item.text && item.text.match(/^(\d+)\s*([+−×÷])\s*(\d+)$/)
  if (!match) return ['先找出已知的数量，再看题目要求什么。', '算好以后，把答案放回题目检查。']
  const a = Number(match[1]), b = Number(match[3]), op = match[2], answer = item.answer
  const meaning = { '+': '把 ' + a + ' 和 ' + b + ' 两部分合起来。', '−': '原来有 ' + a + '，拿走 ' + b + '，求还剩多少。',
    '×': a + ' 个 ' + b + ' 相加，可以用乘法计算。', '÷': '把 ' + a + ' 平均分成 ' + b + ' 份，求每份是多少。' }
  const check = op === '+' ? answer + ' − ' + b + ' = ' + a : op === '−' ? answer + ' + ' + b + ' = ' + a : op === '×' ? answer + ' ÷ ' + b + ' = ' + a : answer + ' × ' + b + ' = ' + a
  return [meaning[op], item.text + ' = ' + answer, b === 0 && op === '×' ? '任何非负整数乘 0，都等于 0。' : '倒着检查：' + check]
}
function normalizeQuestion(subject, item) {
  const mode = item.mode || DEFAULT_MODE[subject]
  const question = Object.assign({}, item, { mode, modeName: (MODES[subject].find(m => m.id === mode) || MODES[subject][0]).name,
    kind: item.kind || (subject === 'chinese' ? 'writing' : subject === 'math' ? 'number' : 'spell') })
  if (subject === 'english' && item.word) Object.assign(question, enrichWord(item))
  question.topicID = mode
  if (!question.hint) question.hint = { chinese: '先看清题目，再轻声读一读。', math: '先想数量怎么变化，再选择合适的方法。', english: '先想一想意思，也可以再听一次发音。' }[subject]
  if (!question.explanation) question.explanation = subject === 'math' ? mathExplanation(question) : subject === 'chinese'
    ? ['看清“' + question.text + '”在田字格里的位置。', '对照范字慢慢写，写好一笔再抬起。', '检查有没有漏笔，大小是否合适。']
    : ['这个词是 ' + question.word + '，意思是“' + question.translation + '”。', '按顺序检查：' + Array.from(question.word).join(' · '), '再听一遍，合上讲解自己拼一遍。']
  if (!question.solution) question.solution = subject === 'math' ? question.text + ' = ' + question.answer : question.word || question.text
  return question
}
function generateBank(subject, mode, level, random) {
  if (mode === 'writing') return CHARACTERS
  if (mode === 'spelling') return ENGLISH
  if (mode === 'pinyin') return CHARACTERS.map(char => choice('给这个字找到正确的拼音', char.text, char.pinyin,
    shuffled(CHARACTERS.filter(other => other.pinyin !== char.pinyin), random).slice(0, 3).map(other => other.pinyin), mode,
    '“' + char.text + '”读 ' + char.pinyin + '，可以组词：' + char.meaning + '。', random))
  if (mode === 'words') return WORD_CLOZE.map(([prompt, answer, others, explain]) => choice(prompt, '', answer, others, mode, explain, random))
  if (mode === 'reading') return READINGS.map(([passage, prompt, answer, others, explain]) => Object.assign(choice(prompt, '', answer, others, mode, explain, random), { passage }))
  if (mode === 'meaning' || mode === 'listening') return ENGLISH.map(word => Object.assign(choice(mode === 'listening' ? '听发音，选出它的中文意思' : '这个英文单词是什么意思？', mode === 'listening' ? '' : word.word,
    word.translation, shuffled(ENGLISH.filter(other => other.translation !== word.translation), random).slice(0, 3).map(other => other.translation), mode,
    word.word + ' 的意思是“' + word.translation + '”。把声音、字母和意思连起来记。', random), word, { listening: mode === 'listening' }))
  if (mode === 'sentence') return SENTENCES.map(([translation, tokens, explanation]) => ({ kind: 'order', mode, prompt: '点下面的词，把句子排好', translation,
    tokens: shuffled(tokens.map((text, id) => ({ id: String(id), text })), random), answer: tokens.join(' '), solution: tokens.join(' '), explanation: [explanation, '完整句子：' + tokens.join(' ')] }))
  const sums = makeMathRound(level, 5, random)
  if (mode === 'arithmetic') return sums
  if (mode === 'compare') return sums.map((sum, index) => {
    const left = Number(sum.answer), right = Math.min(level === '100' ? 100 : level === 'times' ? 81 : 20, Math.max(0, left + [-2, 3, 0, 1, -1][index]))
    const relation = left > right ? '>' : left < right ? '<' : '='
    return choice('选一个符号，让两边的关系正确', sum.text + ' ○ ' + right, relation, ['>', '<', '='].filter(value => value !== relation), mode,
      '先算左边：' + sum.text + ' = ' + left + '。再比较：' + left + ' ' + relation + ' ' + right + '。', random)
  })
  // 补空使用加减关系；选择乘除难度时也保持这项玩法的“找部分”教学目标。
  const additions = makeMathRound(level === '100' ? '100' : '20', 5, random)
  if (mode === 'missing') return additions.map(sum => {
    const [a, b] = sum.text.match(/\d+/g).map(Number), plus = sum.text.includes('+'), total = plus ? a + b : a
    const text = plus ? '□ + ' + b + ' = ' + total : a + ' − □ = ' + sum.answer
    const answer = String(plus ? a : b)
    return { kind: 'number', mode, text, answer, prompt: '空格里应该填几？', solution: '□ = ' + answer,
      explanation: [plus ? '总数减去已经知道的部分。' : '原来的数量减去剩下的，得到拿走的。', (plus ? total + ' − ' + b : a + ' − ' + sum.answer) + ' = ' + answer, '填回检查：' + text.replace('□', answer)] }
  })
  if (mode === 'story') return sums.map(sum => {
    const [a, b] = sum.text.match(/\d+/g).map(Number)
    const prompt = sum.text.includes('+') ? '盒子里原来有 ' + a + ' 支铅笔，又放进 ' + b + ' 支。现在一共有多少支？' : sum.text.includes('−') ? '盘子里有 ' + a + ' 个苹果，拿走了 ' + b + ' 个。还剩多少个？' : sum.text.includes('×') ? '有 ' + a + ' 盒点心，每盒 ' + b + ' 块。一共有多少块点心？' : '把 ' + a + ' 块点心平均分给 ' + b + ' 个小朋友。每人分到多少块？'
    return { kind: 'number', mode, text: sum.text, prompt, hideExpression: true, answer: sum.answer, solution: sum.text + ' = ' + sum.answer, explanation: mathExplanation(sum) }
  })
  return []
}
function makeActivityRound(subject, mode, level = '20', offset = 0, random = Math.random) {
  if (!MODES[subject] || !MODES[subject].some(item => item.id === mode)) return []
  const bank = generateBank(subject, mode, level, random)
  return Array.from({ length: Math.min(5, bank.length) }, (_, index) => normalizeQuestion(subject, bank[((Number(offset) || 0) + index) % bank.length]))
}
function makeClassroomRound(subject, level, offset = 0, random = Math.random) {
  const route = { chinese: ['pinyin', 'words', 'reading', 'pinyin', 'reading'], math: ['arithmetic', 'compare', 'missing', 'story', 'arithmetic'], english: ['meaning', 'listening', 'sentence', 'spelling', 'listening'] }[subject]
  return route.map((mode, index) => makeActivityRound(subject, mode, level, offset + index, random)[0])
}
function checkQuestion(subject, answer, question) {
  if (question.kind === 'choice' || question.kind === 'order') return { empty: !String(answer || '').trim(), correct: answer === question.answer }
  return checkAnswer(question.kind === 'number' ? 'math' : subject, answer, question)
}
function lessonFor(id) { return LESSONS.find(lesson => lesson.id === id) || null }
function lessonsFor(subject) { return LESSONS.filter(lesson => lesson.subject === subject) }

module.exports = { MODES, LESSONS, DEFAULT_MODE, normalizeQuestion, makeActivityRound, makeClassroomRound, checkQuestion, lessonFor, lessonsFor }
