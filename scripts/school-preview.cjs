#!/usr/bin/env node
// Render real school WXML/WXSS; the drawing sample runs the production handwriting module.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const os = require('node:os')
const http = require('node:http')
const { spawnSync } = require('node:child_process')
const { createClassroomPage } = require('../miniapp/school/utils/classroom-page')
const { mathProblem } = require('../miniapp/school/utils/content')
const { rewardPatch } = require('../miniapp/school/utils/classroom-rewards')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'output/school-preview')
const pageFile = 'miniapp/school/pages/classroom/classroom.wxml'
const compilerDir = process.env.WECHAT_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec'
const clone = value => JSON.parse(JSON.stringify(value))
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const responsive = value => String(value).replace(/(-?[\d.]+)rpx/g, (_, n) => 'calc(' + n + ' * var(--rpx))')

function compile(binary, files) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'little-town-school-'))
  try {
    const target = path.join(scratch, 'compiled')
    const result = spawnSync(path.join(compilerDir, binary), ['-o', target, ...files], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (result.error || result.status !== 0) throw Error(binary + ' failed: ' + (result.error || result.stderr || result.stdout))
    return fs.readFileSync(target, 'utf8')
  } finally { fs.rmSync(scratch, { recursive: true, force: true }) }
}
function html(node) {
  if (node == null) return ''
  if (typeof node !== 'object') return escape(node)
  const children = (node.children || []).map(html).join('')
  if (!node.tag || node.tag === 'virtual') return children
  const original = node.tag.replace(/^wx-/, '')
  const tag = { button: 'button', canvas: 'canvas', input: 'input', textarea: 'textarea', image: 'img' }[original] || node.tag
  const attrs = Object.entries(node.attr || {}).filter(([key, value]) => value !== false && value != null &&
    (/^(class|style|id|src|disabled|value|placeholder|type|maxlength)$/.test(key) || /^(aria-|data-)/.test(key)))
    .filter(([key]) => !(tag === 'canvas' && key === 'type'))
    .map(([key, value]) => key === 'disabled' ? 'disabled' : key + '="' + escape(key === 'style' ? responsive(value) : value) + '"').join(' ')
  return '<' + tag + (attrs ? ' ' + attrs : '') + '>' + (['input', 'img'].includes(tag) ? '' : (tag === 'textarea' ? escape(node.attr && node.attr.value || '') : children) + '</' + tag + '>')
}
function browserCSS(source) {
  return responsive(source.replace(/%%\?(-?[\d.]+rpx)\?%%/g, '$1').replace(/%%HERESUFFIX%%/g, '')
    .replace(/\bwx-button\b/g, 'button').replace(/\bwx-canvas\b/g, 'canvas').replace(/\bwx-input\b/g, 'input').replace(/\bwx-textarea\b/g, 'textarea').replace(/\bwx-image\b/g, 'img'))
}
function states() {
  const storage = { token: 'preview', userInfo: { id: 1 } }
  const wxApi = { getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value }, nextTick: fn => fn(), pageScrollTo() {} }
  const noop = () => {}
  const definition = createClassroomPage(wxApi, { createAudio: () => ({ play: noop, stop: noop }),
    createRewards: () => ({ begin: () => ({}), answer: noop, complete: noop, refresh: noop, stop: noop }),
    createPad: (_, __, state) => ({ init: () => state({ canvasReady: true }), reset: noop, suspend: noop, destroy: noop, end: noop }) })
  const page = { ...definition, data: clone(definition.data), setData(patch, done) { Object.assign(this.data, patch); if (done) done() } }
  page.onLoad({}); page.onShow()
  const statuses = Object.fromEntries(['chinese', 'math', 'english'].map(subject => [subject, { subject,
    daily_goal: 10, daily_brick_cap: 20, bricks_per_correct: 1, bricks_today: subject === 'english' ? 20 : subject === 'math' ? 6 : 0,
    bonus_bricks: 10, completed_today: subject === 'english' ? 20 : subject === 'math' ? 6 : 0, bonus_claimed: subject === 'english',
    practice_rewards: { remaining_rounds: subject === 'english' ? 0 : 12, daily_round_cap: 12, bricks_per_round: 4, coins_per_round: 12 } }]))
  page.setData(rewardPatch(statuses, 'chinese'))
  const scenes = {}, save = name => { scenes[name] = clone(page.data) }, tap = subject => ({ currentTarget: { dataset: { subject } } })
  save('01-chinese-home'); page.onSubject(tap('math')); save('02-math-home'); page.onSubject(tap('english')); save('03-english-home')
  page.onSubject(tap('chinese')); page.onStart(); save('04-handwriting')
  page.startRound('math', [mathProblem('12+8'), mathProblem('16-9')], '20 以内加减法', ''); save('05-math-question')
  page.onAnswer({ detail: { value: '19' } }); page.onCheck(); save('06-math-feedback')
  page.startRound('english', [{ word: 'apple', translation: '苹果' }], '生活里的单词', ''); save('07-english-question')
  page.onAnswer({ detail: { value: 'apple' } }); page.onCheck(); page.onNext(); save('08-completed')
  page.onMaterials(); save('09-empty-materials'); page.onAddMaterial(); save('10-photo-editor')
  page.onSubject(tap('math')); page.setData({ draftTitle: '今天的口算', draftText: '12 + 8 =\n16 - 9 =', draftCount: 2, error: '照片没有保存成功，请重新选择照片后再试。' }); save('11-editor-retry')
  page.onMaterials(); page.setData({ lessons: [{ id: 'preview', subject: 'chinese', subjectName: '语文', title: '老师今天教的字', text: '日 月 山 水 人', count: 5, photo: '' }], lessonCount: 1 }); save('12-materials')
  const activity = mode => page.onActivity({ currentTarget: { dataset: { mode } } })
  page.onSubject(tap('chinese')); activity('pinyin'); save('13-pinyin'); activity('words'); save('14-words'); activity('reading'); save('15-reading')
  page.onSubject(tap('math')); activity('compare'); save('16-compare'); activity('missing'); save('17-missing'); activity('story'); save('18-story')
  page.onSubject(tap('english')); activity('listening'); save('19-listening'); activity('sentence')
  page.onOrderPick({ currentTarget: { dataset: { id: '0' } } }); save('20-sentence')
  page.onStartDrill()
  for (let index = 0; index < 5; index++) {
    const q = page.data.question
    if (q.listening) page.setData({ heardAudio: true })
    if (q.kind === 'choice') page.onChoice({ currentTarget: { dataset: { id: q.options.find(o => o.label === q.answer).id } } })
    else if (q.kind === 'order') q.tokens.slice().sort((a, b) => Number(a.id) - Number(b.id)).forEach(token => page.onOrderPick({ currentTarget: { dataset: { id: token.id } } }))
    else page.onAnswer({ detail: { value: q.word || q.answer } })
    page.onCheck(); page.onNext()
  }
  save('21-classroom-summary'); page.onLectures(); save('22-lecture-library')
  page.onOpenLecture({ currentTarget: { dataset: { id: 'sentence' } } }); save('23-lecture')
  page.setData({ lectureAudioState: 'paused', lectureProgress: 54 }); save('24-lecture-paused')
  page.onSubject(tap('math')); activity('story'); page.onHelp(); save('25-question-help')
  page.onListenHelp(); save('26-method-lecture')
  page.onSubject(tap('math')); page.onRewardPractice(); save('27-reward-review')
  page.changeView('done', { correct: 10, mistakeCount: 0, scoredTotal: 10, roundRewardBricks: 4, roundRewardCoins: 12, roundRewardSettled: true,
    summaryRows: [{ mode: 'arithmetic', name: '数字口算', total: 4, correct: 4 }, { mode: 'compare', name: '比大小', total: 2, correct: 2 }, { mode: 'missing', name: '算式补空', total: 2, correct: 2 }, { mode: 'story', name: '生活应用题', total: 2, correct: 2 }] }); save('28-reward-completed')
  page.setData({ roundRewardSettled: false, roundRewardBricks: 0, roundRewardCoins: 0, rewardPending: 1, rewardError: '网络刚才断开了，奖励还在等待确认。' }); save('29-reward-retry')
  page.setData({ rewardError: '', rewardPending: 0 }); page.onSubject(tap('english')); save('30-reward-capped')
  page.onUnload(); return scenes
}
function buildPreview() {
  fs.mkdirSync(output, { recursive: true })
  const context = vm.createContext({ window: {}, console: { log(...args) { throw Error(args.join(' ')) } } })
  vm.runInContext(compile('wcc', [pageFile]), context)
  const render = context.$gwx(pageFile)
  if (typeof render !== 'function') throw Error('School WXML did not compile')
  const css = ['miniapp/app.wxss', 'miniapp/school/pages/classroom/classroom.wxss'].map(file => browserCSS(compile('wcsc', [file]))).join('\n')
  const scenes = states()
  const base = ':root{--rpx:calc(100vw / 750)}*{box-sizing:border-box}html,body{margin:0;background:#f6f0df}wx-view,wx-label{display:block}wx-text{display:inline}button,input,textarea{font:inherit;color:inherit}button{display:block;border:0;cursor:pointer}button:disabled{cursor:default}input{width:100%;outline:0}textarea{resize:none}canvas{touch-action:none}img{object-fit:contain}button:focus-visible{outline:3px solid #d2962a;outline-offset:2px}'
  for (const [name, state] of Object.entries(scenes)) {
    const body = html(render(state, {}))
    fs.writeFileSync(path.join(output, name + '.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小镇学校 · ' + name + '</title><style>' + base + css + '</style></head><body>' + body + '<script>window.previewLecture=' + JSON.stringify(state.view === 'lecture' ? state.lecture : null).replace(/</g, '\\u003c') + ';</script><script src="handwriting.js"></script><script src="canvas-preview.js"></script><script src="lesson-player.js"></script><script src="lecture-preview.js"></script></body></html>')
  }
  fs.writeFileSync(path.join(output, 'handwriting.js'), 'var module={exports:{}};\n' + fs.readFileSync(path.join(root, 'miniapp/school/utils/handwriting.js'), 'utf8'))
  fs.writeFileSync(path.join(output, 'canvas-preview.js'), `
const canvas = document.getElementById('writing-canvas');
if(canvas){
  window.padState={};
  const wxApi={getWindowInfo:()=>({pixelRatio:devicePixelRatio}),createSelectorQuery:()=>({in(){return this},select(){return this},fields(){return this},exec(fn){const r=canvas.getBoundingClientRect();fn([{node:canvas,width:r.width,height:r.height}])}})};
  window.pad=module.exports.createHandwriting({},wxApi,patch=>Object.assign(window.padState,patch));
  pad.reset('人');pad.init();
  const local=e=>{const r=canvas.getBoundingClientRect();return {touches:[{x:e.clientX-r.left,y:e.clientY-r.top}]}};
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pad.start(local(e))});
  canvas.addEventListener('pointermove',e=>{if(e.buttons)pad.move(local(e))});
  canvas.addEventListener('pointerup',()=>pad.end());canvas.addEventListener('pointercancel',()=>pad.end());
  const buttons=document.querySelectorAll('.writing-tools button');
  buttons.forEach(b=>b.disabled=false);buttons[0].onclick=()=>pad.undo();buttons[1].onclick=()=>pad.clear();
  let guide=true;buttons[2].onclick=()=>{guide=!guide;pad.toggleGuide(guide);buttons[2].textContent=guide?'隐藏范字':'显示范字'};
  window.addEventListener('resize',()=>pad.init());
}`)
  fs.copyFileSync(path.join(root, 'scripts/school-lecture-preview.js'), path.join(output, 'lecture-preview.js'))
  fs.writeFileSync(path.join(output, 'lesson-player.js'), 'var lectureModule={exports:{}};\n(function(module,require){\n' + fs.readFileSync(path.join(root, 'miniapp/school/utils/lesson-player.js'), 'utf8') + '\n})(lectureModule,()=>({setSpeechActive(){}}));')
  fs.cpSync(path.join(root, 'miniapp/school/audio'), path.join(output, 'audio'), { recursive: true })
  fs.writeFileSync(path.join(output, 'states.json'), JSON.stringify(scenes, null, 2))
  fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小镇学校预览</title><style>body{font:16px sans-serif;max-width:640px;margin:40px auto;padding:24px}li{margin:16px 0}a{color:#355b4c}</style><h1>小镇学校 · 真实模板预览</h1><p>来自实际小程序 WXML/WXSS。写字板和小讲播调用产品同一套逻辑，可写、可听、可暂停；其余按钮为布局展示。请用 320–430px 视口检查。</p><ul>' + Object.keys(scenes).map(name => '<li><a href="' + name + '.html">' + name + '</a></li>').join('') + '</ul></html>')
  console.log('Compiled school WXML/WXSS: ' + Object.keys(scenes).length + ' scenes → ' + output)
}
function serve(port) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.m4a': 'audio/mp4' }
  http.createServer((req, res) => {
    let file
    try { file = path.resolve(output, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)) } catch (_) { res.writeHead(400).end(); return }
    if (file === output) file = path.join(output, 'index.html')
    if (!file.startsWith(output + path.sep)) { res.writeHead(403).end(); return }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store')
    fs.createReadStream(file).pipe(res)
  }).listen(port, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + port))
}
if (require.main === module) {
  buildPreview()
  const index = process.argv.indexOf('--serve')
  if (index >= 0) serve(Number(process.argv[index + 1]) || 9434)
}
module.exports = { buildPreview }
