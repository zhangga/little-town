const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const presentation = require('../miniapp/utils/resident')
const { townPlots } = require('../miniapp/utils/town')
const event = dataset => ({ currentTarget: { dataset } })
function fixture() {
  const rows = [['everyday','薄荷日常装','outfit',0],['builder','小小建造师','outfit',60],['gardener','阳光园丁','outfit',90],['explorer','森林探险家','outfit',120],['none','清爽庭院','decoration',0],['flowers','缤纷花箱','decoration',40],['flag','迎风小旗','decoration',30],['trees','绿荫角落','decoration',70]]
  return {
    resident: {name:'小镇长',outfit_id:'everyday',decoration_id:'none',home_level:1,level:2,title:'活力镇长',experience:45,xp_current:15,xp_needed:50},
    wallet:{coins:85,bricks:18},daily:{completed:2,goal:5,reviews:1,done:false,bonus_xp:10},home:{level:1,name:'初来的小屋',next_level:2,upgrade_cost:15,can_upgrade:true},
    shop:rows.map(([id,name,kind,price])=>({id,name,kind,price,description:kind==='outfit'?'带着好奇心，发现更大的世界':'让这里更像你的家',owned:price===0,equipped:id==='everyday'||id==='none'}))
  }
}
async function harness(options={}) {
  const filename=path.resolve('miniapp/pages/resident/resident.js'), localRequire=createRequire(filename)
  let server=fixture(), definition
  const calls=[],errors=[],navigation=[],storage={token:'test',userInfo:{nickname:'微信昵称',coins:999,bricks:999}},timers=new Map()
  const api={get:async()=>{calls.push({method:'get'});return options.get?options.get(server):structuredClone(server)}}
  for(const method of ['put','post']) api[method]=async(url,body)=>{calls.push({method,url,body});if(options.mutate)return options.mutate(url,body,server);if(url==='/resident')server.resident.name=body.name;return structuredClone(server)}
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    require:name=>name==='../../utils/api'?api:name==='../../utils/util'?{showError:m=>errors.push(m),showSuccess:()=>{}}:name==='../../utils/resident'?{...presentation,saveWallet:wallet=>Object.assign(storage.userInfo,wallet)}:localRequire(name),
    Page:value=>{definition=value},wx:{getStorageSync:key=>storage[key],redirectTo(){},stopPullDownRefresh(){},switchTab:args=>navigation.push(args.url)},
    setTimeout:fn=>{const id=Symbol();timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),console
  },{filename})
  const page={...definition,data:structuredClone(definition.data)}
  page.setData=patch=>{for(const[key,value]of Object.entries(patch)){const bits=key.split('.');let dest=page.data;while(bits.length>1)dest=dest[bits.shift()];dest[bits[0]]=value}}
  page.onLoad();page.onShow();if(!options.pending)await page._loadPromise
  return {page,calls,errors,navigation,storage,timers,server,api}
}
module.exports={fixture,harness,event}
if(require.main===module){
 test('initial state uses the server wallet, separate character name and correct atlas frames',async()=>{const h=await harness();assert.equal(h.storage.userInfo.coins,85);assert.equal(h.storage.userInfo.nickname,'微信昵称');assert.equal(h.page.data.state.xpPercent,30);assert.equal(h.page.data.items.length,4);assert.equal(presentation.residentArt('builder',1).y,-100);assert.equal(presentation.homeArt(3).y,-100)})
 test('preview is free and rapid purchase taps submit only once',async()=>{let resolve;const h=await harness({mutate:()=>new Promise(r=>{resolve=r})});h.page.onSelect(event({id:'builder'}));assert.equal(h.calls.length,1);const pending=h.page.onConfirm();h.page.onConfirm();h.page.onClose();assert.equal(h.calls.length,2);assert.equal(h.page.data.selected.id,'builder');const state=fixture();state.wallet.coins=25;state.resident.outfit_id='builder';state.shop[1].owned=true;state.shop[1].equipped=true;resolve(state);await pending;assert.equal(h.page.data.selected,null);assert.equal(h.page.data.state.resident.outfit_id,'builder');assert.equal(h.storage.userInfo.coins,25)})
 test('insufficient coins navigate to learning without any write',async()=>{const h=await harness();h.page.onSelect(event({id:'explorer'}));assert.equal(h.page.data.selected.missing,35);await h.page.onConfirm();assert.equal(h.calls.length,1);assert.deepEqual(h.navigation,['/pages/learn/learn'])})
 test('an ambiguous purchase refreshes authoritative ownership without retrying the spend',async()=>{const h=await harness({mutate:async(url,body,server)=>{server.wallet.coins-=60;server.resident.outfit_id='builder';server.shop[1].owned=true;throw Error('网络超时')}});h.page.onSelect(event({id:'builder'}));await h.page.onConfirm();assert.equal(h.calls.filter(x=>x.method==='post').length,1);assert.equal(h.storage.userInfo.coins,25);assert.equal(h.page.data.state.shop[1].owned,true);assert.equal(h.page.data.selected,null);assert.equal(h.page.data.busy,false);assert.deepEqual(h.errors,['网络超时'])})
 test('upgrading sends the previewed level and never trusts a client cost',async()=>{const h=await harness();h.page.onTab(event({tab:'home'}));h.page.onPreviewHome();assert.equal(h.page.data.selected.price,15);await h.page.onConfirm();assert.equal(h.calls[1].url,'/resident/home/upgrade');assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1].body)),{expected_level:1})})
 test('name validation prevents empty submissions and preserves a Unicode name',async()=>{const h=await harness();h.page.onEditName();h.page.onNameInput({detail:{value:'  '}});await h.page.onSaveName();assert.equal(h.calls.length,1);h.page.onNameInput({detail:{value:' 阿圆🌱 '}});await h.page.onSaveName();assert.equal(h.page.data.state.resident.name,'阿圆🌱');assert.equal(h.page.data.editingName,false)})
 test('hidden and unloaded pages cancel character reactions and ignore late results',async()=>{const h=await harness();h.page.onWave();assert.equal(h.timers.size,1);h.page.onHide();assert.equal(h.timers.size,0);assert.equal(h.page.data.waving,false);h.page.onUnload();h.page.applyState({...fixture(),wallet:{coins:1,bricks:1}});assert.equal(h.storage.userInfo.coins,85)})
 test('failed initial request is recoverable and concurrent reads are deduplicated',async()=>{let resolve;const h=await harness({pending:true,get:()=>new Promise(r=>{resolve=r})});h.page.onShow();assert.equal(h.calls.length,1);resolve(fixture());await h.page._loadPromise;assert.equal(h.page.data.loading,false);const failed=await harness({get:async()=>{throw Error('离线')}});assert.equal(failed.page.data.failed,true);failed.api.get=async()=>fixture();await failed.page.loadResident();assert.equal(failed.page.data.failed,false)})
 test('home occupies one town plot without losing any previously built buildings',()=>{for(let count=0;count<11;count++){const raw=Array.from({length:count},(_,i)=>({id:i+1,name:'商店'}));const state=townPlots(raw,null,true);assert.equal((state.plots.length+1)%3,0);assert.equal(state.buildings.length,count);assert.ok(state.plots.some(x=>x.next))}})
}
