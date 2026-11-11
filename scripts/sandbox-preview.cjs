// Compiles the shipping WXML/WXSS and runs the shipping controller and WebGL scene.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http')
const { compile, dependencies, cssFor } = require('./home-preview.cjs')
const { fixture } = require('./home-room-test.cjs')
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/home-preview'), page = 'miniapp/home/pages/world/world'
const modules = new Map()
function collect(file) {
  if (modules.has(file)) return
  const source = fs.readFileSync(path.join(root, file), 'utf8'); modules.set(file, source)
  for (const m of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    if (!m[1].startsWith('.')) throw Error('External dependency: ' + m[1])
    collect(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])) + '.js')
  }
}
collect('miniapp/home/utils/sandbox-page.js')
const stages = Object.fromEntries([1, 2, 3, 4, 5].map(level => {
  const s = fixture(level), n = s.room.size; s.furniture.forEach(f => { f.owned = true })
  s.room.layout = [
    ['tv', n * .3, 1.5], ['sofa', n * .3, n * .46], ['lamp', 1.5, n * .58],
    ['plant', n - 1.5, n - 2], ['bed', n - 1.6, 2.5], ['bookshelf', 1.5, 1.8]
  ].map(([id, x, y]) => ({ id, x, y, rotation: 0, angle: 0 }))
  return [level, s]
}))
const bundle = `const modules={${[...modules].map(([file, source]) => JSON.stringify(file) + ':function(require,module,exports){\n' + source + '\n}').join(',')}};const cache={};function requireFile(file){if(cache[file])return cache[file].exports;const module={exports:{}};cache[file]=module;modules[file](name=>{const parts=(file.slice(0,file.lastIndexOf('/')+1)+name+'.js').split('/'),result=[];for(const p of parts){if(p==='..')result.pop();else if(p!=='.')result.push(p)}return requireFile(result.join('/'))},module,module.exports);return module.exports}`
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'sandbox-runtime.js'), bundle + '\n' + compile('wcc', [...dependencies(page + '.wxml', 'wxml')]) + '\nwindow.WORLD_FIXTURES=' + JSON.stringify(stages) + ';\n' + fs.readFileSync(path.join(__dirname, 'sandbox-preview-runtime.cjs'), 'utf8'))
const css = cssFor(page).replace(/wx-canvas/g, 'canvas')
fs.writeFileSync(path.join(output, 'sandbox.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>我的方块世界 · 实际模板预览</title><style>:root{--rpx:calc(100vw / 750)}html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}[hidden]{display:none!important}#app{height:100%}*{box-sizing:border-box}wx-view,wx-scroll-view{display:block}wx-text{display:inline}wx-scroll-view[scroll-y]{overflow-y:auto}img{object-fit:contain}button{border:0;cursor:pointer;font:inherit}canvas,button{touch-action:none}button:disabled{cursor:default}${css}</style><body><div id="app"></div><script src="sandbox-runtime.js"></script></body></html>`)
const port = Number(process.argv[2]) || 9437
if (!process.argv.includes('--build')) http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return }
  const file = path.resolve(root, '.' + pathname)
  if (!(file.startsWith(output + path.sep) || file.startsWith(path.join(root, 'miniapp/home/images') + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return }
  res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store'); fs.createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + '/output/home-preview/sandbox.html'))
