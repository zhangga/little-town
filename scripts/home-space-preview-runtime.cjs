// Browser bridge for manual / Playwright checks; never shipped in the miniapp.
const {roomData,createHomeRoom}=requireFile('miniapp/home/utils/home-room-page.js')
const {createRoomScenePage,keyboardKey}=requireFile('miniapp/home/utils/home-room-scene-page.js')
const {createHomeScene}=requireFile('miniapp/home/utils/home-scene.js')
const renderWXML=$gwx('miniapp/home/pages/room/room.wxml'),app=document.querySelector('#app')
const clone=value=>JSON.parse(JSON.stringify(value))
let server=clone(window.ROOM_FIXTURE),canvas,renderPending=false,sliding=false
const keyboard={},wxApi={getStorageSync:key=>key==='userInfo'?{id:'preview'}:key==='apiBackend'?'preview':JSON.parse(localStorage.getItem(key)||'null'),setStorageSync:(key,value)=>localStorage.setItem(key,JSON.stringify(value)),navigateTo(){window.lastNavigation='mall'},onKeyDown:fn=>keyboard.down=fn,onKeyUp:fn=>keyboard.up=fn,offKeyDown:()=>delete keyboard.down,offKeyUp:()=>delete keyboard.up}
const api={get:async()=>clone(server),put:async(url,body)=>{server.room={...server.room,layout:clone(body.layout),version:server.room.version+1};localStorage.setItem('home-space-qa',JSON.stringify(server));return clone(server)}}
if(new URLSearchParams(location.search).has('saved')){try{server=JSON.parse(localStorage.getItem('home-space-qa'))||server}catch(_){}}
const page=window.roomPage={...createHomeRoom(api,wxApi,console.error),...createRoomScenePage(wxApi),_visible:true,
 data:{...clone(roomData),state:server,tab:'room',busy:false,loading:false},
 setData(patch){for(const [key,value]of Object.entries(patch)){const bits=key.split('.');let dest=this.data;while(bits.length>1){const k=bits.shift();dest=dest[k]||(dest[k]={})}dest[bits[0]]=value}if(!renderPending){renderPending=true;queueMicrotask(()=>{renderPending=false;drawUI()})}},
 applyState(state){this.data.state=state;this.syncRoom(state)},onNoop(){},onTab(){window.lastNavigation='resident'}}
function makeNode(node){
 if(node===null||node===undefined)return document.createTextNode('')
 if(typeof node!=='object')return document.createTextNode(String(node))
 if(!node.tag||node.tag==='virtual'||node.tag==='wx-page'){const f=document.createDocumentFragment();(node.children||[]).forEach(c=>f.appendChild(makeNode(c)));return f}
 if(node.tag==='wx-canvas'&&canvas)return document.createComment('persistent canvas')
 const tag=({'wx-canvas':'canvas','wx-button':'button','wx-image':'img','wx-slider':'input'})[node.tag]||node.tag,el=document.createElement(tag)
 for(let [name,value]of Object.entries(node.attr||{})){
  if(value===false||value==null)continue
  if(name==='style')value=String(value).replace(/(-?[\d.]+)rpx/g,(_,n)=>'calc('+n+' * var(--rpx))')
  if(name==='src'&&String(value).startsWith('/home/'))value='/miniapp'+value
  if(name==='scrollX')name='scroll-x'
  if(name==='ariaLabel')name='aria-label'
  if(/^(bind|catch)/.test(name))el.dataset[name.toLowerCase()]=value
  else el.setAttribute(name,String(value))
 }
 if(node.tag==='wx-slider'){el.type='range';el.value=node.attr.value;el.addEventListener('input',()=>{sliding=true;invoke(el,'bindchanging',{value:Number(el.value)})});el.addEventListener('change',()=>{sliding=false;invoke(el,'bindchange',{value:Number(el.value)})})}
 if(tag==='canvas'){canvas=el;canvas.addEventListener=EventTarget.prototype.addEventListener.bind(canvas);canvas.removeEventListener=EventTarget.prototype.removeEventListener.bind(canvas);canvas.createImage=()=>new Image();canvas.requestAnimationFrame=requestAnimationFrame.bind(window);canvas.cancelAnimationFrame=cancelAnimationFrame.bind(window)}
 else(node.children||[]).forEach(c=>el.appendChild(makeNode(c)))
 return el
}
function drawUI(){if(sliding)return;const tree=makeNode(renderWXML(page.data,{})),existing=app.querySelector('.home-page');if(!existing){app.replaceChildren(tree);return}const next=tree.firstChild;existing.className=next.className;for(const child of [...existing.childNodes])if(child!==canvas)child.remove();for(const child of [...next.childNodes])if(child.nodeType!==8)existing.appendChild(child)}
function invoke(el,name,detail){const fn=el.dataset[name];if(fn&&page[fn])return page[fn]({type:name==='bindtap'?'tap':name,currentTarget:{dataset:el.dataset},detail:detail||{}})}
app.addEventListener('click',e=>{let el=e.target;while(el&&el!==app){if(el.dataset?.catchtap){invoke(el,'catchtap');break}if(el.dataset?.bindtap){invoke(el,'bindtap');break}el=el.parentElement}})
const heldTouchKeys=new Map()
app.addEventListener('pointerdown',e=>{const b=e.target.closest('button[data-key]');if(b){heldTouchKeys.set(e.pointerId,b.dataset.key);page.onRoomKeyStart({currentTarget:{dataset:{key:b.dataset.key}}})}})
window.addEventListener('pointerup',e=>{const key=heldTouchKeys.get(e.pointerId);if(key){page.onRoomKeyEnd({currentTarget:{dataset:{key}}});heldTouchKeys.delete(e.pointerId)}})
window.addEventListener('pointercancel',()=>{heldTouchKeys.clear();page.stopRoomWalk()})
window.addEventListener('keydown',e=>{if(['w','a','s','d','e','v','b','space','escape','m'].includes(keyboardKey(e))){e.preventDefault();keyboard.down?.(e)}})
window.addEventListener('keyup',e=>keyboard.up?.(e))
window.addEventListener('blur',()=>{page._visible=false;page.pauseRoomScene()});window.addEventListener('focus',()=>{page._visible=true;page.bindRoomKeyboard();page._scene?.start()})
app.addEventListener('pointermove',e=>{const root=e.target.closest('.home-page'),fn=root?.dataset.bindpointermove;if(fn&&page[fn])page[fn]({target:{id:e.target.id},detail:{pointerType:e.pointerType,clientX:e.clientX,clientY:e.clientY,buttons:e.buttons}})})
app.addEventListener('mouseleave',()=>page.onRoomPointerLeave())
page.syncRoom(server);drawUI()
page._canvasRect=canvas.getBoundingClientRect()
page._scene=createHomeScene(canvas,innerWidth,innerHeight,{pixelRatio:devicePixelRatio,catalog:server.furniture,room:server.room,outfit:server.resident.outfit_id,onFrame:dt=>page.tickRoom(dt),assetPath:p=>'/miniapp'+p})
page.refreshRoom();page._scene.setMode(page.data.roomCamera);page.bindRoomKeyboard();page._scene.start();page.setData({roomSceneReady:true})
let pointer=false
const ev=e=>({touches:[{clientX:e.clientX,clientY:e.clientY}],changedTouches:[{clientX:e.clientX,clientY:e.clientY}]})
canvas.addEventListener('pointerdown',e=>{pointer=true;canvas.setPointerCapture(e.pointerId);page.onRoomTouchStart(ev(e))})
canvas.addEventListener('pointermove',e=>{if(pointer)page.onRoomTouchMove(ev(e))})
canvas.addEventListener('pointerup',e=>{if(pointer)page.onRoomTouchEnd(ev(e));pointer=false})
canvas.addEventListener('pointercancel',()=>{pointer=false;page.onRoomTouchCancel()})
window.addEventListener('resize',()=>{page.onRoomPointerLeave();page._canvasRect=canvas.getBoundingClientRect();page._scene.resize(innerWidth,innerHeight,devicePixelRatio)})
