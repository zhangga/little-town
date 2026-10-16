const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const http = require('node:http')
const Module = require('node:module')
const { makeQuestion, makePairs } = require('../miniapp/utils/learning')
const testFile = path.resolve('scripts/learning-test.cjs')
const harnessModule = new Module(testFile)
harnessModule.filename = testFile
harnessModule.paths = Module._nodeModulePaths(path.dirname(testFile))
const testSource = fs.readFileSync(testFile, 'utf8')
harnessModule._compile(testSource.slice(0, testSource.indexOf('\ntest(')) + '\nmodule.exports = { pageHarness, words };', testFile)
const { pageHarness, words } = harnessModule.exports
const context = { window: {}, console: { ...console, log: (error) => { throw error } } }
vm.createContext(context)
vm.runInContext(fs.readFileSync('output/learn-compiled.js', 'utf8'), context)
const render = context.$gwx('miniapp\\pages\\learn\\learn.wxml')
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
function html(node) {
  if (node === null || node === undefined) return ''
  if (typeof node !== 'object') return escape(node)
  const children = (node.children || []).map(html).join('')
  if (!node.tag || node.tag === 'virtual') return children
  const original = node.tag.replace('wx-', '')
  const tag = original === 'text' ? 'span' : original === 'button' ? 'button' : original === 'switch' ? 'input' : 'div'
  const attrs = Object.entries(node.attr || {}).filter(([key, value]) => ['class', 'style', 'disabled', 'checked'].includes(key) && value !== false)
    .map(([key, value]) => key + '="' + escape(value) + '"').join(' ')
  return '<' + tag + ' ' + attrs + (original === 'switch' ? ' type="checkbox"' : '') + '>' + children + '</' + tag + '>'
}
;(async () => {
  const { page } = await pageHarness()
  const states = {}
  function save(name) { states[name] = JSON.parse(JSON.stringify(page.data)) }
  save('ready')
  page.onStart(); save('card')
  page.onFlip(); save('card-flipped')
  page.onCardContinue()
  for (const type of ['pic', 'meaning', 'listen', 'spell', 'cloze']) {
    const word = type === 'spell' ? words[8] : type === 'cloze' ? words[4] : words[0]
    page.setData({ phase: 'practice', question: makeQuestion(word, words.slice(0, 5), type), answered: false, saving: false, picked: -1 })
    save(type)
  }
  page.setData({ question: makeQuestion(words[24], words.slice(0, 5), 'meaning'), answered: true, isCorrect: true, lastReward: { bricks: 1, coins: 5 } }); save('correct')
  page.setData({ isCorrect: false }); save('wrong')
  page.startMatching(); save('match')
  page.setData({ phase: 'done', question: null, earned: { bricks: 15, coins: 35 }, stats: { right: 5, wrong: 0 }, bonus: { granted: true, bricks: 10 } }); save('done')
  page.onUnload()
  fs.writeFileSync('output/learning-preview-states.json', JSON.stringify(states, null, 2))
  let css = fs.readFileSync('miniapp/app.wxss', 'utf8') + '\n' + fs.readFileSync('miniapp/pages/learn/learn.wxss', 'utf8')
  css = css.replace(/(-?[\d.]+)rpx/g, (_, n) => (Number(n) / 2) + 'px').replace(/^page\s*\{/gm, '.phone {').replace(/> view/g, '> div')
  const rendered = {}
  for (const [name, state] of Object.entries(states)) {
    rendered[name] = html(render(state, {}))
    if (!rendered[name].includes('learn-page')) throw new Error('No rendered content: ' + name)
  }
  const server = http.createServer((req, res) => {
    const scene = new URL(req.url, 'http://localhost').searchParams.get('scene') || 'ready'
    const body = rendered[scene] || rendered.ready
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Little Town — ' + scene + '</title><style>html,body{margin:0;background:#edf0ed}*{box-sizing:border-box}button{font-family:inherit;cursor:pointer} .phone{width:375px;margin:auto;background:#A8DDF0}.phone .answer-dock{left:50%;right:auto;width:375px;transform:translateX(-50%);bottom:52px} .navbar{height:48px;background:#7FB8D6;color:white;text-align:center;padding:12px;font-weight:700}.scenes{font:13px sans-serif;padding:8px;display:flex;gap:8px;flex-wrap:wrap;max-width:375px;margin:auto}.tabbar{display:flex;justify-content:space-around;position:fixed;bottom:0;width:375px;height:52px;background:#FFFCF2;border-top:1px solid #ddd;padding-top:14px;font-size:13px}.phone .learn-page{min-height:calc(100vh - 120px);padding-bottom:75px}.audio-controls button{font-family:inherit}input[type=checkbox]{accent-color:#4E7A2E;width:28px;height:28px}' + css + '</style><nav class="scenes">' + Object.keys(states).map(name => '<a href="/?scene=' + name + '">' + name + '</a>').join('') + '</nav><div class="phone"><div class="navbar">学单词</div>' + body + '<div class="tabbar"><span>小镇</span><b>学单词</b><span>建造</span><span>我的</span></div></div>')
  })
  server.listen(9431, '127.0.0.1', () => console.log('Rendered ' + Object.keys(states).length + ' WXML states: http://127.0.0.1:9431'))
})().catch(error => { console.error(error); process.exitCode = 1 })
