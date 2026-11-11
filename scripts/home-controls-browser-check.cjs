const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright')
const url=process.env.HOME_PREVIEW_URL||'http://127.0.0.1:9435/output/home-preview/space.html'
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1}),errors=[];p.on('pageerror',e=>errors.push(e.message))
  const stats=()=>p.evaluate(()=>roomPage._scene.stats())
  await p.goto(url);await p.waitForFunction(()=>window.roomPage?._scene)
  const initial=await stats();await p.mouse.move(180,380);await p.mouse.move(235,390,{steps:8})
  let turned=await stats();assert.ok(turned.camera.yaw<initial.camera.yaw-.2);assert.ok(turned.camera.pitch>initial.camera.pitch)
  await p.keyboard.press('v');const first=await stats();assert.equal(first.camera.mode,'first')
  await p.mouse.move(270,420,{steps:8});turned=await stats();assert.ok(turned.camera.yaw<first.camera.yaw);assert.ok(turned.camera.lookPitch>first.camera.lookPitch)
  await p.keyboard.down('w');await p.keyboard.down('Space');await p.waitForFunction(()=>roomPage._scene.stats().position.elevation>.3)
  const firstJump=await stats();assert.equal(firstJump.avatarVisible,false);assert.ok(firstJump.camera.eye.y>1.35)
  await p.screenshot({path:path.resolve('output/home-preview/controls-first-jump.png')})
  await p.waitForFunction(()=>!roomPage._actor.airborne);await p.keyboard.up('w');await p.waitForFunction(()=>!roomPage._actor.moving)
  const landed=await stats();assert.equal(landed.position.elevation,0);assert.ok(Math.hypot(landed.position.x-firstJump.position.x,landed.position.y-firstJump.position.y)>.1)
  assert.ok(Math.abs(landed.camera.eye.y-1.05)<.02)
  await p.waitForTimeout(700);assert.equal((await stats()).position.elevation,0);await p.keyboard.up('Space')
  await p.keyboard.press('Space');await p.keyboard.press('v');await p.waitForFunction(()=>roomPage._scene.stats().avatarElevation>.25)
  const thirdJump=await stats();assert.equal(thirdJump.avatarVisible,true);assert.equal(thirdJump.camera.mode,'close')
  await p.screenshot({path:path.resolve('output/home-preview/controls-third-jump.png')})
  await p.waitForFunction(()=>!roomPage._actor.airborne)
  await p.keyboard.press('Escape');const stopped=await stats();await p.mouse.move(200,400);await p.mouse.move(245,420,{steps:8});assert.equal((await stats()).camera.yaw,stopped.camera.yaw)
  await p.keyboard.press('m');await p.mouse.move(210,400);await p.mouse.move(240,415,{steps:8});assert.notEqual((await stats()).camera.yaw,stopped.camera.yaw)
  await p.getByRole('button',{name:'打开家具小背包'}).click();const bag=await stats();await p.mouse.move(170,350);await p.mouse.move(220,370,{steps:8});await p.keyboard.press('Space')
  assert.equal((await stats()).camera.yaw,bag.camera.yaw);assert.equal((await stats()).position.elevation,0)
  await p.getByRole('button',{name:'收起小背包'}).click();await p.getByRole('button',{name:'空格跳跃'}).click();await p.waitForFunction(()=>roomPage._actor.elevation>.1)
  await p.waitForFunction(()=>!roomPage._actor.airborne)
  for(const [width,height]of [[320,568],[390,844],[768,650]]){
   await p.setViewportSize({width,height});const layout=await p.evaluate(()=>({width:innerWidth,scroll:document.body.scrollWidth,jump:document.querySelector('.room-jump').getBoundingClientRect().toJSON(),bag:document.querySelector('.room-bag-button').getBoundingClientRect().toJSON(),keys:document.querySelector('.room-wasd').getBoundingClientRect().toJSON()}))
   assert.equal(layout.scroll,width);assert.ok(layout.keys.right<layout.jump.left);assert.ok(layout.jump.right<layout.bag.left);assert.ok(layout.jump.bottom<=height)
  }
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({checks:['mouse hover without a button','first/third person mouse yaw and pitch','Space jump camera and avatar','jump while walking','landing and held-key repeat guard','Escape / M mouse control','backpack input isolation','touch jump button','320/390/768 layout'],firstJumpHeight:firstJump.position.elevation,thirdJumpHeight:thirdJump.avatarElevation},null,2))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
