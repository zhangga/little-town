#!/usr/bin/env node
// Render the real town WXML/WXSS with WeChat's compiler and deterministic page data.
// node scripts/building-preview.cjs [--states states.json] [--state-module states.cjs] [--serve 9432]
// Set WECHAT_COMPILER_DIR when the developer tools are installed in a different location.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const http = require('node:http')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'output/building-preview')
const pageFile = 'miniapp/pages/index/index.wxml'
const compilerDir = process.env.WECHAT_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec'
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const responsive = value => String(value).replace(/(-?[\d.]+)rpx/g, (_, value) => 'calc(' + value + ' * var(--rpx))')

function dependencies(file, kind, found = new Set()) {
  if (found.has(file)) return found
  found.add(file)
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const regex = kind === 'wxml' ? /<(?:import|include)\b[^>]*\bsrc=["']([^"']+)["']/g : /@import\s+["']([^"']+)["']/g
  for (const match of source.matchAll(regex)) dependencies(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])), kind, found)
  return found
}

function compile(binary, files, target) {
  const executable = path.join(compilerDir, binary)
  if (!fs.existsSync(executable)) throw Error('WeChat compiler not found: ' + executable + '. Set WECHAT_COMPILER_DIR to its directory.')
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'little-town-buildings-'))
  try {
    const compiled = path.join(scratch, path.basename(target))
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
    (/^(?:class|style|id|src|alt|disabled|checked|value|placeholder|type|role|tabindex|scroll-y|scroll-x|mode)$/.test(key) || /^(aria-|data-)/.test(key)))
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

async function defaultStates() {
  const { harness, tap } = require('./town-life-test.cjs')
  const { shopFixture } = require('./town-shop-test.cjs')
  const { createActivitySession, advanceActivity } = require('../miniapp/utils/building-activities')
  const server = shopFixture()
  const serviceEvent = server.event
  server.buildings = ['电影院', '餐厅', '学校', '图书馆', '体育馆', '公园', '商店', '医院', '宠物医院', '消防站', '警察局']
  server.unlocked_count = server.buildings.length
  server.wallet.coins = 38
  server.event = null
  server.pets[0].owned = true
  // Read the server's catalog so prices and names in the visual fixture stay current.
  const catalog = fs.readFileSync(path.join(root, 'backend/internal/services/town_activity.go'), 'utf8')
  server.activities = [...catalog.matchAll(/TownActivityView\{ID: "([^"]+)", Name: "([^"]+)", Building: "([^"]+)", Icon: "([^"]+)", Description: "([^"]+)", Price: (\d+)\}/g)]
    .map(([, id, name, building, icon, description, price]) => ({ id, name, building, icon, description, price: Number(price), available: true, locked_reason: '' }))
  if (!server.activities.length) throw Error('No activity catalog found; provide explicit --states or --state-module fixtures')
  server.activity_visits = []
  const { page } = await harness({ server })
  const states = {}
  for (const [index, name] of server.buildings.entries()) {
    page.onPlotTap(tap({ index: page.data.plots.findIndex(plot => plot.name === name) }))
    states[String(index + 1).padStart(2, '0') + '-' + name] = JSON.parse(JSON.stringify(page.data))
  }
  for (const activity of server.activities) {
    page.onPlotTap(tap({ index: page.data.plots.findIndex(plot => plot.name === activity.building) }))
    const receipt = { activity_id: activity.id, request_id: 'preview-admission-' + activity.id.replace(/_/g, '-'), name: activity.name, building: activity.building, icon: activity.icon, price: activity.price, created_at: '2026-10-23T12:00:00+08:00' }
    const session = createActivitySession(activity.id, receipt)
    if (!session) throw Error('No game session for ' + activity.id)
    page.setData({ activitySession: session })
    states['play-' + activity.id] = JSON.parse(JSON.stringify(page.data))
    if (activity.id === 'cinema_cloud') {
      page.setData({ activitySession: advanceActivity(session, { kind: 'toggle_pause' }) })
      states['paused-cinema_cloud'] = JSON.parse(JSON.stringify(page.data))
    }
    if (activity.id === 'restaurant_soup') {
      page.setData({ activitySession: advanceActivity(session, { kind: 'choose', id: 'cake' }) })
      states['hint-restaurant_soup'] = JSON.parse(JSON.stringify(page.data))
    }
    if (['cinema_cloud', 'cinema_space', 'restaurant_soup', 'park_garden'].includes(activity.id)) {
      let completed = session
      for (let attempt = 0; attempt < 12 && !completed.complete; attempt++) {
        if (completed.kind === 'movie') completed = advanceActivity(completed, { kind: 'next' })
        else {
          const candidate = completed.choices.map(choice => advanceActivity(completed, { kind: 'choose', id: choice.id })).find(next => next.step > completed.step)
          if (!candidate) throw Error('Cannot reach completed preview for ' + activity.id)
          completed = candidate
        }
      }
      if (!completed.complete) throw Error('Activity preview did not finish: ' + activity.id)
      page.setData({ activitySession: completed })
      states['done-' + activity.id] = JSON.parse(JSON.stringify(page.data))
    }
  }
  server.wallet.coins = 0
  page.applyLife(server)
  page.onPlotTap(tap({ index: page.data.plots.findIndex(plot => plot.name === '电影院') }))
  states['empty-wallet-cinema'] = JSON.parse(JSON.stringify(page.data))
  server.activities = server.activities.map(item => item.building === '宠物医院' ? { ...item, available: false, locked_reason: '先领养一位宠物伙伴，再一起来体验吧' } : item)
  page.applyLife(server)
  page.onPlotTap(tap({ index: page.data.plots.findIndex(plot => plot.name === '宠物医院') }))
  states['locked-vet'] = JSON.parse(JSON.stringify(page.data))
  server.wallet.coins = 38
  server.event = serviceEvent
  page.applyLife(server)
  page.onPlotTap(tap({ index: page.data.plots.findIndex(plot => plot.name === '消防站') }))
  states['service-fire'] = JSON.parse(JSON.stringify(page.data))
  server.event = null
  const film = server.activities.find(item => item.id === 'cinema_cloud')
  server.activity_visits = [{ activity_id: film.id, request_id: 'preview-existing-ticket', name: film.name, building: film.building, icon: film.icon, price: film.price, created_at: '2026-10-23T12:00:00+08:00' }]
  server.wallet.coins = 0
  page.applyLife(server)
  page.onPlotTap(tap({ index: page.data.plots.findIndex(plot => plot.name === '电影院') }))
  states['ticket-cinema'] = JSON.parse(JSON.stringify(page.data))
  page.setData({ pendingActivity: 'cinema_space' })
  states['pending-cinema'] = JSON.parse(JSON.stringify(page.data))
  page.onUnload()
  return states
}

function documentHTML(name, body, css) {
  // Component base styles mirror browser-visible Mini Program primitives only.
  // All product markup and product styling come from the real compiled files.
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小小镇 · ' + escape(name) + '</title><style>' +
    ':root{--rpx:calc(100vw / 750)}html,body{margin:0;width:100%;height:100%}*{box-sizing:border-box}wx-page,wx-view,wx-scroll-view,wx-cover-view{display:block}wx-text{display:inline}wx-scroll-view[scroll-y]{overflow-y:auto}wx-scroll-view[scroll-x]{overflow-x:auto}img{display:inline-block;object-fit:fill}button{display:block;margin:0 auto;padding:0 14px;border:0;border-radius:5px;background:#f8f8f8;color:#000;text-align:center;text-decoration:none;font:inherit;font-size:18px;line-height:2.55555556;overflow:hidden;cursor:pointer}button:disabled{cursor:default;color:rgba(0,0,0,.3)}' +
    css + '</style></head><body>' + body + '</body></html>'
}

async function buildPreview(states) {
  fs.mkdirSync(output, { recursive: true })
  const wxml = compile('wcc', [...dependencies(pageFile, 'wxml')], path.join(output, 'index-compiled.js'))
  const context = { window: {}, console: { ...console, log: (...message) => { throw Error(message.join(' ')) } } }
  vm.createContext(context)
  vm.runInContext(wxml, context, { filename: 'index-compiled.js' })
  const render = context.$gwx(pageFile) || context.$gwx(pageFile.replace(/\//g, '\\'))
  if (typeof render !== 'function') throw Error('WXML compiler did not expose the index page renderer')
  const css = ['miniapp/app.wxss', 'miniapp/pages/index/index.wxss'].map((file, index) => browserCSS(compile('wcsc', [...dependencies(file, 'wxss')], path.join(output, 'styles-' + index + '-compiled.css')))).join('\n')
  const manifest = []
  for (const [name, state] of Object.entries(states)) {
    if (!/^[\p{L}\p{N}_-]+$/u.test(name)) throw Error('Unsafe scene name: ' + name)
    const body = html(render(state, {}))
    if (!body.includes('town-page')) throw Error('No town-page rendered for scene ' + name)
    const filename = name + '.html'
    fs.writeFileSync(path.join(output, filename), documentHTML(name, body, css))
    manifest.push({ name, file: filename, building: state.selected && state.selected.name, session: state.activitySession && (state.activitySession.kind || state.activitySession.type || state.activitySession.id) })
  }
  fs.writeFileSync(path.join(output, 'states.json'), JSON.stringify(states, null, 2))
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>建筑真实模板预览</title><style>body{font:16px system-ui;max-width:680px;margin:40px auto;padding:20px}li{margin:12px 0}a{color:#365e34}</style><h1>建筑真实模板预览</h1><p>来自实际 index.wxml / wxss 的微信编译结果。数据为本地 mock；此页面仅用于检查布局，按钮不连接业务服务。请用 320–430px 视口查看。</p><ul>' + manifest.map(scene => '<li><a href="' + encodeURIComponent(scene.file) + '">' + escape(scene.name) + '</a></li>').join('') + '</ul></html>')
  console.log('Compiled real WXML/WXSS and rendered ' + manifest.length + ' scenes in ' + output)
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
  server.listen(port, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + port + '/output/building-preview/index.html'))
  return server
}

async function main() {
  const args = process.argv.slice(2)
  const value = option => args.includes(option) ? args[args.indexOf(option) + 1] : null
  const modulePath = value('--state-module')
  const statesPath = value('--states')
  const states = modulePath ? await require(path.resolve(modulePath))() : statesPath ? JSON.parse(fs.readFileSync(path.resolve(statesPath), 'utf8')) : await defaultStates()
  await buildPreview(states)
  if (args.includes('--serve')) serve(Number(value('--serve')) || 9432)
}

module.exports = { buildPreview, defaultStates, serve }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
