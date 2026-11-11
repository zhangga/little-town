const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { fixture: residentFixture } = require('./resident-test.cjs')
const room = require('../miniapp/home/utils/home-room')
const space = require('../miniapp/home/utils/home-space')
const { roomData, createHomeRoom } = require('../miniapp/home/utils/home-room-page')
const { presentResident } = require('../miniapp/utils/resident')
const clone = value => JSON.parse(JSON.stringify(value))
const tap = dataset => ({ currentTarget: { dataset } })
function fixture(level = 1) {
  const rows = [['chair','原木单椅','living',0,1,1],['sofa','奶油双人沙发','living',45,2,1],['tv','自然风景电视','living',75,1,1],['lamp','暖光落地灯','living',18,1,1],['plant','窗边绿植','living',12,1,1],['bed','云朵单人床','bedroom',60,1,2],['wardrobe','橡木衣柜','bedroom',50,1,1],['rug','圆圆编织地毯','bedroom',16,1,1],['desk','窗边书桌','study',35,2,1],['bookshelf','故事书架','study',30,1,1],['table','原木餐桌','dining',32,2,1],['fridge','薄荷小冰箱','dining',55,1,1]]
  rows.push(['kitchen','橡木料理台','dining',85,3,1],['bathtub','白瓷浴缸','bathroom',85,2,1],['vanity','镜面洗漱台','bathroom',45,1,1],['toilet','白瓷马桶','bathroom',30,1,1],['piano','橡木钢琴','leisure',120,2,1],['arcade','方块街机','leisure',95,1,1],['aquarium','观景鱼缸','living',70,2,1],['fireplace','石砖壁炉','living',90,2,1],['pool','室内景观泳池','leisure',180,3,3],['treadmill','家用跑步机','leisure',75,1,2],['pooltable','绿色台球桌','leisure',140,3,2],['sectional','转角大沙发','living',100,3,2])
  const stages=[['初来的小屋',7,0],['暖暖的家',9,15],['花园之家',12,30],['林间大别墅',16,60],['橡木庄园',20,100]].map(([name,size,cost],i)=>({level:i+1,name,size,cost,summary:'橡木、石砖和明亮的玻璃厅。'}))
  const base=residentFixture(),current=stages[level-1],next=stages[level];base.resident.home_level=level
  base.home={level,name:current.name,size:current.size,area:current.size**2,summary:current.summary,stages,next_level:next?next.level:0,next_name:next?next.name:'',next_size:next?next.size:0,next_summary:next?next.summary:'',upgrade_cost:next?next.cost:0,can_upgrade:!!next&&base.wallet.bricks>=next.cost}
  return Object.assign(base, {
    mall_available: true, room: { version: 0, size: current.size, level, layout: [{ id: 'chair', x: 1, y: 3, rotation: 0 }] },
    furniture: rows.map(([id,name,category,price,width,depth]) => ({ id,name,category,price,width,depth,kind:'furniture',owned: price===0,description:'给小家添一件喜欢的家具。' }))
  })
}
function setData(patch) {
  for (const [key,value] of Object.entries(patch)) {
    const bits=key.split('.');let dest=this.data
    while(bits.length>1)dest=dest[bits.shift()]
    dest[bits[0]]=value
  }
}
function roomHarness(server = fixture(), options = {}) {
  const timers = new Map(), calls = [], errors = [], navigation = []
  const clock = { setTimeout: fn => { const id=Symbol();timers.set(id,fn);return id }, clearTimeout: id => timers.delete(id) }
  const api = {
    get: async () => { if(options.readError)throw Error('offline');return clone(server) },
    put: async (url,body) => { calls.push({url,body:clone(body)});if(options.save)return options.save(body,server);server.room={...server.room,layout:clone(body.layout),version:server.room.version+1};return clone(server) }
  }
  const page = { ...createHomeRoom(api,{navigateTo:args=>navigation.push(args.url)},e=>errors.push(e),clock), _visible:true,
    data:{...clone(roomData),state:presentResident(server),tab:'room',busy:false},setData,
    applyState(state){this.setData({state:presentResident(state)});this.syncRoom(this.data.state)}
  }
  page.syncRoom(page.data.state)
  const flush = () => { let n=0;while(page._walkPath){if(n++>2000)throw Error('walk never arrived');page.tickRoom(1/30)} }
  return {page,server,timers,clock,calls,errors,navigation,flush}
}
async function mallHarness(options = {}) {
  const filename=path.resolve('miniapp/home/pages/mall/mall.js'), localRequire=createRequire(filename)
  const server=options.server||fixture(), calls=[],errors=[],navigation=[],storage={token:'test'},savedWallet={}
  const api={get:async()=>clone(server),post:async(url,body)=>{calls.push({url,body:clone(body)});if(options.purchase)return options.purchase(body,server);const item=server.furniture.find(i=>i.id===body.item_id);if(!item.owned){server.wallet.coins-=item.price;item.owned=true}return clone(server)}}
  let definition
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:id=>id==='../../../utils/api'?api:id==='../../../utils/util'?{showError:e=>errors.push(e)}:id==='../../../utils/resident'?{saveWallet:wallet=>Object.assign(savedWallet,wallet)}:id==='../../../utils/sound-page'?{withTapSounds:x=>x}:localRequire(id),Page:p=>{definition=p},wx:{getStorageSync:key=>storage[key],setStorageSync:(key,value)=>{storage[key]=value},switchTab:args=>navigation.push(args.url),redirectTo:args=>navigation.push(args.url),stopPullDownRefresh(){}},console},{filename})
  const page={...definition,data:clone(definition.data),setData}
  page.onLoad();await page.loadMall()
  return {page,server,calls,errors,navigation,storage,savedWallet}
}
module.exports={fixture,roomHarness,mallHarness,tap,clone}
if(require.main===module){
test('the actual room page receives purchased furniture, saves it and preserves a draft across a mall visit',async()=>{
  const filename=path.resolve('miniapp/home/pages/room/room.js'),localRequire=createRequire(filename)
  const server=fixture();server.furniture.find(i=>i.id==='sofa').owned=true
  const storage={token:'test',homeRoomRequested:'sofa'},calls=[],navigation=[];let definition
  const api={get:async()=>clone(server),put:async(url,body)=>{calls.push({url,body});server.room.layout=clone(body.layout);server.room.version++;return clone(server)}}
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:id=>id==='../../../utils/api'?api:id==='../../../utils/util'?{showError:e=>{throw Error(e)}}:id==='../../../utils/resident'?{presentResident,saveWallet:()=>{}}:id==='../../../utils/sound-page'?{withTapSounds:x=>x}:localRequire(id),Page:p=>{definition=p},wx:{getStorageSync:key=>storage[key],setStorageSync:(key,value)=>{storage[key]=value},removeStorageSync:key=>delete storage[key],navigateTo:args=>navigation.push(args.url),switchTab:args=>navigation.push(args.url),redirectTo(){},stopPullDownRefresh(){}},console},{filename})
  const page={...definition,data:clone(definition.data),setData};page.onLoad();page.onShow();await page._loadPromise
  assert.equal(page.data.roomBagOpen,true);assert.equal(page.data.roomEditing,false);page.onRoomChoose(tap({id:'sofa'}));assert.equal(page.data.roomSelected,'sofa');assert.equal(storage.homeRoomRequested,undefined)
  page.onRoomFloor({x:3.25,y:2.125});page.onGoMall();page.onHide();page.onShow();await page._loadPromise
  assert.equal(page.data.roomDirty,true);assert.equal(page.data.roomDraft.length,2);assert.deepEqual(navigation,['/home/pages/mall/mall'])
  await page.onRoomSave();assert.equal(calls.length,1);assert.equal(page.data.roomEditing,false);assert.equal(page.data.roomDraft.length,2)
  page.onUnload();page.applyState({...server,wallet:{coins:1,bricks:1}});assert.equal(page.data.state.wallet.coins,85)
})
test('each furniture action changes its intended room state and furniture can rotate in place',()=>{
  for(const id of ['chair','sofa','bed','lamp','plant','desk','bookshelf','wardrobe','table','fridge','rug']){
    const s=fixture();s.furniture.forEach(item=>{item.owned=true});s.room.layout=[{id,x:2,y:2,rotation:0}]
    const h=roomHarness(s);h.page.onRoomFurniture(tap({id}));h.flush();assert.equal(h.page.data.roomAction,id);assert.equal(h.page.data.roomActor.pose,room.actions[id].pose)
    if(id==='lamp'){assert.equal(h.page.data.roomLamp,true);h.page.onRoomFurniture(tap({id}));h.flush();assert.equal(h.page.data.roomLamp,false)}
    if(id==='sofa'){h.page.onRoomEdit();h.page.onRoomChoose(tap({id}));h.page.onRoomRotateEnd({detail:{value:91}});assert.equal(h.page.data.roomDraft[0].angle,91);assert.equal(h.page.data.roomDirty,true)}
  }
})
test('WASD holds move continuously, release stops, and hidden pages cannot keep walking',()=>{
  const h=roomHarness();h.page.setRoomKey('w',true);for(let i=0;i<10;i++)h.page.tickRoom(1/30)
  assert.ok(h.page._actor.y<6.5);assert.equal(h.page._actor.moving,true)
  h.page.setRoomKey('w',false);h.page.tickRoom(1/30);assert.equal(h.page._actor.moving,false)
  h.page.onRoomFloor({x:.5,y:.5});assert.ok(h.page._walkPath)
  h.page._visible=false;h.page.stopRoomWalk();const actor=clone(h.page._actor);h.page.setRoomKey('s',true);h.page.tickRoom(.1)
  assert.deepEqual(h.page._actor,actor);assert.equal(h.page._walkPath,null)
})
test('television is reached on foot and cycles all three local nature pictures',()=>{
  const s=fixture();s.furniture.find(i=>i.id==='tv').owned=true;s.room.layout.push({id:'tv',x:3,y:3,rotation:0})
  const h=roomHarness(s);h.page.onRoomFurniture(tap({id:'tv'}));assert.equal(h.page.data.roomTV,false);h.flush()
  assert.equal(h.page.data.roomTV,true);assert.equal(h.page.data.roomActor.pose,'watch')
  h.page.onRoomNature(tap({step:1}));assert.equal(h.page.data.roomNature.id,'sea')
  h.page.onRoomNature(tap({step:1}));assert.equal(h.page.data.roomNature.id,'mountain')
  h.page.onRoomNature(tap({step:1}));assert.equal(h.page.data.roomNature.id,'forest')
  h.page.onRoomTVClose();assert.equal(h.page.data.roomTV,false)
})
test('placing and storing remain drafts until one successful versioned save',async()=>{
  let finish;const h=roomHarness(fixture(),{save:(body,s)=>new Promise(resolve=>{finish=()=>{s.room={...s.room,layout:body.layout,version:1};resolve(clone(s))}})})
  h.page.onRoomEdit();h.page.onRoomChoose(tap({id:'chair'}));h.page.onRoomFloor({x:5.125,y:4.25})
  assert.equal(h.page.data.roomDirty,true);assert.equal(h.server.room.layout[0].x,1)
  const pending=h.page.onRoomSave();h.page.onRoomSave();h.page.onRoomCancel();assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.expected_version,0)
  finish();await pending;assert.equal(h.page.data.roomEditing,false);assert.equal(h.page.data.roomVersion,1)
  h.page.onRoomEdit();h.page.onRoomChoose(tap({id:'chair'}));h.page.onRoomStore();assert.equal(h.page.data.roomDraft.length,0);assert.equal(h.page.data.roomInventory.length,1)
  h.page.onRoomCancel();assert.equal(h.page.data.roomDraft[0].x,5.125)
})
test('lost save replies reconcile without replay, offline failures retain the draft',async()=>{
  const recovered=roomHarness(fixture(),{save:async(body,s)=>{s.room.layout=body.layout;s.room.version++;throw Error('timeout')}})
  recovered.page.onRoomEdit();recovered.page.onRoomChoose(tap({id:'chair'}));recovered.page.onRoomStore();await recovered.page.onRoomSave()
  assert.equal(recovered.calls.length,1);assert.equal(recovered.errors.length,0);assert.equal(recovered.page.data.roomDraft.length,0);assert.equal(recovered.page.data.roomEditing,false)
  const failed=roomHarness(fixture(),{readError:true,save:async()=>{throw Error('offline')}})
  failed.page.onRoomEdit();failed.page.onRoomChoose(tap({id:'chair'}));failed.page.onRoomStore();await failed.page.onRoomSave()
  assert.equal(failed.page.data.roomEditing,true);assert.equal(failed.page.data.roomDirty,true);assert.equal(failed.page.data.busy,false)
})
test('a conflicting device layout is reloaded instead of overwritten',async()=>{
  const h=roomHarness(fixture(),{save:async(body,s)=>{s.room={version:2,size:7,layout:[{id:'chair',x:6,y:6,rotation:0}]};throw Error('conflict')}})
  h.page.onRoomEdit();h.page.onRoomChoose(tap({id:'chair'}));h.page.onRoomStore();await h.page.onRoomSave()
  assert.equal(h.page.data.roomVersion,2);assert.equal(h.page.data.roomDraft[0].x,6.5);assert.equal(h.page.data.roomEditing,false);assert.equal(h.calls.length,1)
})
test('mall purchase uses authoritative prices, handles rapid taps, and returns owned furniture home',async()=>{
  let finish;const h=await mallHarness({purchase:(body,s)=>new Promise(resolve=>{finish=()=>{s.furniture.find(i=>i.id===body.item_id).owned=true;s.wallet.coins-=45;resolve(clone(s))}})})
  h.page.onSelectFurniture(tap({id:'sofa'}));const pending=h.page.onBuyFurniture();h.page.onBuyFurniture();h.page.onCloseFurniture()
  assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].body,{item_id:'sofa'});assert.equal(h.page.data.selected.id,'sofa')
  finish();await pending;assert.equal(h.savedWallet.coins,40);assert.equal(h.page.data.selected.owned,true)
  h.page.onGoHome();assert.equal(h.storage.homeRoomRequested,'sofa');assert.deepEqual(h.navigation,['/home/pages/world/world'])
})
test('locked mall and insufficient funds route without spending; ambiguous purchases only read back',async()=>{
  const s=fixture();s.mall_available=false;const locked=await mallHarness({server:s});locked.page.onSelectFurniture(tap({id:'tv'}));await locked.page.onBuyFurniture();assert.equal(locked.calls.length,0);assert.deepEqual(locked.navigation,['/pages/build/build'])
  const poor=fixture();poor.wallet.coins=2;const h=await mallHarness({server:poor});h.page.onSelectFurniture(tap({id:'tv'}));await h.page.onBuyFurniture();assert.equal(h.calls.length,0);assert.deepEqual(h.navigation,['/pages/learn/learn'])
  const lost=await mallHarness({purchase:async(body,s)=>{s.furniture.find(i=>i.id===body.item_id).owned=true;s.wallet.coins-=45;throw Error('timeout')}});lost.page.onSelectFurniture(tap({id:'sofa'}));await lost.page.onBuyFurniture();assert.equal(lost.calls.length,1);assert.equal(lost.page.data.selected.owned,true);assert.equal(lost.errors.length,0)
})
}
