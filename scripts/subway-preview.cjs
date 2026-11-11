#!/usr/bin/env node
// Compile real WXML/WXSS and run the product controller, simulation and Canvas
// renderer with a local ownership fixture. No production API or wallet access.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const http = require('node:http')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'output/subway-preview')
const compiler = process.env.WECHAT_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec'
const pageFile = 'miniapp/subway/pages/run/run.wxml'
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const responsive = value => String(value).replace(/(-?[\d.]+)rpx/g, (_, n) => 'calc(' + n + ' * var(--rpx))')

function dependencies(file, kind, found = new Set()) {
  if (found.has(file)) return found
  found.add(file)
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const pattern = kind === 'wxml' ? /<(?:import|include)\b[^>]*\bsrc=["']([^"']+)["']/g : /@import\s+["']([^"']+)["']/g
  for (const match of source.matchAll(pattern)) dependencies(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])), kind, found)
  return found
}
function compile(binary, files) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'little-town-subway-'))
  try {
    const dest = path.join(scratch, 'compiled')
    const result = spawnSync(path.join(compiler, binary), ['-o', dest, ...files], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (result.error || result.status) throw Error(binary + ': ' + (result.error || result.stderr || result.stdout))
    return fs.readFileSync(dest, 'utf8')
  } finally { fs.rmSync(scratch, { recursive: true, force: true }) }
}
function html(node) {
  if (node === null || node === undefined) return ''
  if (typeof node !== 'object') return escape(node)
  const children = (node.children || []).map(html).join('')
  if (!node.tag || node.tag === 'virtual') return children
  const tag = { 'wx-button': 'button', 'wx-image': 'img', 'wx-canvas': 'canvas' }[node.tag] || node.tag
  const attributes = Object.entries(node.attr || {}).flatMap(([key, value]) => {
    if (value === false || value === null || value === undefined) return []
    if (key === 'bindtap') return ['data-tap="' + escape(value) + '"']
    if (key === 'ariaLabel') key = 'aria-label'
    if (key === 'scrollY') key = 'scroll-y'
    if (!/^(class|id|src|style|mode|disabled|hidden|scroll-y|aria-.+|data-.+)$/.test(key)) return []
    if (key === 'style') value = responsive(value)
    if (key === 'src' && String(value).startsWith('/images/')) value = '/miniapp' + value
    return [key === 'disabled' || key === 'hidden' ? key : key + '="' + escape(value) + '"']
  }).join(' ')
  return '<' + tag + (attributes ? ' ' + attributes : '') + '>' + (tag === 'img' ? '' : children + '</' + tag + '>')
}
function css(files) {
  return files.map(file => responsive(compile('wcsc', [...dependencies(file, 'wxss')])
    .replace(/%%\?(-?[\d.]+rpx)\?%%/g, '$1').replace(/%%HERESUFFIX%%/g, '')
    .replace(/\bwx-button\b/g, 'button').replace(/\bwx-image\b/g, 'img').replace(/\bwx-canvas\b/g, 'canvas'))).join('\n')
}
function documentHTML(title, body, styles, scripts = '') {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(title) + '</title><style>' +
    ':root{--rpx:calc(100vw / 750)}html,body{margin:0;width:100%;height:100%;font-family:-apple-system,"PingFang SC",sans-serif}*{box-sizing:border-box}wx-page,wx-view,wx-scroll-view{display:block}wx-text{display:inline}wx-scroll-view[scroll-y]{overflow-y:auto}img{display:inline-block;object-fit:contain}button{display:block;border:0;border-radius:5px;padding:0 14px;background:#f8f8f8;font:inherit;font-size:18px;line-height:2.555;text-align:center;cursor:pointer}button:disabled{cursor:default}canvas{touch-action:none}[hidden]{display:none!important}' +
    styles + '</style></head><body>' + body + scripts + '</body></html>'
}

async function build() {
  fs.mkdirSync(output, { recursive: true })
  const compiled = compile('wcc', [...dependencies(pageFile, 'wxml')])
  fs.writeFileSync(path.join(output, 'runner-template.js'), compiled)
  const modules = ['runner', 'runner-renderer', 'runner-economy', 'runner-page'].map(name => JSON.stringify(name) + ':function(require,module,exports){\n' + fs.readFileSync(path.join(root, 'miniapp/subway/utils/' + name + '.js'), 'utf8') + '\n}').join(',\n')
  fs.writeFileSync(path.join(output, 'runner-product.js'), '(function(){const modules={' + modules + '},cache={};function load(name){name=name.startsWith("./")?name.slice(2):name;if(cache[name])return cache[name].exports;const m=cache[name]={exports:{}};modules[name](load,m,m.exports);return m.exports}window.RunnerPage=load("runner-page");window.RunnerSim=load("runner");})();')
  const styles = css(['miniapp/app.wxss', 'miniapp/subway/pages/run/run.wxss'])
  const script = `
const escape=${escape.toString()},responsive=${responsive.toString()},html=${html.toString()};
const template=$gwx(${JSON.stringify(pageFile)}),mount=document.getElementById('app');
// Keep controls connected between pointerdown and pointerup. Replacing the
// page every HUD update cancels normal presses even though DOM .click() works.
function patchNode(current,next){
  if(current.nodeType!==next.nodeType||current.nodeName!==next.nodeName){current.replaceWith(next);return}
  if(current.nodeType===Node.TEXT_NODE){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return}
  if(current.nodeType!==Node.ELEMENT_NODE)return;
  for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name)&&!(current.tagName==='CANVAS'&&['width','height'].includes(attr.name)))current.removeAttribute(attr.name);
  for(const attr of [...next.attributes])if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
  if(current.tagName!=='CANVAS')patchChildren(current,next)
}
function patchChildren(current,next){
  const children=[...next.childNodes];
  children.forEach((child,index)=>{if(current.childNodes[index])patchNode(current.childNodes[index],child);else current.appendChild(child)});
  while(current.childNodes.length>children.length)current.lastChild.remove()
}
function refresh(){const next=document.createElement('div');next.innerHTML=html(template(page.data,{}));patchChildren(mount,next)}
const storage={token:'local-preview',apiBackend:'preview',userInfo:{id:1}};
const wxApi={getStorageSync:key=>key.startsWith('subway')?JSON.parse(localStorage.getItem(key)||'null'):storage[key],setStorageSync:(key,value)=>localStorage.setItem(key,JSON.stringify(value)),showModal:args=>args.success({confirm:confirm(args.content)}),getWindowInfo:()=>({pixelRatio:devicePixelRatio}),createSelectorQuery:()=>({selections:[],in(){return this},select(selector){this.selections.push(selector);return this},fields(){return this},exec(fn){fn(this.selections.map(selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect();if(node.tagName==='CANVAS'){node.requestAnimationFrame=cb=>requestAnimationFrame(cb);node.cancelAnimationFrame=id=>cancelAnimationFrame(id)}return {node,width:r.width,height:r.height}}))}}),navigateBack:()=>{location.href='station.html'},switchTab:()=>{location.href='town.html'},redirectTo:()=>{location.href='station.html'}};
const previewState=new URLSearchParams(location.search).get('state');
const createFixture=${require('./subway-fixture.cjs').createSubwayFixture.toString()};
const fixture=window.subwayFixture=createFixture({tokens:240,locked:previewState==='locked',saved:JSON.parse(localStorage.getItem('subway-demo-wallet')||'null'),save:value=>localStorage.setItem('subway-demo-wallet',JSON.stringify(value))});
const api={get:async url=>{if(previewState==='error')throw Error('演示：站台暂时没有连上');return fixture.get(url)},post:(url,body)=>fixture.post(url,body)};
const definition=RunnerPage.createRunnerPage(api,wxApi);
const page=window.runnerPage={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(patch){Object.assign(this.data,patch);refresh()}};
refresh();const loaded=page.onLoad();page.onReady();page.onShow();
loaded.then(async()=>{
  if(previewState==='shop'){page.onOpenShop();return}
  if(['paused','over','running','caught'].includes(previewState)){
    await page.onStart();page._run.distance=167;page._run.coins=32;page._run.stars=2;page._run.score=427;
    if(previewState==='paused')page.onPause();
    if(previewState==='over')await page.onEndRun();
    if(previewState==='caught'){page._run.status='caught';page._run.captureTime=1.2;page.setData(RunnerSim.runView(page._run));page.drawFrame();page.stopLoop()}
  }
});
document.addEventListener('click',event=>{const el=event.target.closest('[data-tap]');if(el&&!el.disabled&&page[el.dataset.tap])page[el.dataset.tap]({type:'tap',currentTarget:{dataset:{...el.dataset}}})});
let pointer=false;const touch=e=>({changedTouches:[{clientX:e.clientX,clientY:e.clientY}]});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#runner-canvas'))return;pointer=true;page.onTouchStart(touch(e))});
document.addEventListener('pointermove',e=>{if(pointer)page.onTouchMove(touch(e))});
document.addEventListener('pointerup',e=>{if(pointer)page.onTouchEnd(touch(e));pointer=false});
document.addEventListener('pointercancel',()=>{page.onTouchCancel();pointer=false});
document.addEventListener('keydown',e=>{const action={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'jump',ArrowDown:'slide',' ':'jump',b:'board'}[e.key];if(action){e.preventDefault();page.command(action)}if(e.key==='Escape'){page.data.phase==='running'?page.onPause():page.onResume()}});
document.addEventListener('visibilitychange',()=>document.hidden?page.onHide():page.onShow());
window.addEventListener('resize',()=>page.onResize());window.addEventListener('beforeunload',()=>page.onUnload());
`
  fs.writeFileSync(path.join(output, 'runner-preview.js'), script)
  fs.writeFileSync(path.join(output, 'run.html'), documentHTML('地铁跑酷 · 可试玩预览', '<main id="app"></main>', styles, '<script src="runner-template.js"></script><script src="runner-product.js"></script><script src="runner-preview.js"></script>'))

  const { harness } = require('./town-life-test.cjs')
  const { shopFixture } = require('./town-shop-test.cjs')
  const server = shopFixture()
  server.buildings = require('../backend/data/buildings.json').map(item => item.name)
  server.event = null
  const { page } = await harness({ server })
  const townFile = 'miniapp/pages/index/index.wxml', context = { window: {}, console }
  vm.createContext(context); vm.runInContext(compile('wcc', [...dependencies(townFile, 'wxml')]), context)
  const townTemplate = context.$gwx(townFile), townStyles = css(['miniapp/app.wxss', 'miniapp/pages/index/index.wxss'])
  fs.writeFileSync(path.join(output, 'town.html'), documentHTML('小镇地图 · 地铁站', html(townTemplate(page.data, {})), townStyles))
  page.openBuilding(page.data.plots.find(item => item.name === '地铁站'))
  const stationBody = html(townTemplate(page.data, {}))
  if (!stationBody.includes('metro-train-button')) throw Error('Station train was not rendered by the real WXML template')
  fs.writeFileSync(path.join(output, 'station.html'), documentHTML('地铁站 · 点击列车试玩', stationBody, townStyles, '<script>document.querySelector(".metro-train-button").onclick=()=>location.href="run.html";document.querySelector(".building-footer button").onclick=()=>location.href="town.html"</script>'))
  page.onUnload()
  fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>地铁站预览</title><style>body{font:16px system-ui;max-width:600px;margin:40px auto;padding:24px}li{margin:18px 0}</style><h1>地铁站与星光环线</h1><p>实际 WXML/WXSS 编译结果，跑酷使用产品同一套逻辑。站台数据为本地演示，不连接业务接口。可用按钮、滑动或方向键试玩。</p><ul><li><a href="station.html">进入地铁站，点击列车</a></li><li><a href="run.html">直接试玩跑酷</a></li><li><a href="run.html?state=shop">星光币商店（演示余额）</a></li><li><a href="run.html?state=paused">暂停画面</a></li><li><a href="run.html?state=over">结算画面</a></li><li><a href="run.html?state=locked">未建造</a></li><li><a href="run.html?state=error">网络失败</a></li><li><a href="town.html">小镇地图</a></li></ul></html>')
  console.log('Compiled station + runner WXML/WXSS; interactive preview: ' + output)
}

function serve(port) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' }
  http.createServer((req,res) => {
    let filename
    try { filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)) } catch (_) { res.writeHead(400).end(); return }
    if (filename === root) filename = path.join(output, 'index.html')
    if (!(filename.startsWith(output + path.sep) || filename.startsWith(path.join(root,'miniapp/images') + path.sep))) { res.writeHead(403).end(); return }
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type',types[path.extname(filename)] || 'text/plain'); res.setHeader('Cache-Control','no-store')
    fs.createReadStream(filename).pipe(res)
  }).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:' + port + '/output/subway-preview/index.html'))
}
if (require.main === module) build().then(()=>{const at=process.argv.indexOf('--serve');if(at>=0)serve(Number(process.argv[at+1])||9436)}).catch(error=>{console.error(error);process.exitCode=1})
module.exports = { build }
