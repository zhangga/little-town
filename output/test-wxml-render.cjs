const fs = require('node:fs')
const vm = require('node:vm')
const context = { window: {}, console }
vm.createContext(context)
vm.runInContext(fs.readFileSync('output/learn-compiled.js', 'utf8'), context)
console.log('keys', Object.keys(context).slice(0, 20))
const render = context.$gwx('miniapp\\pages\\learn\\learn.wxml')
console.log('render', typeof render)
if (render) {
  const result = render({ loading: true }, {})
  console.log(JSON.stringify(result).slice(0, 1600))
}
