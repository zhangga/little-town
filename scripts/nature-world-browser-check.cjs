const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright')
const url=process.env.HOME_PREVIEW_URL||'http://127.0.0.1:9435/output/home-preview/space.html'
async function main(){
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1}),errors=[]
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.text().startsWith('THREE.'))errors.push(m.text())})
    await page.goto(url);await page.waitForFunction(()=>roomPage.data.roomSceneReady)
    const original=await page.evaluate(()=>JSON.stringify(roomPage.data.roomDraft))
    await page.getByRole('button',{name:/去林溪探索/}).click();await page.waitForFunction(()=>roomPage.data.natureExploring)
    const first=await page.evaluate(()=>roomPage._scene.stats());await page.waitForFunction(t=>roomPage._scene.stats().nature.time>t+.15,first.nature.time)
    const second=await page.evaluate(()=>roomPage._scene.stats());assert.ok(second.nature.flow>first.nature.flow);assert.notEqual(second.nature.wind,first.nature.wind);assert.equal(second.nature.waterSpeed,.18)
    await page.keyboard.press('e');assert.equal(await page.evaluate(()=>roomPage._natureState.inventory.wood),3)
    await page.keyboard.down('w');await page.waitForFunction(y=>roomPage._actor.y>y+.15,first.position.y);await page.keyboard.up('w')
    await page.keyboard.press('Space');await page.waitForFunction(()=>roomPage._actor.elevation>.1);await page.waitForFunction(()=>!roomPage._actor.airborne)
    await page.screenshot({path:path.resolve('output/home-preview/nature-forest-final.png')})
    await page.keyboard.press('b');await page.waitForFunction(()=>roomPage.data.natureBagOpen)
    assert.equal(await page.locator('.nature-recipe').count(),10);assert.equal(await page.locator('.nature-craft-button:enabled').count(),0)
    await page.screenshot({path:path.resolve('output/home-preview/nature-recipes-final.png')})
    await page.keyboard.press('b');assert.equal(await page.evaluate(()=>roomPage.data.natureBagOpen),false)
    // QA supplies gathered ingredients; each craft still goes through the real UI,
    // distance checks, exact deductions, account-local save and scene update.
    await page.evaluate(()=>{
      roomPage._natureState.inventory={wood:4,stone:3,sand:4,quartz:4,coal:3,silver:2,amethyst:2,fluorite:1}
      const s=roomPage.data.roomSize;Object.assign(roomPage._actor,{x:s/2-5.5,y:s+1.8+4.3,pose:''});roomPage._scene.setActor(roomPage._actor);roomPage.refreshNatureWorld()
    })
    await page.keyboard.press('b')
    for(const id of ['glass','glass','white_glass','mirror','crystal']){
      const b=page.locator('.nature-craft-button[data-id="'+id+'"]');await b.scrollIntoViewIfNeeded();await b.click()
    }
    assert.equal(await page.evaluate(()=>roomPage._natureState.inventory.mirror),1)
    assert.equal(await page.evaluate(()=>roomPage._natureState.inventory.white_glass),1)
    await page.keyboard.press('b')
    await page.evaluate(()=>{const s=roomPage.data.roomSize;Object.assign(roomPage._actor,{x:s/2-2,y:s+1.8+3.8,pose:'',angle:Math.PI});roomPage._scene.setActor(roomPage._actor)})
    const priorReflections=await page.evaluate(()=>roomPage._scene.stats().nature.reflections.updates)
    await page.getByRole('button',{name:'第一人称',exact:true}).click()
    // Point straight at the common mirror plane (positive z).
    await page.evaluate(()=>{const yaw=roomPage._scene.stats().camera.yaw;roomPage._scene.orbit((yaw-Math.PI)/.007,0)})
    await page.waitForFunction(n=>{const r=roomPage._scene.stats().nature.reflections,p=roomPage._actor;return r.updates>n+1&&r.lastView&&Math.abs(r.lastView.eye[0]-p.x)<.001&&Math.abs(r.lastView.eye[2]-p.y)<.001&&Math.abs(r.lastView.actor[0]-p.x)<.001},priorReflections)
    assert.equal(await page.evaluate(()=>roomPage._scene.stats().avatarVisible),false)
    await page.screenshot({path:path.resolve('output/home-preview/nature-mirror-final.png')})
    const reflection=await page.evaluate(()=>roomPage._scene.stats().nature.reflections)
    await page.evaluate(()=>{const s=roomPage.data.roomSize;Object.assign(roomPage._actor,{x:s/2-10.2,y:s+1.8+20,angle:Math.PI});roomPage._scene.setActor(roomPage._actor);roomPage._scene.orbit(-Math.PI/2/.007,0)})
    await page.waitForFunction(()=>roomPage.data.natureRegion==='晶石矿洞')
    await page.screenshot({path:path.resolve('output/home-preview/nature-cave-final.png')})
    await page.getByRole('button',{name:'回小家 ↗',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.stringify(roomPage.data.roomDraft)),original)
    await page.reload();await page.waitForFunction(()=>roomPage.data.roomSceneReady);await page.getByRole('button',{name:/去林溪探索/}).click()
    assert.equal(await page.evaluate(()=>roomPage._natureState.inventory.mirror),1)
    assert.ok((await page.evaluate(()=>roomPage._scene.stats().nature.displays)).includes('mirror'))
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'打开材料与合成背包'}).click()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
      const card=await page.locator('.nature-crafting').boundingBox();assert.ok(card.y>=0&&card.y+card.height<=844)
      const b=page.locator('.nature-craft-button').last();await b.scrollIntoViewIfNeeded();assert.equal(await b.isVisible(),true)
      await page.getByRole('button',{name:'关闭合成背包'}).click()
    }
    assert.deepEqual(errors,[])
    console.log(JSON.stringify({checks:['wind and slow animated water','real WASD and jump','E collection','B opens and closes','10 recipes','glass, white glass, silver mirror and crystal crafting','live first-person reflection','roofed cave','home restoration','persistent display ownership','320/390/768 layouts'],drawCalls:second.calls,triangles:second.triangles,reflection},null,2))
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
