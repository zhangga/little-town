const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright')
const url=process.env.HOME_PREVIEW_URL||'http://127.0.0.1:9435/output/home-preview/space.html'
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2}),errors=[];p.on('pageerror',e=>errors.push(e.message))
  await p.goto(url);await p.waitForFunction(()=>roomPage?._scene);await p.getByRole('button',{name:'第一人称',exact:true}).click()
  const yaw=await p.evaluate(()=>roomPage._scene.stats().camera.yaw)
  await p.mouse.move(140,420);await p.mouse.down();await p.mouse.move(140+yaw/.007,420,{steps:10});await p.mouse.up()
  assert.ok(Math.abs(await p.evaluate(()=>roomPage._scene.stats().camera.yaw))<.01)
  const hold=async(key,condition)=>{await p.keyboard.down(key);await p.waitForFunction(condition);await p.keyboard.up(key);await p.waitForFunction(()=>!roomPage._actor.moving)}
  await hold('s',()=>roomPage._actor.y>6.7);assert.ok(await p.evaluate(()=>roomPage._actor.y<7))
  await p.keyboard.press('e');await p.waitForFunction(()=>roomPage._scene.stats().doorProgress>.9);assert.equal(await p.evaluate(()=>roomPage.data.roomDoorOpen),true);assert.ok(await p.evaluate(()=>roomPage._scene.stats().doorProgress>.9))
  await hold('s',()=>roomPage._actor.y>6.91);assert.ok(await p.evaluate(()=>Math.abs(roomPage._actor.y-7)<.35))
  await p.keyboard.press('e');assert.equal(await p.evaluate(()=>roomPage.data.roomDoorOpen),true)
  await hold('s',()=>roomPage._actor.y>7.6);assert.ok(await p.evaluate(()=>roomPage._actor.y>7.35));await p.keyboard.press('e');assert.equal(await p.evaluate(()=>roomPage.data.roomDoorOpen),false)
  await hold('w',()=>roomPage._actor.y<7.35);assert.ok(await p.evaluate(()=>roomPage._actor.y>7))
  await p.keyboard.press('e');await hold('w',()=>roomPage._actor.y<6.8);assert.ok(await p.evaluate(()=>roomPage._actor.y<7))
  await p.getByRole('button',{name:'全屋',exact:true}).click();await p.waitForTimeout(100);await p.screenshot({path:path.resolve('output/home-preview/space-door-open.png')})
  const scenes=[]
  for(const [level,size]of [[2,9],[3,12],[4,16],[5,20]]){
   await p.goto(url+'?level='+level);await p.waitForFunction(()=>roomPage?._scene);await p.waitForTimeout(120)
   const stats=await p.evaluate(()=>roomPage._scene.stats());assert.equal(stats.size,size);assert.equal(stats.level,level);scenes.push({level,size,drawCalls:stats.calls,triangles:stats.triangles})
   await p.getByRole('button',{name:'外观',exact:true}).click();await p.waitForTimeout(100)
   if(level===5)await p.screenshot({path:path.resolve('output/home-preview/villa-exterior-final.png')})
  }
  assert.equal(await p.evaluate(()=>roomPage.data.roomDraft.length),24)
  await p.getByRole('button',{name:'第一人称',exact:true}).click();await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>roomPage._scene.stats().avatarVisible),false)
  await p.screenshot({path:path.resolve('output/home-preview/villa-first-person-final.png')})
  await p.getByRole('button',{name:'第三人称',exact:true}).click();await p.getByRole('button',{name:'全屋',exact:true}).click();await p.waitForTimeout(100)
  await p.screenshot({path:path.resolve('output/home-preview/villa-interior-final.png')})
  await p.getByRole('button',{name:'打开家具小背包'}).click();await p.waitForFunction(()=>Array.from(document.querySelectorAll('.room-bag-items img')).every(i=>i.complete&&i.naturalWidth));await p.screenshot({path:path.resolve('output/home-preview/villa-backpack-final.png')})
  assert.equal(await p.locator('.room-bag-items [data-id]').count(),24)
  assert.deepEqual(await p.locator('.room-bag-items img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)),[])
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:['closed door collision','E opens animated door','no closing on player','exit and re-enter porch','all four expansions','first/third person in villa','24 furnished models and backpack thumbnails'],scenes},null,2))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
