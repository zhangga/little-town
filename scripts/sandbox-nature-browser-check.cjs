// Exercise the shipping WXML/controller/renderer. Fixture supplies never ship to WeChat.
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), { spawnSync } = require('node:child_process')
const session = 'world-nature-check-' + process.pid
const url = process.env.SANDBOX_PREVIEW_URL || 'http://127.0.0.1:9442/output/home-preview/sandbox.html'
const output = path.resolve('output/home-preview'), checks = [], scenes = []
function run(args, input) {
  const r = spawnSync('agent-browser', ['--session', session, '--json', ...args], { input, encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024 })
  if (r.error) throw r.error
  const data = JSON.parse(r.stdout)
  if (r.status || !data.success) throw Error(data.error || r.stderr)
  return data.data
}
const js = code => run(['eval', '--stdin'], code).result
const wait = condition => run(['wait', '--fn', condition])
const click = selector => { if (/recipe-button|bag-item/.test(selector)) run(['scrollintoview', selector]); run(['click', selector]) }
const pose = (x, y, z, yaw = 0, pitch = 0) => js(`qaPose(${[x, y, z, yaw, pitch].join(',')});true`)
const screenshot = name => run(['screenshot', path.join(output, 'world-nature-' + name + '.png')])
function animationDifference() {
  return js(`(()=>{
    const p=worldPage;p._scene.stop();p._world.player.moving=false;p._scene.render(3);p._scene.render(0);
    const c=document.querySelector('canvas'), gl=c.getContext('webgl'), a=new Uint8Array(c.width*c.height*4),b=new Uint8Array(a.length);
    gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,a);
    p._scene.render(1);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,b);
    let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>6)changed++;
    const error=gl.getError();p._scene.start();return {changed,error};
  })()`)
}
try {
  run(['set', 'viewport', '900', '780']); run(['open', url + '?level=3&reset=1'])
  wait('worldPage?._scene?.stats().pending === 0')
  const initial = js('worldPage._scene.stats()')
  assert.ok(initial.environment.shadows); assert.ok(initial.layers.water > 5); assert.ok(initial.layers.leaves > 10)
  pose(-2.5, 0, 12, .25, -.45)
  const leaves = animationDifference(); assert.equal(leaves.error, 0); assert.ok(leaves.changed > 50, JSON.stringify(leaves))
  screenshot('forest')
  pose(24.8, 0, 25, -1.15, .3)
  const water = animationDifference(); assert.equal(water.error, 0); assert.ok(water.changed > 50, JSON.stringify(water))
  screenshot('river')
  checks.push({ name: 'whole-world shadows, animated leaves and slow river water', leaves, water })

  // Mine a vein with the real targeting and mining action, outside the glade.
  pose(-6.5, -5, 6.5, -Math.PI / 2, 0)
  assert.equal(js('worldPage._target?.id'), 'quartz')
  click('.action-mine'); wait('worldPage._world.inventory.quartz === 1')
  screenshot('mine')
  checks.push('quartz is visible, targetable and mineable inside the main world cave')

  js('Object.assign(worldPage._world.inventory,{sand:4,coal:2,silver:2});worldPage.refreshWorldInventory();true')
  click('[data-bindtap=onWorldCraft]')
  for (const id of ['glass', 'glass', 'white_glass', 'mirror']) click('.recipe-button[data-id=' + id + ']')
  assert.equal(js('worldPage._world.inventory.white_glass'), 1); assert.equal(js('worldPage._world.inventory.mirror'), 1)
  screenshot('recipes')
  js('worldPage.onWorldHome();true'); pose(6.5, 0, 4, 0)
  click('[data-bindtap=onWorldBag]'); click('.bag-item[data-id=mirror]'); click('.action-place')
  assert.equal(js('worldPage._world.block(6,1,1)'), 'mirror')
  wait('worldPage._scene.stats().mirrors.active === 1')
  const reflected = js('worldPage._scene.stats().mirrors.lastViews[0]')
  assert.equal(reflected.angle, 0); assert.ok(Math.abs(reflected.eye[2] + reflected.virtualEye[2] - 4.01) < .001)
  assert.deepEqual(reflected.actor, [6.5, 0, 4]); screenshot('mirror-home')
  click('.action-mine'); wait('worldPage._world.inventory.mirror === 1')
  wait('worldPage._scene.stats().mirrors.active === 0')
  pose(7.5, 0, 7.5, -Math.PI / 2)
  click('[data-bindtap=onWorldBag]'); click('.bag-item[data-id=mirror]')
  for (let i = 0; i < 4; i++) click('[data-bindtap=onWorldRotate]')
  assert.equal(js('worldPage.data.rotation'), 270); click('.action-place')
  assert.equal(js('worldPage._world.block(10,1,7)'), 'mirror')
  wait('worldPage._scene.stats().mirrors.lastViews[0]?.angle === 270')
  const turned = js('worldPage._scene.stats().mirrors.lastViews[0]')
  assert.ok(Math.abs(turned.eye[0] + turned.virtualEye[0] - 19.99) < .001)
  screenshot('mirror-rotated')
  pose(4.5, 0, 8.5, -Math.PI / 2, .55)
  click('[data-bindtap=onWorldBag]'); click('.bag-item[data-id=white_glass]')
  const place = js('worldPage.updateWorldTarget();worldPage.placementPoint(worldPage._target)')
  click('.action-place')
  assert.equal(js(`worldPage._world.block(${place.x},${place.y},${place.z})`), 'white_glass')
  assert.equal(js('worldPage._world.inventory.white_glass'), 0)
  wait('worldPage._scene.stats().layers.white_glass > 0'); screenshot('white-glass-home')
  js('worldPage.flushWorldSave();true')
  run(['open', url + '?level=3']); wait('worldPage?._scene?.stats().pending === 0')
  assert.equal(js('worldPage._world.block(10,1,7)'), 'mirror')
  assert.equal(js('worldPage._world.reflectors()[0].angle'), 270)
  assert.equal(js(`worldPage._world.block(${place.x},${place.y},${place.z})`), 'white_glass')
  checks.push('craft, carry home, place, reflect the player, mine, rotate, replace and reload both crafted blocks')

  // Stress the reflection budget using three simultaneously visible placed mirrors.
  pose(27.5, 0, 18, 0)
  const placements = js('worldPage._world.inventory.mirror=3;[26,27,28].map(x=>worldPage._world.place("mirror",{x,y:1,z:14},0))')
  assert.ok(placements.every(p => p.ok), JSON.stringify(placements))
  wait('worldPage._scene.stats().mirrors.active === 2')
  checks.push('three visible mirrors share a strict two-live-reflection budget')

  js('const w=worldPage._world;w.inventory.portal=1;w.placePortal({x:25,y:0,z:19});Object.assign(w.player,{x:26,y:0,z:22});w.travel(w.portals.find(p=>p.dimension==="meadow"));true')
  wait('worldPage._world.dimension === "aether" && worldPage._scene.stats().pending === 0')
  assert.equal(js('worldPage._scene.stats().mirrors.active'), 0)
  const other = js('worldPage._scene.stats()'); assert.ok(other.layers.water > 5); assert.ok(other.layers.leaves > 5)
  pose(24.8, 0, 25, -1.15, .25); screenshot('aether-river')
  checks.push('the second dimension uses the same foliage, water and lighting system; previous mirrors are removed')
  for (const [width, height] of [[320, 740], [390, 844], [768, 900]]) {
    run(['set', 'viewport', String(width), String(height)]); js('worldPage.onWorldHome();true')
    pose(24, 0, -7, -.38, .15); wait('worldPage._scene.stats().pending === 0')
    assert.equal(js('document.documentElement.scrollWidth > innerWidth'), false)
    assert.ok(js('document.querySelector("canvas").getBoundingClientRect().height') > 250)
    screenshot('world-' + width); scenes.push({ width, height, ...js('worldPage._scene.stats()') })
    click('[data-bindtap=onWorldBag]'); assert.equal(js('document.querySelector("canvas").hidden'), true); run(['press', 'Escape'])
    assert.equal(js('document.querySelector("canvas").hidden'), false)
  }
  assert.equal(js('window.sceneError || null'), null)
  const errors = run(['errors']); assert.ok(!errors.errors || !errors.errors.length, JSON.stringify(errors))
  const consoleMessages = run(['console']); assert.ok(!consoleMessages.messages.some(m => /shader|feedback loop|INVALID_|WebGLProgram/i.test(m.text || '')), JSON.stringify(consoleMessages))
  fs.writeFileSync(path.join(output, 'world-nature-check.json'), JSON.stringify({ checks, scenes }, null, 2))
  console.log(JSON.stringify({ checks, scenes }, null, 2))
} finally { run(['close']) }
