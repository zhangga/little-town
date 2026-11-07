const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {fixture,roomHarness,tap,clone,mallHarness}=require('./home-room-test.cjs')
const space=require('../miniapp/home/utils/home-space'),{actions}=require('../miniapp/home/utils/home-room')
const {keyboardKey}=require('../miniapp/home/utils/home-room-scene-page')
const {homeArt}=require('../miniapp/utils/resident')
for(const [level,size]of [[1,7],[2,9],[3,12],[4,16],[5,20]])test('level '+level+' has an actual '+size+' by '+size+' floor',()=>{
 const s=fixture(level),h=roomHarness(s),g=h.page.roomGeometry()
 assert.equal(h.page.data.roomSize,size);assert.deepEqual(h.page._actor,{x:size/2,y:size-.5,angle:Math.PI,moving:false,pose:''})
 const p={id:'chair',x:size-.5,y:2.5,rotation:0,angle:0}
 assert.equal(space.canPlace([],s.furniture,p,g),true);assert.equal(space.canPlace([],s.furniture,{...p,x:size-.4},g),false)
 assert.equal(space.canPlace([],s.furniture,{...p,x:size/2,y:size-.5},g),false)
 assert.equal(space.canWalk({x:size-.4,y:2.5},[],s.furniture,g),true)
 assert.equal(h.page.data.roomDraft[0].x,1.5)
})
test('closed voxel door blocks passage, open door allows the porch, walls still block other exits',()=>{
 const catalog=fixture().furniture,closed={size:7,level:1,porch:true,doorOpen:false},open={...closed,doorOpen:true}
 const start={x:3.5,y:6.5}
 assert.equal(space.pathTo(start,{x:3.5,y:7.7},[],catalog,closed),null)
 assert.ok(space.pathTo(start,{x:3.5,y:7.7},[],catalog,open))
 assert.equal(space.canWalk({x:2,y:7},[],catalog,open),false)
 assert.equal(space.canWalk({x:3,y:6.6},[],catalog,open),false)
 const stopped=space.move(start,0,3,[],catalog,closed),outside=space.move(start,0,1.2,[],catalog,open)
 assert.ok(stopped.y<7);assert.ok(outside.y>7)
})
test('E opens once per key press, refuses to close on the resident, and resets after hide',()=>{
 const h=roomHarness();h.page.setRoomKey('e',true);assert.equal(h.page.data.roomDoorOpen,true)
 h.page.setRoomKey('e',true);assert.equal(h.page.data.roomDoorOpen,true)
 h.page.setRoomKey('e',false);h.page._actor.y=7;h.page.setRoomKey('e',true);assert.equal(h.page.data.roomDoorOpen,true)
 h.page.setRoomKey('e',false);h.page._actor.y=7.8;h.page.setRoomKey('e',true);assert.equal(h.page.data.roomDoorOpen,false)
 h.page.stopRoomWalk();h.page._visible=false;h.page.setRoomKey('e',true);assert.equal(h.page.data.roomDoorOpen,false)
})
test('holding E while walking to a distant door opens it only once',()=>{
 const h=roomHarness();h.page._actor={x:3.5,y:2,angle:0,moving:false,pose:''}
 h.page.setRoomKey('e',true);assert.equal(h.page.data.roomDoorOpen,false);h.flush();assert.equal(h.page.data.roomDoorOpen,true)
 h.page.setRoomKey('e',true);assert.equal(h.page.data.roomDoorOpen,true)
 h.page.setRoomKey('e',false);h.page.setRoomKey('e',true);assert.equal(h.page.data.roomDoorOpen,false)
})
test('first/third person switches once per press and survives a furniture edit',()=>{
 const h=roomHarness();assert.equal(h.page.data.roomCamera,'close')
 h.page.setRoomKey('v',true);assert.equal(h.page.data.roomCamera,'first')
 h.page.setRoomKey('v',true);assert.equal(h.page.data.roomCamera,'first')
 h.page.setRoomKey('v',false);h.page.setRoomKey('v',true);assert.equal(h.page.data.roomCamera,'close')
 h.page.setRoomKey('v',false);h.page.onRoomPerspective();h.page.onRoomChoose(tap({id:'chair'}));assert.equal(h.page.data.roomCamera,'overview')
 h.page.onRoomCancel();assert.equal(h.page.data.roomCamera,'first')
 assert.equal(keyboardKey({code:'KeyV'}),'v');assert.equal(keyboardKey({code:'F5'}),'v')
})
test('a large-house draft really saves furniture beyond the old seven-block boundary',async()=>{
 const s=fixture(5),h=roomHarness(s);h.page.onRoomChoose(tap({id:'chair'}));h.page.onRoomFloor({x:18.125,y:17.25});await h.page.onRoomSave()
 assert.equal(h.calls.length,1);assert.equal(h.server.room.layout[0].x,18.125)
 const old=roomHarness();old.page.onRoomChoose(tap({id:'chair'}));old.page.onRoomFloor({x:18.125,y:17.25});assert.equal(old.page.data.roomDirty,false)
})
test('every new mall item has a usable owned model action and shipped thumbnail',()=>{
 const s=fixture(5),newItems=s.furniture.slice(12);assert.equal(newItems.length,12)
 for(const item of newItems){
  assert.ok(actions[item.id]);assert.ok(fs.statSync('miniapp/home/images/'+item.id+'.png').size>500)
  const room=fixture(5);room.furniture.forEach(i=>i.owned=true);room.room.layout=[{id:item.id,x:8,y:8,rotation:0,angle:0}]
  const h=roomHarness(room);h.page.onRoomFurniture(tap({id:item.id}));h.flush();assert.equal(h.page.data.roomAction,item.id)
 }
 for(const level of [4,5])assert.ok(fs.existsSync('miniapp'+homeArt(level).src))
})
test('new leisure furniture follows the real purchase flow and returns to the home backpack',async()=>{
 const s=fixture(5);s.wallet.coins=250;const h=await mallHarness({server:s})
 h.page.onCategory(tap({category:'leisure',id:'leisure'}));h.page.onSelectFurniture(tap({id:'pool'}));await h.page.onBuyFurniture()
 assert.equal(h.server.wallet.coins,70);assert.equal(h.page.data.selected.owned,true)
 h.page.onGoHome();assert.equal(h.storage.homeRoomRequested,'pool')
 const home=roomHarness(h.server);assert.equal(home.page.data.roomInventory.find(i=>i.id==='pool').placed,false)
})
