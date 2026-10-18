// 模拟微信脚本包的模块注册和 app.json 页面加载顺序。
// 微信的 require 只查找已 define 的 JS 模块，不使用 Node 的 JSON 加载器。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '../miniapp')
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

function miniappRuntime() {
  const definitions = new Map()
  const cache = new Map()
  const pages = []
  let route = ''
  const context = vm.createContext({
    wx: {}, console, setTimeout, clearTimeout, setInterval, clearInterval,
    Page(definition) { pages.push({ route, definition }) }
  })
  function collect(folder) {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const filename = path.join(folder, entry.name)
      if (entry.isDirectory()) collect(filename)
      else if (entry.name.endsWith('.js')) {
        definitions.set(path.relative(root, filename).split(path.sep).join('/'), filename)
      }
    }
  }
  collect(root)

  function load(key, requested = key) {
    // 与微信基础库一致：非 .js 路径补 .js，JSON 配置不注册为脚本模块。
    if (!key.endsWith('.js')) key += '.js'
    if (!definitions.has(key)) throw new Error("module '" + key + "' is not defined, require args is '" + requested + "'")
    if (cache.has(key)) return cache.get(key).exports
    const module = {exports: {}}
    cache.set(key, module)
    const localRequire = request => load(path.posix.normalize(path.posix.join(path.posix.dirname(key), request)), request)
    const factory = new vm.Script('(function(require, module, exports) {\n' + fs.readFileSync(definitions.get(key), 'utf8') + '\n})', {filename: key}).runInContext(context)
    factory(localRequire, module, module.exports)
    return module.exports
  }
  return {
    pages,
    register(page) { route = page; load(page) }
  }
}

test('every main page registers in app.json order using the WeChat JavaScript module rules', () => {
  const runtime = miniappRuntime()
  for (const page of config.pages) runtime.register(page)
  assert.deepEqual(runtime.pages.map(page => page.route), config.pages)
  for (const page of runtime.pages) {
    assert.ok(page.definition.data, page.route + ' must register its initial content')
  }
})

test('subpackage entry pages also register without interrupting the main pages', () => {
  const runtime = miniappRuntime()
  const entries = config.subpackages.flatMap(pkg => pkg.pages.map(page => pkg.root + '/' + page))
  for (const page of config.pages.concat(entries)) runtime.register(page)
  assert.deepEqual(runtime.pages.map(page => page.route), config.pages.concat(entries))
})
