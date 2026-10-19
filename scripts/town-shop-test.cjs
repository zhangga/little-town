const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, harness, tap } = require('./town-life-test.cjs')
const { presentBuilding } = require('../miniapp/utils/town-shop')
const { presentLife } = require('../miniapp/utils/town-life')
function shopFixture() {
 const server=fixture();server.buildings.push('商店','餐厅','学校','公园')
 server.needs={enabled:true,food:30,water:25}
 server.supplies=[{id:'bread',name:'新鲜面包',icon:'🥖',building:'商店',price:2,food:40,water:0,available:true},{id:'water',name:'清凉饮用水',icon:'💧',building:'商店',price:1,food:0,water:50,available:true},{id:'meal',name:'热乎乎的套餐',icon:'🍲',building:'餐厅',price:3,food:60,water:30,available:true}]
 return server
}
const open = (h,name) => h.page.onPlotTap(tap({index:h.page.data.plots.findIndex(p=>p.name===name)}))
module.exports={shopFixture}
if(require.main===module) {
 test('built shop shows its goods for free and a purchase feeds the resident with server coins',async()=>{
  const h=await harness({server:shopFixture()});open(h,'商店')
  assert.deepEqual(h.page.data.selected.supplies.map(i=>i.id),['bread','water'])
  assert.equal(h.calls.filter(c=>c.method==='POST').length,0)
  await h.page.onBuySupply(tap({id:'bread'}))
  assert.equal(h.page.data.town.coins,23);assert.equal(h.page.data.life.needs.food,70)
  assert.equal(h.page.data.life.needs.water,25)
  assert.match(h.page.data.lifeFeedback.outcome,/70/)
  assert.equal(h.page.data.life.needs.thirsty,true)
  await h.page.onBuySupply(tap({id:'bread'}))
  assert.equal(h.calls.filter(c=>c.method==='POST').length,1,'queued tap after a fast response cannot purchase behind the feedback')
  h.page.onCloseFeedback();await h.page.onBuySupply(tap({id:'water'}))
  assert.equal(h.page.data.life.needs.water,75);assert.equal(h.storage.userInfo.coins,22)
  const posts=h.calls.filter(c=>c.method==='POST')
  assert.match(posts[0].body.request_id,/^[a-z0-9-]{16,80}$/)
  assert.notEqual(posts[0].body.request_id,posts[1].body.request_id)
  h.page.onUnload()
 })
 test('rapid supply taps and leaving the shop are locked until the purchase completes',async()=>{
  let finish
  const h=await harness({server:shopFixture(),post:()=>new Promise(r=>{finish=r})});open(h,'商店')
  const pending=h.page.onBuySupply(tap({id:'bread'}))
  h.page.onBuySupply(tap({id:'bread'}));h.page.onCloseDetail()
  assert.equal(h.page.data.selected.name,'商店');assert.equal(h.calls.filter(c=>c.method==='POST').length,1)
  const result=shopFixture();result.needs.food=70;result.wallet.coins=23
  finish(result);await pending;assert.equal(h.page.data.town.coins,23)
  h.page.onUnload()
 })
 test('full and unaffordable supplies never spend, and goods cannot be bought from a different building',async()=>{
  const server=shopFixture();server.wallet.coins=0;server.needs.food=100
  const h=await harness({server});open(h,'商店')
  await h.page.onBuySupply(tap({id:'bread'}));await h.page.onBuySupply(tap({id:'meal'}));await h.page.onBuySupply(tap({id:'water'}))
  assert.equal(h.calls.filter(c=>c.method==='POST').length,0)
  assert.deepEqual(h.navigation,['/pages/learn/learn'])
  const absent=presentLife({...server,needs:{enabled:false,food:100,water:100},supplies:server.supplies.map(i=>({...i,available:false}))})
  assert.equal(presentBuilding({name:'商店'},absent).supplies.length,0)
  h.page.onUnload()
 })
 test('ambiguous supply response reads authoritative needs and never retries the charge',async()=>{
  const h=await harness({server:shopFixture(),post:async(_,body,server)=>{server.wallet.coins-=2;server.needs.food+=40;throw Error('连接中断')}})
  open(h,'商店');await h.page.onBuySupply(tap({id:'bread'}))
  assert.equal(h.calls.filter(c=>c.method==='POST').length,1)
  assert.equal(h.page.data.town.coins,23);assert.equal(h.page.data.life.needs.food,70)
  assert.equal(h.page.data.lifeFeedback,null);assert.equal(h.page.data.lifeBusy,false)
  h.page.onUnload()
 })
 test('buildings expose only their event, school opens learning, and park sends the host there',async()=>{
  const h=await harness({server:shopFixture()})
  open(h,'医院');assert.equal(h.page.data.selected.serviceEvent,null)
  open(h,'消防站');assert.equal(h.page.data.selected.serviceEvent.kind,'small_fire')
  await h.page.onResolveLife();assert.equal(h.page.data.selected.serviceEvent,null)
  h.page.onCloseFeedback();open(h,'学校');h.page.onBuildingActivity()
  assert.deepEqual(h.navigation,['/pages/learn/learn'])
  open(h,'公园');h.page.onBuildingActivity()
  assert.equal(h.page.data.selected,null);assert.equal(h.page.data.townAnchor,'town-map')
  h.page.onUnload()
 })
 test('needs refreshes while visible and stops during layout editing, hiding and unloading',async()=>{
  const h=await harness({server:shopFixture()})
  const reads=()=>h.calls.filter(c=>c.url==='/town-life'&&c.method==='GET').length
  const before=reads();h.strollClock.tick(60000);await h.page._loadPromise;await Promise.resolve()
  assert.equal(reads(),before+1)
  await h.page.onToggleLayout();assert.equal(h.strollClock.pending(),0)
  h.strollClock.tick(120000);assert.equal(reads(),before+1)
  h.page.onCancelLayout();assert.ok(h.strollClock.pending()>0)
  h.page.onHide();assert.equal(h.strollClock.pending(),0)
  h.strollClock.tick(120000);assert.equal(reads(),before+1)
  h.page.onUnload();assert.equal(h.strollClock.pending(),0)
 })
}
