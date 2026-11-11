const test=require('node:test'),assert=require('node:assert/strict')
const {roomHarness,fixture,tap,clone}=require('./home-room-test.cjs')
const {createRoomScenePage,keyboardKey}=require('../miniapp/home/utils/home-room-scene-page')
const space=require('../miniapp/home/utils/home-space')
const advance=(page,frames=1)=>{for(let i=0;i<frames;i++)page.tickRoom(1/60)}

test('Space rises, peaks, lands exactly, and can jump again after release',()=>{
 const {page}=roomHarness();page.setRoomKey('space',true)
 assert.equal(page.data.roomJumping,true);assert.equal(page._actor.airborne,true)
 advance(page,18);assert.ok(Math.abs(page._actor.elevation-.72)<1e-6)
 page.setRoomKey('space',true);advance(page,25)
 assert.equal(page._actor.elevation,0);assert.equal(page._actor.airborne,false);assert.equal(page.data.roomJumping,false)
 page.setRoomKey('space',true);advance(page);assert.equal(page._actor.elevation,0)
 page.setRoomKey('space',false);page.setRoomKey('space',true);advance(page);assert.ok(page._actor.elevation>0)
})
test('airborne presses cannot double jump and both camera modes keep the same jump',()=>{
 const {page}=roomHarness();page.onRoomJump();advance(page,10)
 const height=page._actor.elevation,velocity=page._jumpVelocity
 page.setRoomKey('space',true);assert.equal(page._jumpVelocity,velocity);assert.equal(page._actor.elevation,height)
 page.onRoomPerspective();assert.equal(page.data.roomCamera,'first');assert.equal(page._actor.elevation,height)
 page.onRoomPerspective();assert.equal(page.data.roomCamera,'close');advance(page,40);assert.equal(page._actor.elevation,0)
})
test('jumping preserves WASD movement, keeps wall collisions and never changes saved furniture',()=>{
 const h=roomHarness(),layout=clone(h.page.data.roomDraft),start={...h.page._actor}
 h.page.setRoomKey('w',true);h.page.onRoomJump();advance(h.page,18)
 assert.ok(h.page._actor.y<start.y-.4);assert.ok(h.page._actor.elevation>.7)
 assert.equal(space.canWalk(h.page._actor,layout,h.server.furniture,h.page.roomGeometry()),true)
 h.page.stopRoomWalk();h.page._actor.y=.19;h.page.setRoomKey('w',true);h.page.onRoomJump();advance(h.page,40)
 assert.ok(h.page._actor.y>=space.RADIUS);assert.equal(h.page._actor.elevation,0);assert.deepEqual(h.page.data.roomDraft,layout)
})
test('backpack and hide safely land the player; UI states cannot start a jump',()=>{
 const {page}=roomHarness();page.onRoomJump();advance(page,5);page.onRoomBag()
 assert.equal(page._actor.elevation,0);assert.equal(page._actor.airborne,false);assert.equal(page.data.roomJumping,false)
 for(const key of ['roomBagOpen','roomEditing','roomTV','busy']){
  page.setData({roomBagOpen:false,roomEditing:false,roomTV:false,busy:false,[key]:true});page.onRoomJump();assert.equal(page._actor.airborne,false,key)
 }
 page.setData({busy:false});page._visible=false;page.onRoomJump();assert.equal(page._actor.airborne,false)
 page._visible=true;page.onRoomJump();advance(page,5);page.stopRoomWalk();assert.equal(page._actor.elevation,0)
})
test('jumping from a seat first returns to a free standing spot',()=>{
 const s=fixture();s.room.layout=[{id:'chair',x:3,y:3,angle:0,rotation:0}]
 const h=roomHarness(s);h.page.onRoomFurniture(tap({id:'chair'}));h.flush();assert.equal(h.page._actor.pose,'sit')
 h.page.onRoomJump();assert.equal(h.page._actor.pose,'');assert.equal(h.page._seatReturn,null)
 assert.equal(space.canWalk(h.page._actor,h.page.data.roomDraft,s.furniture,h.page.roomGeometry()),true)
})
test('keyboard accepts native Space and Escape formats while leaving shortcuts alone',()=>{
 for(const e of [{code:'Space',key:' '},{key:' '},{key:'Spacebar'}])assert.equal(keyboardKey(e),'space')
 assert.equal(keyboardKey({code:'Escape'}),'escape');assert.equal(keyboardKey({code:'KeyM'}),'m')
 assert.equal(keyboardKey({code:'Space',altKey:'true'}),'');assert.equal(keyboardKey({code:'Space',ctrlKey:true}),'')
})
function pointerHarness(){
 const h=roomHarness(),orbits=[];Object.assign(h.page,createRoomScenePage({}))
 h.page._scene={orbit:(x,y)=>orbits.push([x,y]),setActor(){}}
 const move=(x,y,extra={})=>h.page.onRoomPointerMove({target:{id:'home-space'},detail:{pointerType:'mouse',buttons:0,clientX:x,clientY:y,...extra}})
 return {...h,orbits,move}
}
test('hovering a mouse turns either play camera without pressing or dragging',()=>{
 const {page,orbits,move}=pointerHarness();move(100,200);move(125,190)
 assert.deepEqual(orbits,[[25,-10]]);assert.equal(page.data.roomMouseAvailable,true)
 page.setData({roomCamera:'first'});move(130,205);assert.deepEqual(orbits[1],[5,15])
 move(150,220,{pointerType:'touch'});assert.equal(orbits.length,2)
})
test('mouse look pauses over UI, during touch drags, in menus and outside play views',()=>{
 const {page,orbits,move}=pointerHarness();move(100,200)
 page.onRoomPointerMove({target:{id:'menu'},detail:{pointerType:'mouse',clientX:150,clientY:210}})
 move(170,220);assert.equal(orbits.length,0)
 for(const key of ['roomEditing','roomBagOpen','roomTV','roomHelp','busy']){page.setData({[key]:true});move(175,225);assert.equal(page._roomPointer,null);page.setData({[key]:false})}
 for(const roomCamera of ['overview','outside']){page.setData({roomCamera});move(175,225);assert.equal(page._roomPointer,null)}
 page.setData({roomCamera:'close'});page._gesture={};move(175,225);assert.equal(page._roomPointer,null)
 page._gesture=null;move(175,225,{buttons:1});assert.equal(page._roomPointer,null)
 page._visible=false;move(180,230);assert.equal(orbits.length,0)
})
test('Escape releases mouse look, M resumes once per press, and window re-entry does not snap',()=>{
 const {page,orbits,move}=pointerHarness();move(100,200);move(110,210)
 page.setRoomKey('escape',true);assert.equal(page.data.roomMouseLook,false);move(120,220);assert.equal(orbits.length,1)
 page.setRoomKey('m',true);page.setRoomKey('m',true);assert.equal(page.data.roomMouseLook,true)
 move(130,230);assert.equal(orbits.length,1);move(140,240);assert.equal(orbits.length,2)
 page.onRoomPointerLeave();move(300,500);assert.equal(orbits.length,2)
 move(10,10);assert.equal(orbits.length,2)
 page.setRoomKey('m',false);page.setRoomKey('m',true);assert.equal(page.data.roomMouseLook,false)
})
