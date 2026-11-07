// Exercise real mouse down/up across the live HUD refresh, not DOM .click().
// Start scripts/subway-preview.cjs --serve 9436 before running this check.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const session = 'subway-controls-check-' + process.pid
const url = process.env.SUBWAY_PREVIEW_URL || 'http://127.0.0.1:9436/output/subway-preview/run.html'
function browser(...args) {
  return execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 15000 }).trim()
}
function evaluate(source) { return JSON.parse(browser('eval', '-b', Buffer.from(source).toString('base64'))) }
function pressControl(action, hold = 220) {
  const position = evaluate(`(() => {const button=document.querySelector('[data-action="${action}"]');const rect=button.getBoundingClientRect();window.pressedControl=button;return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`)
  browser('mouse', 'move', String(Math.round(position.x)), String(Math.round(position.y)))
  browser('mouse', 'down')
  const stable = evaluate(`(async()=>{const before=runnerPage._run.distance;await new Promise(resolve=>setTimeout(resolve,${hold}));return {connected:pressedControl.isConnected,advanced:runnerPage._run.distance>before}})()`)
  browser('mouse', 'up')
  return { ...stable, ...evaluate('({lane:runnerPage._run.lane,action:runnerPage._run.action,phase:runnerPage.data.phase})') }
}
try {
  browser('open', url)
  browser('set', 'viewport', '375', '812')
  browser('click', '[data-tap="onStart"]')
  evaluate('runnerPage._run.immune=1000')
  const left = pressControl('left')
  assert.equal(left.advanced, true, 'the game must keep animating while a button is held')
  assert.equal(left.lane, 0, 'holding and releasing left across a HUD update must move the runner')
  assert.equal(left.connected, true, 'HUD updates must preserve the pressed button node')
  assert.equal(pressControl('right').lane, 1)
  assert.equal(pressControl('jump').action, 'jump')
  evaluate('runnerPage._run.action=""')
  assert.equal(pressControl('slide').action, 'slide')
  browser('click', '[data-tap="onPause"]')
  assert.equal(evaluate('runnerPage.data.phase'), 'paused')
  browser('click', '[data-tap="onResume"]')
  assert.equal(evaluate('runnerPage.data.phase'), 'running')
  evaluate('runnerPage._run.action=""')
  assert.equal(pressControl('left', 500).lane, 0)
  console.log('PASS: real left/right/jump/slide presses survive HUD refresh; pause/resume and long press work.')
} finally {
  browser('close')
}
