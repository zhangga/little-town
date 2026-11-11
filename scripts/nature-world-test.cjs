const test=require('node:test'),assert=require('node:assert/strict')
const world=require('../miniapp/home/utils/nature-resources')
const {createNaturePage}=require('../miniapp/home/utils/nature-page')
const {roomHarness,tap,clone}=require('./home-room-test.cjs')
function harvest(state,id,count=1){const node=world.nodes.find(n=>n.id===id);for(let n=0;n<count;n++){state.clock+=24;for(let hit=0;hit<node.hits;hit++){const result=world.gather(state,id,node);assert.equal(result.ok,true,result.message);state=result.state}}return state}
function craft(state,id){const result=world.craft(state,id,world.bench);assert.equal(result.ok,true,result.message);return result.state}
function harness(options={}){
  const h=roomHarness(),storage=options.storage||{userInfo:{id:7},apiBackend:'test'},wx={getStorageSync:key=>{if(options.readFail&&key.startsWith('nature-world'))throw Error('storage unavailable');return clone(storage[key]??null)},setStorageSync:(key,value)=>{if(options.writeFail)throw Error('full');storage[key]=clone(value)}}
  Object.assign(h.page,createNaturePage(wx));h.page.loadNatureWorld();h.page.setData({roomSceneReady:true});h.page.onNatureExplore();return {...h,storage,wx}
}
test('a new explorer can progress from logs to both tools and craft every display from mined resources',()=>{
  let s=world.fresh();s=harvest(s,'log',3);s=harvest(s,'rock');s=craft(s,'stone_pick');assert.equal(world.tier(s),1)
  s=harvest(s,'coal',4);s=harvest(s,'copper',2);s=craft(craft(s,'copper_ingot'),'copper_ingot');s=craft(s,'copper_pick');assert.equal(world.tier(s),2)
  s=harvest(s,'iron');s=craft(s,'iron_ingot');s=harvest(s,'sandbank',3);s=harvest(s,'quartz',2)
  s=craft(craft(craft(s,'glass'),'glass'),'glass');s=craft(s,'white_glass');s=harvest(s,'silver');s=craft(s,'mirror');s=craft(s,'lantern')
  s=harvest(s,'amethyst');s=harvest(s,'fluorite');s=harvest(s,'rock');s=craft(s,'crystal');s=craft(s,'plank')
  for(const id of ['white_glass','mirror','lantern','crystal','plank'])assert.ok(s.inventory[id]>0)
  assert.equal(Object.values(s.inventory).every(n=>n>=0),true)
})
test('mining checks reach, tool and regrowth and never mutates the incoming save',()=>{
  const s=world.fresh(),initial=clone(s),node=world.nodes.find(n=>n.id==='copper')
  for(const position of [{x:0,y:0},{x:NaN,y:18},null])assert.equal(world.gather(s,node.id,position).ok,false)
  assert.equal(world.gather(s,node.id,node).ok,false);assert.deepEqual(s,initial)
  let next=harvest(s,'rock');const saved=clone(next);assert.equal(world.gather(next,'rock',world.nodes[1]).ok,false);assert.deepEqual(next,saved)
  next.clock+=24;assert.equal(world.gather(next,'rock',world.nodes[1]).ok,true)
})
test('crafting cannot spend at a distance, spend twice on a tool, underflow inventory or overflow a stack',()=>{
  let s=world.fresh();s.inventory={wood:10,stone:10}
  const before=clone(s);assert.equal(world.craft(s,'stone_pick',world.spawn).ok,false);assert.equal(world.craft(s,'stone_pick',{x:NaN,y:0}).ok,false);assert.deepEqual(s,before)
  s=craft(s,'stone_pick');assert.equal(world.craft(s,'stone_pick',world.bench).ok,false)
  assert.equal(world.craft(s,'mirror',world.bench).ok,false)
  s.inventory.plank=998;assert.equal(world.craft(s,'plank',world.bench).ok,false)
})
test('malformed and old saves are bounded and unknown inventory cannot enter the world',()=>{
  assert.deepEqual(world.restore({version:99,inventory:{mirror:1}}),world.fresh())
  const s=world.restore({version:1,clock:Infinity,inventory:{wood:-4,mirror:1.5,stone:99999,unknown:20},veins:{rock:{until:Infinity,progress:100}}})
  assert.equal(s.clock,0);assert.deepEqual(s.inventory,{stone:999});assert.deepEqual(s.veins,{})
})
test('every resource, the workshop and the opposite riverbank are reachable from spawn',()=>{
  const step=.25,key=(x,y)=>x+','+y,start={...world.spawn},queue=[start],visited=new Set([key(start.x,start.y)])
  for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy]of [[step,0],[-step,0],[0,step],[0,-step]]){const q={x:p.x+dx,y:p.y+dy},k=key(q.x,q.y);if(!visited.has(k)&&world.canWalk(q)){visited.add(k);queue.push(q)}}}
  for(const node of [...world.nodes,world.bench])assert.ok(queue.some(p=>Math.hypot(p.x-node.x,p.y-node.y)<1.7),node.id||'bench')
  assert.ok(queue.some(p=>p.x>10&&p.y>10),'opposite bank')
})
test('creek, cave walls and trees block travel, bridge permits crossing, and a large step cannot tunnel',()=>{
  const x=world.creekX(5);assert.equal(world.canWalk({x,y:5}),false);assert.equal(world.canWalk({x:world.creekX(9),y:9}),true)
  assert.equal(world.canWalk({x:-14,y:22}),false);assert.equal(world.canWalk({x:-10,y:27.7}),false);assert.equal(world.canWalk({x:-5,y:12}),false)
  const next=world.move({x:0,y:5},14,0);assert.ok(next.x<world.creekX(5)-1.7);assert.equal(world.canWalk(next),true)
})
test('E and B are edge-triggered; crafting bag and page hide stop walking and pause resource time',()=>{
  const h=harness(),p=h.page;for(let i=0;i<4;i++)p.setRoomKey('e',true);assert.equal(p._natureState.inventory.wood,3)
  p.setRoomKey('e',false);p.setRoomKey('w',true);p.tickRoom(.05);p.setRoomKey('b',true);const before=clone(p._actor),clock=p._natureState.clock
  p.setRoomKey('b',true);assert.equal(p.data.natureBagOpen,true);p.tickRoom(1);assert.deepEqual(p._actor,before);assert.equal(p._natureState.clock,clock)
  p.setRoomKey('b',false);p.setRoomKey('b',true);assert.equal(p.data.natureBagOpen,false)
  p._visible=false;p.tickRoom(1);assert.deepEqual(p._actor,before)
})
test('resources survive reload and are isolated by account and API environment',()=>{
  const h=harness();h.page.onNatureInteract();const other=harness({storage:h.storage});assert.equal(other.page._natureState.inventory.wood,3)
  h.storage.userInfo.id=8;other.page.loadNatureWorld();assert.deepEqual(other.page._natureState.inventory,{})
  h.storage.userInfo.id=7;h.storage.apiBackend='other';other.page.loadNatureWorld();assert.deepEqual(other.page._natureState.inventory,{})
})
test('failed collection and failed crafting keep the original materials and can be retried',()=>{
  const h=harness({writeFail:true});h.page.onNatureInteract();assert.deepEqual(h.page._natureState.inventory,{});assert.equal(h.page.data.natureSaveError,true)
  h.page._natureState.inventory={wood:3,stone:3};h.page._actor={x:h.page.data.roomSize/2+world.bench.x,y:h.page.data.roomSize+1.8+world.bench.y};h.page.setData({natureBagOpen:true})
  const original=clone(h.page._natureState);h.page.onNatureCraft(tap({id:'stone_pick'}));assert.deepEqual(h.page._natureState,original)
  const saved=harness({storage:{userInfo:{id:7},apiBackend:'test','nature-world-v1:test:7':original}});saved.page._actor={...h.page._actor};saved.page.setData({natureBagOpen:true});saved.page.onNatureCraft(tap({id:'stone_pick'}));assert.equal(saved.page._natureState.inventory.stone_pick,1)
})
test('a failed read cannot overwrite a previously saved collection',()=>{
  const state=world.fresh();state.inventory.mirror=1
  const storage={userInfo:{id:7},apiBackend:'test','nature-world-v1:test:7':state},h=harness({storage,readFail:true})
  h.page.onNatureInteract();assert.deepEqual(storage['nature-world-v1:test:7'],state);assert.equal(h.page.data.natureSaveError,true)
})
test('returning home restores the actor and camera and keeps the room furniture untouched',()=>{
  const h=harness(),draft=clone(h.page.data.roomDraft),saved=clone(h.page._homeReturn)
  h.page.setRoomKey('w',true);h.page.tickRoom(.05);h.page.onNatureReturn()
  assert.equal(h.page.data.natureExploring,false);assert.equal(h.page._actor.x,saved.actor.x);assert.equal(h.page._actor.y,saved.actor.y);assert.equal(h.page.data.roomCamera,saved.camera);assert.deepEqual(h.page.data.roomDraft,draft)
})
test('the sandbox entrance clears held input and saves before opening the glade route',()=>{
  const {createSandboxPage}=require('../miniapp/home/utils/sandbox-page'),calls=[],wx={navigateTo:args=>calls.push(args.url)}
  const p={...createSandboxPage({},wx),clearWorldInput:()=>calls.push('stop'),flushWorldSave:()=>calls.push('save')}
  p.onNatureVisit();assert.deepEqual(calls,['stop','save','/home/pages/room/room?nature=1'])
})
test('leaving the glade from the sandbox saves the active clock and returns to the existing world',()=>{
  const h=harness();let returned=0;h.wx.navigateBack=()=>returned++;h.page._natureViaWorld=true;h.page.tickRoom(.05);const clock=h.page._natureState.clock
  h.page.onNatureLeave();assert.equal(returned,1);assert.equal(h.storage['nature-world-v1:test:7'].clock,clock)
})
