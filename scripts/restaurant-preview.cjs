#!/usr/bin/env node
// Compile the actual kitchen WXML/WXSS with deterministic page data.
// node scripts/restaurant-preview.cjs [--states states.json] [--state-module states.cjs] [--serve 9433]
// Set WECHAT_COMPILER_DIR when WeChat Developer Tools is installed elsewhere.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const http = require('node:http')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'output/restaurant-preview')
const pageFile = 'miniapp/kitchen/pages/restaurant/restaurant.wxml'
const compilerDir = process.env.WECHAT_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec'
const clone = value => JSON.parse(JSON.stringify(value))
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const responsive = value => String(value).replace(/(-?[\d.]+)rpx/g, (_, value) => 'calc(' + value + ' * var(--rpx))')

function dependencies(file, kind, found = new Set()) {
  if (found.has(file)) return found
  found.add(file)
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const pattern = kind === 'wxml' ? /<(?:import|include)\b[^>]*\bsrc=["']([^"']+)["']/g : /@import\s+["']([^"']+)["']/g
  for (const match of source.matchAll(pattern)) {
    const resolved = match[1].startsWith('/') ? 'miniapp' + match[1] : path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))
    dependencies(resolved, kind, found)
  }
  return found
}

function compile(binary, files) {
  const executable = path.join(compilerDir, binary)
  if (!fs.existsSync(executable)) throw Error('WeChat compiler not found: ' + executable + '. Set WECHAT_COMPILER_DIR to its directory.')
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'little-town-restaurant-'))
  try {
    const compiled = path.join(scratch, binary + '-compiled')
    const result = spawnSync(executable, ['-o', compiled, ...files], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (result.error || result.status !== 0) throw Error(binary + ' failed: ' + (result.error || result.stderr || result.stdout))
    return fs.readFileSync(compiled, 'utf8')
  } finally { fs.rmSync(scratch, { recursive: true, force: true }) }
}

function html(node) {
  if (node === null || node === undefined) return ''
  if (typeof node !== 'object') return escape(node)
  const children = (node.children || []).map(html).join('')
  if (!node.tag || node.tag === 'virtual') return children
  const original = node.tag.replace(/^wx-/, '')
  const tag = { image: 'img', button: 'button', input: 'input', textarea: 'textarea', switch: 'input' }[original] || node.tag
  const attrs = Object.entries(node.attr || {}).filter(([key, value]) => value !== false && value !== undefined && value !== null &&
    (/^(?:class|style|id|src|alt|disabled|checked|value|placeholder|type|role|tabindex|maxlength|scroll-y|scroll-x|mode)$/.test(key) || /^(aria-|data-)/.test(key)))
    .map(([key, value]) => {
      if (key === 'style') value = responsive(value)
      if (key === 'src' && String(value).startsWith('/images/')) value = '../../miniapp' + value
      if (key === 'disabled' || key === 'checked') return key
      return key + '="' + escape(value) + '"'
    }).join(' ')
  const extra = original === 'switch' ? ' type="checkbox"' : original === 'button' ? ' type="button"' : ''
  return '<' + tag + (attrs ? ' ' + attrs : '') + extra + '>' + (tag === 'img' || tag === 'input' ? '' : children + '</' + tag + '>')
}

function browserCSS(source) {
  return responsive(source.replace(/%%\?(-?[\d.]+rpx)\?%%/g, '$1').replace(/%%HERESUFFIX%%/g, '')
    .replace(/\bwx-button\b/g, 'button').replace(/\bwx-image\b/g, 'img').replace(/\bwx-input\b/g, 'input').replace(/\bwx-textarea\b/g, 'textarea'))
}

function fixture() {
  const dish = {
    name: '小熊春游便当', box_shape: 'square', box_color: 'peach', decoration: 'flower',
    portions: [
      { ingredient: 'rice', x: 32, y: 33, style: 'bear' },
      { ingredient: 'egg', x: 67, y: 30, style: 'star' },
      { ingredient: 'broccoli', x: 72, y: 56, style: 'plain' },
      { ingredient: 'corn', x: 49, y: 65, style: 'plain' },
      { ingredient: 'carrot', x: 27, y: 65, style: 'plain' },
      { ingredient: 'strawberry', x: 73, y: 77, style: 'plain' }
    ]
  }
  return {
    recipes: [
      { id: 'preview-picnic', dish, served_count: 3, first_taster: '阿布', last_feedback: '你还记得我喜欢玉米！小熊饭团真可爱。' },
      { id: 'preview-garden', dish: { ...clone(dish), name: '奶奶的花园便当', box_shape: 'round', box_color: 'mint', decoration: 'sesame', portions: [
        { ingredient: 'rice', x: 35, y: 37, style: 'plain' }, { ingredient: 'broccoli', x: 63, y: 36, style: 'plain' },
        { ingredient: 'egg', x: 35, y: 64, style: 'star' }, { ingredient: 'corn', x: 65, y: 62, style: 'plain' }
      ] }, served_count: 1, first_taster: '林奶奶', last_feedback: '有我喜欢的西兰花，谢谢你。' }
    ],
    signature_ids: ['preview-picnic', 'preview-garden'],
    residents: [
      { id: 'abu', name: '阿布', icon: '👦', preference: 'corn', visits: 3, last_dish_name: '小熊春游便当', last_feedback: '你还记得我喜欢玉米！', order: { id: 'abu-3', kind: 'wish', text: '今天要去野餐，我想吃有玉米的便当。', preferred_ingredient: 'corn', recipe_id: '' } },
      { id: 'taotao', name: '桃桃', icon: '👧', preference: 'strawberry', visits: 1, last_dish_name: '小熊春游便当', last_feedback: '小熊饭团真可爱。', order: { id: 'taotao-1', kind: 'signature', text: '上次的小熊春游便当真好吃，我还想再吃一次！', preferred_ingredient: 'strawberry', recipe_id: 'preview-picnic' } },
      { id: 'lin', name: '林奶奶', icon: '👵', preference: 'broccoli', visits: 2, last_dish_name: '奶奶的花园便当', last_feedback: '谢谢你准备的西兰花。', order: { id: 'lin-2', kind: 'surprise', text: '今天你当主厨，让我尝尝你的新作品吧。', preferred_ingredient: 'broccoli', recipe_id: '' } }
    ],
    recent_services: []
  }
}

async function defaultStates() {
  const { createRestaurantPage } = require('../miniapp/kitchen/utils/restaurant-page')
  const state = fixture()
  const storage = { token: 'preview', userInfo: { id: 1 } }
  const wxApi = {
    getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value }, removeStorageSync: key => { delete storage[key] },
    showToast() {}, navigateBack() {}, switchTab() {}
  }
  const definition = createRestaurantPage({ get: async () => clone(state) }, wxApi, () => {}, () => {})
  const page = { ...definition, data: clone(definition.data), setData(patch, done) { Object.assign(this.data, patch); if (done) done() } }
  const states = {}
  const record = (name, patch = {}) => { page.setData(patch); states[name] = clone(page.data) }
  page.applyState({ recipes: [], signature_ids: [], residents: state.residents, recent_services: [] })
  record('01-empty-kitchen', { loading: false })
  page.applyState(state)
  page.setDish(clone(state.recipes[0].dish), { editingRecipeID: '' })
  page.onResidentSelect({ currentTarget: { dataset: { id: 'abu' } } })
  record('02-full-bento', { selectedPortionIndex: 0, selectedPortion: clone(state.recipes[0].dish.portions[0]) })
  page.onResidentSelect({ currentTarget: { dataset: { id: 'taotao' } } })
  record('03-signature-order')
  record('04-recipe-book', { tab: 'menu', selectedPortionIndex: -1, selectedPortion: null })
  record('05-resident-feedback', { tab: 'kitchen', serviceResult: {
    request_id: 'preview-service', resident_id: 'abu', resident_name: '阿布', dish: clone(state.recipes[0].dish), recipe_id: 'preview-picnic',
    feedback: '你还记得我喜欢玉米！小熊饭团真可爱，明天我想带桃桃一起来。', preferred: true
  } })
  record('06-pending-recovery', { serviceResult: null, busy: false, pending: { message: '刚才的上菜还在确认中，你的便当已经保存。' }, error: '' })
  record('07-loading', { pending: null, loading: true, state: null, recipes: [], residents: [], selectedResident: null,
    signatureSlots: [1, 2, 3].map(slot => ({ slot, id: '', recipe: null })) })
  record('08-load-error', { loading: false, failed: true, error: '网络暂时没有连上。便当草稿已留在这里，稍后再试一次。' })
  return states
}

function documentHTML(name, body, css) {
  // Only primitive styles are simulated. Product markup and CSS are compiled from the real files.
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>便当厨房 · ' + escape(name) + '</title><style>' +
    ':root{--rpx:calc(100vw / 750)}html,body{margin:0;width:100%;min-height:100%}*{box-sizing:border-box}wx-page,wx-view,wx-scroll-view,wx-cover-view{display:block}wx-text{display:inline}wx-scroll-view[scroll-y]{overflow-y:auto}wx-scroll-view[scroll-x]{overflow-x:auto}img{display:inline-block;object-fit:fill}button{display:block;margin:0 auto;padding:0 14px;border:0;border-radius:5px;background:#f8f8f8;color:#000;text-align:center;text-decoration:none;font:inherit;font-size:18px;line-height:2.55555556;overflow:hidden;cursor:pointer}button:disabled{cursor:default;color:rgba(0,0,0,.3)}input,textarea{font:inherit;color:inherit;min-width:0}' +
    css + '</style></head><body>' + body + '</body></html>'
}

async function buildPreview(states) {
  fs.mkdirSync(output, { recursive: true })
  const wxml = compile('wcc', [...dependencies(pageFile, 'wxml')])
  const context = { window: {}, console: { ...console, log: (...message) => { throw Error(message.join(' ')) } } }
  vm.createContext(context)
  vm.runInContext(wxml, context, { filename: 'restaurant-compiled.js' })
  const render = context.$gwx(pageFile) || context.$gwx(pageFile.replace(/\//g, '\\'))
  if (typeof render !== 'function') throw Error('WXML compiler did not expose the restaurant page renderer')
  const css = ['miniapp/app.wxss', 'miniapp/kitchen/pages/restaurant/restaurant.wxss'].map(file => browserCSS(compile('wcsc', [...dependencies(file, 'wxss')]))).join('\n')
  const manifest = []
  for (const [name, state] of Object.entries(states)) {
    if (!/^[\p{L}\p{N}_-]+$/u.test(name)) throw Error('Unsafe scene name: ' + name)
    const body = html(render(state, {}))
    if (!body.includes('restaurant-page')) throw Error('No restaurant-page rendered for scene ' + name)
    const filename = name + '.html'
    fs.writeFileSync(path.join(output, filename), documentHTML(name, body, css))
    manifest.push({ name, file: filename, tab: state.tab, loading: !!state.loading, error: !!state.error, pending: !!state.pending })
  }
  fs.writeFileSync(path.join(output, 'states.json'), JSON.stringify(states, null, 2))
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>便当厨房真实模板预览</title><style>body{font:16px system-ui;max-width:680px;margin:40px auto;padding:20px}li{margin:12px 0}a{color:#365e34}</style><h1>便当厨房真实模板预览</h1><p>来自实际 restaurant.wxml / wxss 的微信编译结果。数据为本地 mock；此页面只用于检查布局，按钮不连接业务服务。请用 320–430px 视口查看。</p><ul>' + manifest.map(scene => '<li><a href="' + encodeURIComponent(scene.file) + '">' + escape(scene.name) + '</a></li>').join('') + '</ul></html>')
  console.log('Compiled real kitchen WXML/WXSS and rendered ' + manifest.length + ' scenes in ' + output)
  return manifest
}

function serve(port) {
  const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
  const server = http.createServer((req, res) => {
    let file
    try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)) } catch (_) { res.writeHead(400).end(); return }
    if (file === root) file = path.join(output, 'index.html')
    if (!(file.startsWith(output + path.sep) || file.startsWith(path.join(root, 'miniapp/images') + path.sep))) { res.writeHead(403).end(); return }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    fs.createReadStream(file).pipe(res)
  })
  server.listen(port, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + port + '/output/restaurant-preview/index.html'))
  return server
}

async function main() {
  const args = process.argv.slice(2)
  const value = option => args.includes(option) ? args[args.indexOf(option) + 1] : null
  const modulePath = value('--state-module')
  const statesPath = value('--states')
  const states = modulePath ? await require(path.resolve(modulePath))() : statesPath ? JSON.parse(fs.readFileSync(path.resolve(statesPath), 'utf8')) : await defaultStates()
  await buildPreview(states)
  if (args.includes('--serve')) serve(Number(value('--serve')) || 9433)
}

module.exports = { buildPreview, defaultStates, fixture, serve }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
