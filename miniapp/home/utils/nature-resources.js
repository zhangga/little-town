// Exploration is an account-local creative world, separate from the town wallet.
const { validTransfer } = require('./nature-transfer')
const materials = [
  ['wood','原木','#a77746'],['stone','石块','#8a938a'],['sand','细沙','#d5be86'],['coal','煤块','#505853'],
  ['copper','铜矿石','#bd865d'],['iron','铁矿石','#9c7966'],['quartz','石英','#e1e5d8'],['silver','银矿石','#b9cbd0'],
  ['amethyst','紫水晶','#af86c6'],['fluorite','萤石','#82bca9'],['plank','木板','#c79559'],['copper_ingot','铜锭','#bc7852'],
  ['iron_ingot','铁锭','#b4bcbc'],['glass','透明玻璃','#b4d7d5'],['white_glass','白玻璃','#ecf3e6'],
  ['mirror','银镜','#c2d9dc'],['lantern','暖光灯笼','#efc77e'],['crystal','晶簇摆件','#b19bd0'],
  ['stone_pick','石镐','#89998a'],['copper_pick','铜镐','#bc805b']
].map(([id,name,color])=>({id,name,color}))
const byId = Object.fromEntries(materials.map(m=>[m.id,m]))
const nodes = [
  ['log','wood',-1.3,3.5,0,1],['rock','stone',-4.6,8.5,0,2],['sandbank','sand',1.3,5.0,0,1],
  ['coal','coal',-7.8,16.4,0,2],['copper','copper',-12.2,18.2,1,3],['iron','iron',-7.8,20.1,1,3],
  ['quartz','quartz',-12.2,21.3,1,3],['silver','silver',-7.8,23.2,2,4],
  ['amethyst','amethyst',-11.9,25.1,2,4],['fluorite','fluorite',-12.2,16.2,2,3]
].map(([id,material,x,y,tier,hits])=>({id,material,x,y,tier,hits,yield:({wood:3,stone:3,sand:3,coal:3,copper:2,iron:2,quartz:3,silver:2,amethyst:2,fluorite:1})[material],name:byId[material].name,color:byId[material].color}))
const trees=[[-5,1],[-8,2],[-12,4],[-14,8],[-10,11],[-14,12],[-5,12],[-3,16],[-4,21],[-2,25],[1,27],[7,2],[10,4],[13,7],[8,12],[12,14],[9,18],[13,23],[7,26],[-14,28]]
const recipes = [
  ['plank',4,{wood:1},'锯成木板，做工坊的小材料。'],
  ['stone_pick',1,{wood:2,stone:3},'能采铜矿、铁矿和石英。'],
  ['copper_ingot',1,{copper:2,coal:1},'在工坊的小炉里熔炼。'],
  ['iron_ingot',1,{iron:2,coal:1},'用来制作结实的灯笼框。'],
  ['copper_pick',1,{wood:2,copper_ingot:2},'能采银矿、紫水晶和萤石。'],
  ['glass',2,{sand:2,quartz:1,coal:1},'清透的玻璃，摆在工坊旁。'],
  ['white_glass',1,{glass:2,quartz:1},'乳白、半透明，表面映着林间天光。'],
  ['mirror',1,{glass:1,silver:2},'镀上银层，映出树林和走动的小人。'],
  ['lantern',1,{iron_ingot:1,glass:1,coal:1},'为矿洞入口点一盏暖灯。'],
  ['crystal',1,{amethyst:2,fluorite:1,stone:1},'把两种晶石摆成溪边的收藏。']
].map(([id,count,cost,description])=>({id,count,cost,description,...byId[id]}))
const bench={x:-5.5,y:5.5},spawn={x:-.6,y:4.8},radius=.22
function fresh() {return {version:1,clock:0,inventory:{},veins:{}}}
function restore(value) {
  const state=fresh()
  if(!value||value.version!==1)return state
  if(Number.isSafeInteger(value.transferSequence)&&value.transferSequence>0)state.transferSequence=value.transferSequence
  const pending=validTransfer(value.pendingTransfer);if(pending)state.pendingTransfer=pending
  state.clock=Number.isFinite(value.clock)?Math.max(0,value.clock):0
  for(const m of materials){const n=value.inventory&&value.inventory[m.id];if(Number.isSafeInteger(n)&&n>0)state.inventory[m.id]=Math.min(999,n)}
  for(const node of nodes){const v=value.veins&&value.veins[node.id];if(v&&Number.isFinite(v.until))state.veins[node.id]={until:Math.min(state.clock+24,Math.max(0,v.until)),progress:Number.isInteger(v.progress)?Math.max(0,Math.min(node.hits-1,v.progress)):0}}
  return state
}
function tier(state) {return state.inventory.copper_pick?2:state.inventory.stone_pick?1:0}
function distance(a,b) {return Math.hypot(a.x-b.x,a.y-b.y)}
function nearest(position) {
  return nodes.concat([{id:'bench',name:'溪边工坊',...bench}]).filter(n=>distance(position,n)<=2.15).sort((a,b)=>distance(position,a)-distance(position,b))[0]||null
}
function gather(state,id,position) {
  const node=nodes.find(n=>n.id===id)
  if(!node||!position||![position.x,position.y].every(Number.isFinite)||distance(position,node)>2.15)return {ok:false,message:'走近一点，再开始采集。'}
  if(tier(state)<node.tier)return {ok:false,message:'需要'+(node.tier===2?'铜镐':'石镐')+'，先去溪边工坊合成。'}
  const vein=state.veins[id]||{progress:0,until:0}
  if(vein.until>state.clock)return {ok:false,message:'这处采集点正在恢复，先去别处逛逛。'}
  const next=restore(state),progress=vein.progress+1
  if(progress<node.hits){next.veins[id]={progress,until:0};return {ok:true,state:next,message:'正在采集'+node.name+' · '+progress+' / '+node.hits}}
  if((next.inventory[node.material]||0)+node.yield>999)return {ok:false,message:'这种材料已经装满了，先用它合成吧。'}
  next.inventory[node.material]=(next.inventory[node.material]||0)+node.yield
  next.veins[id]={progress:0,until:state.clock+24}
  return {ok:true,state:next,collected:node.material,message:node.name+' +'+node.yield+'，已放进材料背包。'}
}
function craft(state,id,position) {
  const recipe=recipes.find(r=>r.id===id)
  if(!recipe)return {ok:false,message:'没有找到这张配方。'}
  if(!position||![position.x,position.y].every(Number.isFinite)||distance(position,bench)>2.4)return {ok:false,message:'走到溪边工坊旁，才能动手合成。'}
  if(['stone_pick','copper_pick'].includes(id)&&state.inventory[id])return {ok:false,message:'你已经有这把工具啦。'}
  if(Object.entries(recipe.cost).some(([key,n])=>(state.inventory[key]||0)<n))return {ok:false,message:'材料还不够，配方里可以看到缺哪些。'}
  if((state.inventory[id]||0)+recipe.count>999)return {ok:false,message:'这件物品已经装满了。'}
  const next=restore(state)
  for(const [key,n]of Object.entries(recipe.cost))next.inventory[key]-=n
  next.inventory[id]=(next.inventory[id]||0)+recipe.count
  return {ok:true,state:next,message:recipe.name+' ×'+recipe.count+' 合成好了！'+(['mirror','white_glass','glass','crystal'].includes(id)?'已经摆到工坊旁。':id==='lantern'?'矿洞入口亮起来了。':'')}
}
function creekX(z){return 3.6+Math.sin(z*.23)*1.15}
function canWalk(p) {
  if(!p||![p.x,p.y].every(Number.isFinite)||p.x< -15+radius||p.x>15-radius||p.y<.4||p.y>28-radius)return false
  // Water stays in its channel. A broad wooden bridge crosses at z = 9.
  if(Math.abs(p.x-creekX(p.y))<1.72+radius&&Math.abs(p.y-9)>1.0-radius)return false
  // The cave opens towards the trail; its sides and back remain solid.
  if(p.y>14.6&&p.x< -6.5){
    if(p.x< -13.5+radius||p.x> -7-radius||p.y>27-radius)return false
    if(p.y<15.5&&Math.abs(p.x+10.2)>1.5-radius)return false
  }
  if(Math.abs(p.x-bench.x)<1.2+radius&&Math.abs(p.y-bench.y)<.5+radius)return false
  if(p.x> -5.65-radius&&p.x<.15+radius&&Math.abs(p.y-6.2)<radius+.42)return false
  if(trees.some(([x,y])=>Math.hypot(p.x-x,p.y-y)<.18+radius))return false
  return !nodes.some(n=>n.material!=='sand'&&distance(p,n)<.55+radius)
}
function move(start,dx,dy) {
  if(![dx,dy].every(Number.isFinite))return {...start}
  let p={x:start.x,y:start.y};const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.09))
  for(let i=0;i<steps;i++){const x={x:p.x+dx/steps,y:p.y};if(canWalk(x))p=x;const y={x:p.x,y:p.y+dy/steps};if(canWalk(y))p=y}
  return p
}
function view(state,position) {
  const tool=tier(state),near=nearest(position),vein=near&&state.veins[near.id],cooldown=vein?Math.max(0,Math.ceil(vein.until-state.clock)):0
  return {natureTool:tool===2?'铜镐':tool===1?'石镐':'徒手 / 木镐',natureTarget:near?{...near,cooldown,progress:vein?vein.progress:0,locked:near.tier>tool}:null,
    natureAtBench:distance(position,bench)<=2.4,natureItems:materials.filter(m=>state.inventory[m.id]>0).map(m=>({...m,count:state.inventory[m.id]})),
    natureRecipes:recipes.map(r=>({...r,owned:!!state.inventory[r.id],ready:Object.entries(r.cost).every(([id,count])=>(state.inventory[id]||0)>=count)&&!(['stone_pick','copper_pick'].includes(r.id)&&state.inventory[r.id]),ingredients:Object.entries(r.cost).map(([id,count])=>({...byId[id],need:count,have:state.inventory[id]||0,enough:(state.inventory[id]||0)>=count}))}))}
}
module.exports={materials,nodes,trees,recipes,bench,spawn,fresh,restore,tier,nearest,gather,craft,creekX,canWalk,move,view}
