// Browser-only bridge. No credentials, purchases, or QA helpers are shipped to WeChat.
const { createSandboxPage, worldData } = requireFile('miniapp/home/utils/sandbox-page.js')
const renderWXML = $gwx('miniapp/home/pages/world/world.wxml'), app = document.querySelector('#app')
const clone = value => JSON.parse(JSON.stringify(value)), params = new URLSearchParams(location.search), level = Number(params.get('level')) || 3
const state = clone(window.WORLD_FIXTURES[level]), keyboard = {}, storage = { token: 'preview', userInfo: { id: 42 }, apiBackend: 'preview-' + level }
if (params.has('reset')) for (const k of Object.keys(localStorage)) if (k.startsWith('voxel-world:')) localStorage.removeItem(k)
const wxApi = {
  getStorageSync: key => storage[key] || JSON.parse(localStorage.getItem(key) || 'null'),
  setStorageSync: (key, value) => { storage[key] = value; localStorage.setItem(key, JSON.stringify(value)) },
  removeStorageSync: key => { delete storage[key]; localStorage.removeItem(key) },
  navigateTo: a => { window.lastNavigation = a.url }, switchTab: a => { window.lastNavigation = a.url }, redirectTo: a => { window.lastNavigation = a.url },
  onKeyDown: fn => { keyboard.down = fn }, onKeyUp: fn => { keyboard.up = fn }, offKeyDown: () => delete keyboard.down, offKeyUp: () => delete keyboard.up,
  getWindowInfo: () => ({ pixelRatio: devicePixelRatio }),
  createSelectorQuery: () => ({
    selections: [], in() { return this }, select(selector) { this.selections.push({ selector }); return this }, fields() { return this },
    boundingClientRect(callback) { this.selections[this.selections.length - 1].callback = callback; return this },
    exec(callback) { queueMicrotask(() => {
      drawUI()
      const results = this.selections.map(s => { const node = document.querySelector(s.selector), r = node?.getBoundingClientRect(); const result = r ? { node, width: r.width, height: r.height, top: r.top, left: r.left } : null; s.callback?.(result); return result })
      callback?.(results)
    }) }
  })
}
let canvas, renderPending = false
const page = window.worldPage = { ...createSandboxPage({ get: async () => clone(state) }, wxApi, console.error), data: clone(worldData), _visible: true,
  setData(patch) {
    for (const [key, value] of Object.entries(patch)) { const bits = key.split('.'); let dest = this.data; while (bits.length > 1) { const k = bits.shift(); dest = dest[k] || (dest[k] = {}) }; dest[bits[0]] = value }
    if (!renderPending) { renderPending = true; queueMicrotask(() => { renderPending = false; drawUI() }) }
  }
}
function makeNode(node) {
  if (node == null) return document.createTextNode('')
  if (typeof node !== 'object') return document.createTextNode(String(node))
  if (!node.tag || node.tag === 'virtual' || node.tag === 'wx-page') { const f = document.createDocumentFragment(); (node.children || []).forEach(c => f.appendChild(makeNode(c))); return f }
  const tag = ({ 'wx-canvas': 'canvas', 'wx-button': 'button', 'wx-image': 'img' })[node.tag] || node.tag, el = document.createElement(tag)
  for (let [name, value] of Object.entries(node.attr || {})) {
    if (value === false || value == null) continue
    if (name === 'style') value = String(value).replace(/(-?[\d.]+)rpx/g, (_, n) => 'calc(' + n + ' * var(--rpx))')
    if (name === 'src' && String(value).startsWith('/home/')) value = '/miniapp' + value
    if (name === 'scrollY') name = 'scroll-y'
    if (name === 'ariaLabel') name = 'aria-label'
    if (/^(bind|catch)/.test(name)) el.dataset[name.toLowerCase()] = value
    else el.setAttribute(name, String(value))
  }
  if (tag === 'canvas' && !canvas) { canvas = el; canvas.createImage = () => new Image(); canvas.requestAnimationFrame = requestAnimationFrame.bind(window); canvas.cancelAnimationFrame = cancelAnimationFrame.bind(window) }
  else (node.children || []).forEach(c => el.appendChild(makeNode(c)))
  return el
}
function drawUI() {
  patchChildren(app, makeNode(renderWXML(page.data, {})))
}
function patchNode(current, next) {
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) { current.replaceWith(next); return }
  if (current.nodeType === Node.TEXT_NODE) { if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue; return }
  if (current.nodeType !== Node.ELEMENT_NODE) return
  for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name) && !(current.tagName === 'CANVAS' && ['width', 'height'].includes(attr.name))) current.removeAttribute(attr.name)
  for (const attr of [...next.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value)
  if (current.tagName !== 'CANVAS') patchChildren(current, next)
}
function patchChildren(current, next) {
  const children = [...next.childNodes]
  children.forEach((child, i) => { if (current.childNodes[i]) patchNode(current.childNodes[i], child); else current.appendChild(child) })
  while (current.childNodes.length > children.length) current.lastChild.remove()
}
function invoke(el, name, detail = {}) { const fn = el.dataset[name]; if (fn && page[fn]) return page[fn]({ type: name === 'bindtap' ? 'tap' : name, currentTarget: { dataset: el.dataset }, detail }) }
app.addEventListener('click', e => { let el = e.target; while (el && el !== app) { if (el.dataset?.catchtap) { invoke(el, 'catchtap'); break }; if (el.dataset?.bindtap) { invoke(el, 'bindtap'); break }; el = el.parentElement } })
let touchButton = null
app.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b?.dataset.bindtouchstart) { touchButton = { dataset: { ...b.dataset } }; invoke(touchButton, 'bindtouchstart') } })
window.addEventListener('pointerup', () => { if (touchButton) { invoke(touchButton, 'bindtouchend'); touchButton = null } })
window.addEventListener('pointercancel', () => { touchButton = null; page.clearWorldInput() })
const nativeKey = e => ({ key: e.key, code: e.code, altKey: String(e.altKey), shiftKey: String(e.shiftKey), ctrlKey: String(e.ctrlKey), metaKey: String(e.metaKey) })
window.addEventListener('keydown', e => { if (!e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); keyboard.down?.(nativeKey(e)) } })
window.addEventListener('keyup', e => keyboard.up?.(nativeKey(e)))
window.addEventListener('blur', () => page.pauseWorld())
window.addEventListener('focus', () => { page.bindWorldKeyboard(); page._scene?.start() })
window.addEventListener('beforeunload', () => page.flushWorldSave())
drawUI(); page.onLoad(); page.onShow(); page.onReady()
let pointer = false
const ev = e => ({ touches: [{ clientX: e.clientX, clientY: e.clientY }] })
canvas.addEventListener('pointerdown', e => { pointer = true; canvas.setPointerCapture(e.pointerId); page.onWorldTouchStart(ev(e)) })
canvas.addEventListener('pointermove', e => { if (pointer) page.onWorldTouchMove(ev(e)); else page.onWorldPointerMove(e) })
canvas.addEventListener('pointerup', () => { pointer = false; page.onWorldTouchEnd() })
canvas.addEventListener('pointercancel', () => { pointer = false; page.onWorldTouchCancel() })
window.addEventListener('resize', () => page.onResize())
window.qaPose = (x, y, z, yaw = 0, pitch = 0) => { page.onClosePanel(); Object.assign(page._world.player, { x, y, z, yaw, pitch, vy: 0, grounded: true }); page._scene.render(); page.updateWorldTarget(); page.updateWorldHUD() }
