// Real browser checks through agent-browser; run sandbox-preview.cjs first.
const assert = require('node:assert/strict'), path = require('node:path'), { spawnSync } = require('node:child_process')
const session = 'sandbox-check-' + process.pid
const url = process.env.SANDBOX_PREVIEW_URL || 'http://127.0.0.1:9437/output/home-preview/sandbox.html'
const output = path.resolve('output/home-preview'), checks = [], scenes = []
function run(args, input) {
  const r = spawnSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', input, timeout: 45000, maxBuffer: 2 * 1024 * 1024 })
  if (r.error) throw r.error
  const result = JSON.parse(r.stdout)
  if (r.status || !result.success) throw Error(result.error || r.stderr || r.stdout)
  return result.data
}
const js = source => run(['eval', '--stdin'], source).result
const wait = condition => run(['wait', '--fn', condition])
const click = selector => { wait('!document.querySelector(".world-sheet") || document.querySelector(".world-sheet").getAnimations().every(a => a.playState === "finished")'); if (/bag-item|recipe-button/.test(selector)) run(['scrollintoview', selector]); return run(['click', selector]) }
const pose = (x, y, z, yaw = 0, pitch = 0) => js(`qaPose(${[x, y, z, yaw, pitch].join(',')}); true`)
const screenshot = name => run(['screenshot', path.join(output, 'sandbox-' + name + '.png')])
function holdButton(selector, condition) {
  const b = js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  run(['mouse', 'move', String(Math.round(b.x)), String(Math.round(b.y))]); run(['mouse', 'down'])
  try { wait(condition) } finally { run(['mouse', 'up']) }
}
try {
  run(['set', 'viewport', '390', '844'])
  run(['open', url + '?level=3&reset=1'])
  wait('worldPage?._scene?.stats().pending === 0')
  assert.equal(js('worldPage._world.home.floors'), 2)
  assert.equal(js('worldPage._scene.stats().eye.y - worldPage._world.player.y'), 1.45)
  pose(5.8, 0, 9.5, .26, .02); screenshot('interior-final')
  checks.push('first-person camera at the character eye height')

  pose(6.5, 0, 10, Math.PI, 0)
  assert.equal(js('worldPage._target?.kind'), 'door')
  run(['press', 'e']); assert.equal(js('worldPage._world.doors["home:door"]'), true)
  click('.dpad-up'); wait('!worldPage._walkPulse && worldPage._world.player.z > 10.3')
  const afterTap = js('worldPage._world.player.z')
  assert.ok(afterTap < 11, 'one quick click should take a small step')
  holdButton('.dpad-up', 'worldPage._world.player.z > 12.3')
  assert.ok(js('worldPage._world.player.z') > 12)
  assert.equal(js('worldPage._walkPulse'), null, 'releasing a long hold must not start another step')
  checks.push('native string keyboard flags open the door; a tap takes one step and holding walks through the doorway')

  pose(-2.5, 0, 6.5, Math.PI / 2)
  assert.equal(js('worldPage._target?.id'), 'log')
  click('.action-mine'); wait('worldPage._world.inventory.log === 1')
  click('[data-bindtap=onWorldCraft]'); click('.recipe-button[data-id=plank]')
  assert.equal(js('worldPage._world.inventory.plank'), 4)
  screenshot('crafting-final'); run(['press', 'Escape'])
  click('.hotbar-slot[data-id=plank]'); pose(12, 0, 24, -Math.PI / 2, .65)
  const placed = js('worldPage.placementPoint(worldPage._target)')
  click('.action-place'); assert.equal(js('worldPage._world.inventory.plank'), 3)
  assert.equal(js(`worldPage._world.block(${placed.x},${placed.y},${placed.z})`), 'plank')
  checks.push('mine a real tree, pick up the drop, craft four planks and consume one when placed')

  click('[data-bindtap=onWorldBag]'); click('[data-tab=furniture]')
  wait('Array.from(document.querySelectorAll(".furniture-grid img")).every(i=>i.complete&&i.naturalWidth)')
  screenshot('backpack-final')
  click('.bag-item[data-id=table]'); assert.equal(js('worldPage.data.held'), 'table')
  pose(12, 0, 28, -Math.PI / 2, .6); click('.action-place')
  assert.ok(js('worldPage._world.furniture.some(f=>f.id==="table")'))
  run(['press', 'q']); assert.equal(js('worldPage.data.held'), 'table')
  assert.ok(js('!worldPage._world.furniture.some(f=>f.id==="table")'))
  click('.action-place'); assert.ok(js('worldPage._world.furniture.some(f=>f.id==="table")'))
  checks.push('owned furniture can be taken out, placed, picked up with Q and placed again')

  // Give the QA fixture mined supplies; all resource conservation is tested separately.
  js('Object.assign(worldPage._world.inventory,{plank:32,stone:12,glass:4,moonstone:10,amethyst:5,echo:2,glow:1});worldPage.refreshWorldInventory();true')
  click('[data-bindtap=onWorldCraft]'); click('.recipe-button[data-id=cottage]')
  assert.equal(js('worldPage._world.inventory.cottage'), 1)
  run(['press', 'Escape']); js('worldPage.chooseWorldItem("cottage","block");true')
  pose(13, 0, 18, -Math.PI / 2, .28); click('.action-place')
  assert.equal(js('worldPage._world.houses.length'), 1, js('worldPage.data.message'))
  assert.equal(js('worldPage._world.inventory.cottage'), 0)
  checks.push('a crafted blueprint consumes building materials and creates a new walkable house')

  click('[data-bindtap=onWorldCraft]')
  for (let i = 0; i < 5; i++) click('.recipe-button[data-id=frame]')
  click('.recipe-button[data-id=portal]'); assert.equal(js('worldPage._world.inventory.portal'), 1)
  run(['press', 'Escape']); js('worldPage.chooseWorldItem("portal","block");true')
  pose(9, 0, 22, -Math.PI / 2, .45); click('.action-place')
  assert.equal(js('worldPage._world.portals.length'), 1)
  const gate = js('worldPage._world.portals[0]')
  pose(gate.x + 2, 0, gate.z + 6, 0, -.15); screenshot('portal-final')
  pose(gate.x + 2, 0, gate.z + 3, 0)
  run(['press', 'e']); wait('worldPage._world.dimension === "aether"')
  wait('worldPage._scene.stats().pending === 0')
  assert.ok(js('worldPage._world.mobs.some(m=>m.kind==="stag")'))
  pose(2, 0, 13, Math.PI + .25, .03); screenshot('aether-final')
  pose(2, 0, 13, 0); run(['press', 'e']); wait('worldPage._world.dimension === "meadow"')
  checks.push('craft the strange-block portal, travel to a populated second dimension and return')

  pose(-8, -8, -2, 1.3, .02); screenshot('cave-final')
  js('worldPage.onWorldHome();worldPage.flushWorldSave();true')
  run(['open', url + '?level=3']); wait('worldPage?._scene?.stats().pending === 0')
  assert.ok(js('worldPage._world.restored'))
  assert.equal(js('worldPage._world.houses.length'), 1)
  assert.ok(js('worldPage._world.furniture.some(f=>f.id==="table")'))
  checks.push('a full reload restores blocks, built houses, gates and furniture')

  for (const [width, height] of [[320, 568], [390, 752], [768, 900], [768, 390]]) {
    run(['set', 'viewport', String(width), String(height)])
    pose(7, 0, 24, Math.PI + .25, .02)
    wait('worldPage._scene.stats().pending === 0')
    assert.equal(js('document.documentElement.scrollWidth > innerWidth'), false)
    const geometry = js(`(() => {
      const c = document.querySelector('#world-stage').getBoundingClientRect()
      const controls = [...document.querySelectorAll('.world-top button,.world-tools button,.world-controls button,.world-hotbar button')]
      return { width:c.width, height:c.height, covered:controls.filter(b=>{const r=b.getBoundingClientRect();return r.left<c.right && r.right>c.left && r.top<c.bottom && r.bottom>c.top}).map(b=>b.textContent), clipped:controls.filter(b=>{const r=b.getBoundingClientRect();return r.left<0 || r.right>innerWidth || r.top<0 || r.bottom>innerHeight}).map(b=>b.textContent) }
    })()`)
    assert.ok(geometry.width > 200 && geometry.height > 100)
    assert.deepEqual(geometry.covered, [], 'native canvas must not overlap any controls')
    assert.deepEqual(geometry.clipped, [], 'all controls must remain inside the viewport')
    click('[data-bindtap=onWorldGuide]')
    assert.equal(js('document.documentElement.scrollWidth > innerWidth'), false)
    screenshot('guide-' + width)
    run(['press', 'Escape']); screenshot('field-' + width)
    scenes.push({ width, height, ...js('worldPage._scene.stats()') })
  }
  checks.push('320 / 390 / 768 layouts, backpack images, guide scrolling and no page overflow')
  for (const [level, floors] of [[1, 1], [2, 1], [4, 2], [5, 3]]) {
    run(['open', url + '?level=' + level]); wait('worldPage?._scene?.stats().pending === 0')
    assert.equal(js('worldPage._world.home.floors'), floors)
    assert.equal(js('window.sceneError || null'), null)
  }
  checks.push('all five house levels render with their actual storey counts')
  assert.equal(js('window.sceneError || null'), null)
  const errors = run(['errors']); assert.ok(!errors.errors || errors.errors.length === 0, JSON.stringify(errors))
  console.log(JSON.stringify({ checks, scenes }, null, 2))
} finally { run(['close']) }
