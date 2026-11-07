// Run the preview server first. Uses real browser events against the native-template bridge.
const assert=require('node:assert/strict'),path=require('node:path')
const {chromium}=require('playwright')
const url=process.env.HOME_PREVIEW_URL||'http://127.0.0.1:9435/output/home-preview/space.html'
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url);await page.waitForFunction(()=>window.roomPage?._scene);await page.waitForTimeout(900)
  const initial=await page.evaluate(()=>roomPage._scene.stats())
  assert.ok(initial.triangles>2000);assert.ok(initial.calls<220)
  await page.screenshot({path:path.resolve('output/home-preview/space-third-person.png')})
  await page.getByRole('button',{name:'第一人称',exact:true}).click();await page.waitForTimeout(100)
  const first=await page.evaluate(()=>roomPage._scene.stats());assert.equal(first.camera.mode,'first');assert.equal(first.avatarVisible,false);assert.equal(first.camera.eye.x,first.position.x);assert.equal(first.camera.eye.z,first.position.y)
  await page.screenshot({path:path.resolve('output/home-preview/space-first-person.png')})
  await page.keyboard.press('v');assert.equal(await page.evaluate(()=>roomPage.data.roomCamera),'close')
  await page.keyboard.down('w');await page.waitForFunction(start=>Math.hypot(roomPage._actor.x-start.x,roomPage._actor.y-start.y)>.25,initial.position);await page.keyboard.up('w');await page.waitForFunction(()=>!roomPage._actor.moving)
  const walked=await page.evaluate(()=>({...roomPage._actor}));assert.ok(Math.hypot(walked.x-initial.position.x,walked.y-initial.position.y)>.15)
  assert.equal(walked.moving,false)
  await page.getByRole('button',{name:'打开家具小背包'}).click();await page.screenshot({path:path.resolve('output/home-preview/space-backpack-final.png')})
  await page.locator('.room-bag-items [data-id="chair"]').click()
  const points=await page.evaluate(()=>({from:roomPage._scene.project(4.6,3.4,.5),to:roomPage._scene.project(3.5,4.5,0)}))
  await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();await page.mouse.move(points.to.x,points.to.y,{steps:12});await page.mouse.up()
  const dragged=await page.evaluate(()=>roomPage.data.roomDraft.find(p=>p.id==='chair'))
  assert.ok(Math.abs(dragged.x-3.5)<.04&&Math.abs(dragged.y-4.5)<.04,JSON.stringify(dragged))
  await page.locator('input[type=range]').evaluate(el=>{el.value=137;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})
  await page.waitForTimeout(150)
  assert.equal(await page.evaluate(()=>roomPage.data.roomDraft.find(p=>p.id==='chair').angle),137)
  await page.screenshot({path:path.resolve('output/home-preview/space-placement-final.png')})
  await page.getByText('保存布置',{exact:true}).click();await page.waitForFunction(()=>!roomPage.data.roomEditing)
  await page.goto(url+'?saved=1');await page.waitForFunction(()=>window.roomPage?._scene)
  const restored=await page.evaluate(()=>roomPage.data.roomDraft.find(p=>p.id==='chair'))
  assert.deepEqual(restored,{...dragged,angle:137})
  // Camera orbit uses empty space; keyboard directions remain relative to the view.
  const yaw=await page.evaluate(()=>roomPage._scene.stats().camera.yaw)
  await page.mouse.move(190,300);await page.mouse.down();await page.mouse.move(260,315,{steps:8});await page.mouse.up()
  assert.notEqual(await page.evaluate(()=>roomPage._scene.stats().camera.yaw),yaw)
  await page.getByRole('button',{name:'全屋',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:path.resolve('output/home-preview/space-close-final.png')})
  // Each phone width keeps the room, WASD and small backpack within the viewport.
  for(const [width,height]of [[320,568],[390,844],[768,650]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(100)
   const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.body.scrollWidth,bag:document.querySelector('.room-bag-button').getBoundingClientRect().toJSON(),keys:document.querySelector('.room-wasd').getBoundingClientRect().toJSON()}))
   assert.equal(layout.scroll,width);assert.ok(layout.bag.right<=width&&layout.bag.bottom<=height);assert.ok(layout.keys.left>=0&&layout.keys.bottom<=height)
  }
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({checks:['WebGL render','first/third person and V','WASD press/release','backpack','drag furniture','137-degree rotation','save/reload','camera orbit','close view','320/390/768 responsive'],drawCalls:initial.calls,triangles:initial.triangles,restored},null,2))
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
