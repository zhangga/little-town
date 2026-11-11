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
  for (const [width,height] of [[375,812],[320,568]]) {
    browser('open', url)
    browser('set', 'viewport', String(width), String(height))
    assert.equal(evaluate('runnerPage.data.phase'), 'ready')
    assert.equal(evaluate('document.querySelector("#runner-canvas").hidden'), true)
    browser('click', '[data-tap="onStart"]')
    evaluate('Object.assign(runnerPage._run,{immune:1000,objects:[],spawnDistance:-100000});true')
    assert.equal(evaluate('document.querySelector("#runner-canvas").hidden'), false)
    const dimensions=evaluate('({width:runnerPage._canvas.width,expected:Math.round(runnerPage._width*Math.min(3,devicePixelRatio))})')
    assert.equal(dimensions.width,dimensions.expected,'HUD refresh must not reset the canvas bitmap')
    const left = pressControl('left')
    assert.equal(left.advanced, true, 'the game must keep animating while a button is held')
    assert.equal(left.lane, 0)
    assert.equal(left.connected, true, 'HUD updates must preserve the pressed button node')
    assert.equal(pressControl('right').lane, 1)
    assert.equal(pressControl('jump').action, 'jump')
    evaluate('runnerPage._run.action=""')
    assert.equal(pressControl('slide').action, 'slide')
    pressControl('board')
    assert.ok(evaluate('runnerPage._run.boardTime') > 0)
    assert.equal(evaluate('runnerPage._run.boards'), 0)
    browser('click', '[data-tap="onPause"]')
    assert.equal(evaluate('runnerPage.data.phase'), 'paused')
    assert.equal(evaluate('document.querySelector("#runner-canvas").hidden'), true)
    browser('click', '[data-tap="onResume"]')
    assert.equal(evaluate('runnerPage.data.phase'), 'running')
    evaluate('runnerPage._run.action=""')
    assert.equal(pressControl('left', 500).lane, 0)
    const point=evaluate('(()=>{const r=document.querySelector("#runner-canvas").getBoundingClientRect();return {x:Math.round(r.width/2),y:Math.round(r.y+r.height/2)}})()')
    browser('mouse','move',String(point.x),String(point.y));browser('mouse','down')
    browser('mouse','move',String(point.x+65),String(point.y));browser('mouse','up')
    assert.equal(evaluate('runnerPage._run.lane'),1,'canvas swipe changes lane')
    const wallet=evaluate('runnerPage.data.economy')
    browser('click','[data-tap="onOpenShop"]')
    assert.equal(evaluate('runnerPage.data.phase'),'paused')
    browser('click','[data-id="coins"]')
    assert.equal(evaluate('runnerPage.data.economy.tokens'),wallet.tokens-50)
    assert.equal(evaluate('runnerPage.data.economy.wallet.coins'),wallet.wallet.coins+10)
    if(width===375){
      browser('scrollintoview','[data-id="sunset"]');browser('click','[data-id="sunset"]')
      assert.equal(evaluate('runnerPage.data.economy.equipped'),'sunset')
      browser('scrollintoview','[data-id="mint"]');browser('click','[data-id="mint"]')
      assert.equal(evaluate('runnerPage.data.economy.equipped'),'mint')
    }
    browser('scrollintoview','[data-tap="onCloseShop"]');browser('click','[data-tap="onCloseShop"]')
    browser('click','[data-tap="onResume"]')
    evaluate('Object.assign(runnerPage._run,{lane:1,lanePosition:1,immune:0,action:"",boardTime:0,objects:[{id:999,kind:"train",lane:1,z:.1}]});true')
    const caught=evaluate('(async()=>{await new Promise(r=>setTimeout(r,100));return {phase:runnerPage._run.status,time:runnerPage._run.captureTime}})()')
    assert.equal(caught.phase,'caught');assert.ok(caught.time<1)
    assert.equal(evaluate('(async()=>{await new Promise(r=>setTimeout(r,2400));return runnerPage.data.phase})()'),'over')
    assert.equal(evaluate('runnerPage.data.pendingReward'),false)
    assert.equal(evaluate('document.querySelector("#runner-canvas").hidden'),true)
    assert.ok(evaluate('runnerPage.data.awarded')>=0)
    browser('click','[data-tap="onStart"]')
    assert.equal(evaluate('runnerPage._run.status'),'running')
    browser('click','[data-tap="onPause"]');browser('click','[data-tap="onEndRun"]')
    assert.equal(evaluate('runnerPage._run.status'),'over')
    console.log('PASS '+width+'px: five controls, swipe, pause/resume, shop exchange/equip, capture/carry, settlement and restart.')
  }
} finally {
  browser('close')
}
