const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const space=require('../miniapp/home/utils/home-space')
const {createRoomScenePage,keyboardKey}=require('../miniapp/home/utils/home-room-scene-page')
const {fixture,roomHarness,tap,clone}=require('./home-room-test.cjs')
const cases=require('../backend/internal/services/testdata/home-space.json')
const all=()=>{const s=fixture();s.furniture.forEach(i=>i.owned=true);return s}
for(const c of cases)test('continuous layout: '+c.name,()=>{
 const catalog=all().furniture
 assert.equal(c.layout.every(p=>space.canPlace(c.layout,catalog,p)),c.valid)
})
test('old quarter-turn saves retain their exact occupied area in the new room',()=>{
 const catalog=all().furniture
 assert.deepEqual(space.normalize({id:'bed',x:5,y:6,rotation:1},catalog),{id:'bed',x:6,y:6.5,rotation:0,angle:90})
 const normalized=space.normalize({id:'sofa',x:1,y:2,rotation:0},catalog)
 assert.equal(space.canPlace([],catalog,normalized),true)
 assert.equal(space.canWalk({x:1.5,y:2.5},[normalized],catalog),false)
 assert.equal(space.canWalk({x:3.5,y:2.5},[normalized],catalog),true)
})
test('invalid numbers and unowned furniture cannot enter a draft',()=>{
 const h=roomHarness();const p={id:'chair',x:2,y:2,angle:0,rotation:0}
 for(const value of [NaN,Infinity,-Infinity])assert.equal(space.canPlace([],h.server.furniture,{...p,x:value}),false)
 assert.equal(space.canPlace([],h.server.furniture,{...p,id:'tv'}),false)
 h.page.onRoomChoose(tap({id:'tv'}));assert.equal(h.page.data.roomEditing,false)
})
test('walking slides along furniture, cannot tunnel through it, and rugs remain walkable',()=>{
 const catalog=all().furniture,layout=[{id:'sofa',x:3,y:3,angle:27,rotation:0},{id:'rug',x:5,y:5,angle:80,rotation:0}]
 const next=space.move({x:3,y:5},0,-10,layout,catalog)
 assert.ok(next.y>3);assert.equal(space.canWalk(next,layout,catalog),true)
 assert.equal(space.canWalk({x:5,y:5},layout,catalog),true)
 const route=space.pathTo({x:3,y:5},{x:3,y:1},layout,catalog)
 assert.ok(route.length>1);let previous={x:3,y:5}
 for(const p of route){assert.equal(space.clearSegment(previous,p,layout,catalog),true);previous=p}
})
test('diagonal WASD has the same speed, and release and modal opening stop held keys',()=>{
 const a=roomHarness(),b=roomHarness();a.page.setRoomKey('w',true);b.page.setRoomKey('w',true);b.page.setRoomKey('a',true)
 for(let i=0;i<10;i++){a.page.tickRoom(1/30);b.page.tickRoom(1/30)}
 const distance=h=>Math.hypot(h.page._actor.x-space.ENTRY.x,h.page._actor.y-space.ENTRY.y)
 assert.ok(Math.abs(distance(a)-distance(b))<1e-6)
 b.page.onRoomBag();const before=clone(b.page._actor);b.page.tickRoom(.05);assert.deepEqual(b.page._actor,before);assert.deepEqual(b.page.data.roomKeys,{})
})
test('seat interactions can be left by WASD or a floor destination',()=>{
 for(const id of ['chair','sofa','bed']){
  const s=all();s.room.layout=[{id,x:3,y:3,rotation:0,angle:0}];const h=roomHarness(s)
  h.page.onRoomFurniture(tap({id}));h.flush();assert.equal(h.page.data.roomAction,id)
  h.page.setRoomKey('s',true);h.page.tickRoom(.05);assert.equal(space.canWalk(h.page._actor,h.page.data.roomDraft,s.furniture),true)
  h.page.setRoomKey('s',false);h.page.onRoomFurniture(tap({id}));h.flush();h.page.onRoomFloor({x:5,y:5});h.flush()
  assert.ok(Math.hypot(h.page._actor.x-5,h.page._actor.y-5)<.03)
 }
})
test('a furniture item moves freely, rotates to 137 degrees, saves, reloads and returns to the backpack',async()=>{
 const h=roomHarness(all());h.page.onRoomBag();h.page.onRoomChoose(tap({id:'sofa'}));assert.equal(h.page.data.roomBagOpen,false)
 h.page.onRoomFloor({x:4.125,y:3.275});h.page.onRoomRotateEnd({detail:{value:137}})
 const placed=h.page.data.roomDraft.find(p=>p.id==='sofa');assert.equal(placed.angle,137);assert.equal(placed.x,4.125);assert.equal(placed.y,3.275)
 await h.page.onRoomSave();assert.equal(h.calls.length,1)
 const reopened=roomHarness(h.server);assert.deepEqual(reopened.page.data.roomDraft.find(p=>p.id==='sofa'),placed)
 reopened.page.onRoomChoose(tap({id:'sofa'}));reopened.page.onRoomStore();await reopened.page.onRoomSave()
 assert.equal(reopened.page.data.roomInventory.find(i=>i.id==='sofa').placed,false);assert.equal(reopened.server.furniture.find(i=>i.id==='sofa').owned,true)
})
test('invalid rotation shows a blocked preview, preserves last good placement and prevents save',async()=>{
 const h=roomHarness();h.page.onRoomChoose(tap({id:'chair'}));h.page.onRoomFloor({x:.5,y:.5})
 h.page.onRoomRotateEnd({detail:{value:45}});assert.equal(h.page.data.roomPreviewValid,false);assert.equal(h.page.data.roomDraft[0].angle,0)
 await h.page.onRoomSave();assert.equal(h.calls.length,0);assert.equal(h.page.data.roomEditing,true)
 h.page.onRoomFloor({x:2,y:2});await h.page.onRoomSave();assert.equal(h.calls.length,1)
})
test('real keyboard binding and scene pause remove only their own listeners',()=>{
 const listeners={down:new Set(),up:new Set()};const wx={onKeyDown:fn=>listeners.down.add(fn),onKeyUp:fn=>listeners.up.add(fn),offKeyDown:fn=>listeners.down.delete(fn),offKeyUp:fn=>listeners.up.delete(fn)}
 const h=roomHarness();Object.assign(h.page,createRoomScenePage(wx));h.page.bindRoomKeyboard();h.page.bindRoomKeyboard();assert.equal(listeners.down.size,1)
 const fn=[...listeners.down][0];fn({code:'KeyW',key:'W',altKey:false});assert.equal(h.page._heldKeys.has('w'),true)
 assert.equal(keyboardKey({code:'KeyW',altKey:'true'}),'')
 let stops=0,disposes=0;h.page._scene={stop:()=>stops++,dispose:()=>disposes++,setActor(){}}
 h.page.pauseRoomScene();assert.equal(listeners.down.size,0);assert.equal(listeners.up.size,0);assert.equal(h.page._heldKeys.size,0);assert.equal(stops,1)
 h.page.bindRoomKeyboard();h.page.disposeRoomScene();assert.equal(listeners.down.size,0);assert.equal(disposes,1)
})
test('touch cancellation and pinch do not place furniture accidentally',()=>{
 const h=roomHarness();Object.assign(h.page,createRoomScenePage({}));h.page.onRoomChoose(tap({id:'chair'}))
 h.page._scene={hit:()=>({id:'chair',point:{x:4,y:4}}),zoom(){},setActor(){}}
 h.page._canvasRect={left:0,top:0};const touch=(x,y)=>({clientX:x,clientY:y})
 h.page.onRoomTouchStart({touches:[touch(100,100),touch(130,100)]})
 h.page.onRoomTouchMove({touches:[touch(100,100),touch(160,100)]});h.page.onRoomTouchEnd({changedTouches:[touch(100,100)]})
 assert.equal(h.page.data.roomDirty,false)
 h.page.onRoomTouchCancel();assert.equal(h.page._gesture,null)
})
