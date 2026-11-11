const { nature, actions, presentFurniture } = require('./home-room')
const space = require('./home-space')
const {natureData,createNaturePage}=require('./nature-page')
const movementHint = 'WASD 走动 · 空格跳跃 · 鼠标或拖动转视角。'
const roomData = {
  ...natureData,
  roomSupported:false,roomEditing:false,roomDirty:false,roomVersion:0,roomDraft:[],roomFurniture:[],roomInventory:[],
  roomSelected:'',roomRotation:0,roomAngle:0,roomSelectionName:'',roomActor:null,roomMessage:movementHint,
  roomJumping:false,roomMouseLook:true,roomMouseAvailable:false,
  roomAction:'',roomLamp:false,roomTV:false,roomNatureIndex:0,roomNature:nature[0],roomSaving:false,
  roomSize:7,roomLevel:1,roomName:'橡木小家',roomDoorOpen:false,roomFire:false,roomBagOpen:false,roomBagCount:0,roomPreviewValid:true,roomSceneReady:false,roomSceneFailed:false,roomCamera:'close',roomKeys:{},roomHelp:false
}
function createHomeRoom(api, wxApi, showError) {
  return {
    ...createNaturePage(wxApi),
    roomGeometry() {return Object.assign({},this.data.state&&this.data.state.room,{doorOpen:this.data.roomDoorOpen,porch:true})},
    syncRoom(state) {
      if(!state.room||!Array.isArray(state.furniture)){this.setData({roomSupported:false});return}
      const geometry=space.dimensions(state.room)
      if(this.data.natureExploring&&geometry.size!==this.data.roomSize)this.onNatureReturn()
      const patch={roomSupported:true,roomSize:geometry.size,roomLevel:geometry.level,roomName:state.home.name||'橡木小家'}
      if(!this.data.roomEditing){patch.roomDraft=state.room.layout.map(p=>space.normalize(p,state.furniture));patch.roomVersion=state.room.version}
      this.setData(patch)
      if(!this._actor||(!this.data.natureExploring&&!space.canWalk(this._actor,this.data.roomDraft,state.furniture,this.roomGeometry())))this._actor={...geometry.entry,angle:Math.PI,moving:false,pose:''}
      this.setData({roomActor:{...this._actor}});this.refreshRoom()
      this.loadNatureWorld()
    },
    refreshRoom() {
      if(!this.data.state)return
      const catalog=presentFurniture(this.data.state.furniture,this.data.state.wallet,this.data.roomDraft)
      this.setData({roomInventory:catalog.filter(i=>i.owned),roomBagCount:catalog.filter(i=>i.owned&&!i.placed).length,roomFurniture:this.data.roomDraft.map(p=>({...catalog.find(i=>i.id===p.id),...p}))})
      if(this._scene){this._scene.setHouse(this.roomGeometry());this._scene.setDoor(this.data.roomDoorOpen);this._scene.clearPreview();this._scene.setLayout(this.data.roomDraft);this._scene.setActor(this._actor);this._scene.setSelected(this.data.roomSelected);this._scene.setOutfit(this.data.state.resident.outfit_id);this._scene.setNature(this.data.roomNature.image);this._scene.setLamp(this.data.roomLamp);this._scene.setFire(this.data.roomFire);if(this._candidate)this.previewRoomPlacement(this._candidate)}
      if(this._scene&&this._scene.setNatureInventory&&this._natureState)this._scene.setNatureInventory(this._natureState.inventory)
    },
    stopRoomWalk() {
      this.leaveRoomSeat()
      this._walkPath=null;this._walkDone=null;this._heldKeys=new Set();this._doorKeyHeld=false;this._viewKeyHeld=false;this._jumpHeld=false;this._mouseKeyHeld=false;this._natureBagKey=false;this._roomPointer=null
      this._jumpVelocity=0
      if(this._actor&&this._actor.airborne)Object.assign(this._actor,{elevation:0,airborne:false})
      if(this._actor){this._actor.moving=false;this._actor.pose=''}
      if(!this._disposed){this.setData({roomKeys:{},roomJumping:false,roomActor:this._actor?{...this._actor}:null});if(this._scene)this._scene.setActor(this._actor)}
    },
    onRoomBag() {
      if(this.data.natureExploring){this.onNatureBag();return}
      if(this.data.roomSaving||this.data.busy)return
      this.stopRoomWalk();this.setData({roomBagOpen:!this.data.roomBagOpen,roomHelp:false})
    },
    onRoomEdit() {
      if(this.data.natureExploring)return
      if(this.data.busy||this.data.roomSaving||!this.data.roomSupported)return
      if(!this.data.roomEditing)this._playCamera=this.data.roomCamera
      this.stopRoomWalk();this.setData({roomEditing:true,roomAction:'',roomTV:false});if(this.data.roomCamera!=='overview'){this.setData({roomCamera:'overview'});if(this._scene)this._scene.setMode('overview')}
    },
    onRoomCancel() {
      if(this.data.roomSaving)return
      this._candidate=null
      if(this._scene)this._scene.clearPreview()
      this.setData({roomEditing:false,roomDirty:false,roomSelected:'',roomSelectionName:'',roomBagOpen:false,roomAngle:0,roomPreviewValid:true,roomMessage:movementHint})
      this.syncRoom(this.data.state);this.restoreRoomCamera()
    },
    restoreRoomCamera(){const mode=this._playCamera||'close';this.setData({roomCamera:mode});if(this._scene)this._scene.setMode(mode)},
    onRoomChoose(e) {
      if(this.data.busy||this.data.roomSaving)return
      const id=e.currentTarget.dataset.id,item=this.data.roomInventory.find(i=>i.id===id)
      if(!item)return
      this.onRoomEdit()
      const placed=this.data.roomDraft.find(p=>p.id===id)
      const size=this.data.roomSize
      let candidate=placed?{...placed}:{id,x:size/2,y:size/2,rotation:0,angle:0}
      if(!placed){
        const spots=[];for(let x=.5;x<size;x+=.5)for(let y=.5;y<size-.5;y+=.5)spots.push({id,x,y,rotation:0,angle:0})
        spots.sort((a,b)=>Math.hypot(a.x-size/2,a.y-size/2)-Math.hypot(b.x-size/2,b.y-size/2))
        candidate=spots.find(p=>space.canPlace(this.data.roomDraft,this.data.state.furniture,p,this.roomGeometry()))||candidate
      }
      this.setData({roomSelected:id,roomSelectionName:item.name,roomAngle:candidate.angle,roomRotation:0,roomBagOpen:false,roomMessage:'拖动家具或点地板放置，滑动角度条自由旋转。'})
      if(this._scene)this._scene.setSelected(id)
      this.previewRoomPlacement(candidate)
    },
    previewRoomPlacement(p) {
      if(!p||this.data.roomSaving)return
      this._candidate={...p,x:space.round(p.x),y:space.round(p.y),angle:space.degrees(p.angle)}
      const valid=space.canPlace(this.data.roomDraft,this.data.state.furniture,this._candidate,this.roomGeometry())
      this.setData({roomPreviewValid:valid,roomAngle:this._candidate.angle})
      if(this._scene)this._scene.setPreview(this._candidate,valid)
    },
    placeRoomCandidate() {
      if(this.data.roomSaving||!this._candidate)return false
      const p={...this._candidate}
      if(!space.canPlace(this.data.roomDraft,this.data.state.furniture,p,this.roomGeometry())){this.setData({roomMessage:'这里放不下，红框移到空地变绿后就能放下。'});return false}
      if(this._scene)this._scene.clearPreview()
      this.setData({roomDraft:this.data.roomDraft.filter(i=>i.id!==p.id).concat(p),roomDirty:true,roomMessage:'放好了，还可以拖动、旋转。完成后保存。'})
      this.refreshRoom();return true
    },
    onRoomRotate(e) {
      if(!this._candidate||this.data.roomSaving)return
      const value=e&&e.detail&&Number.isFinite(e.detail.value)?e.detail.value:this.data.roomAngle+Number(e&&e.currentTarget&&e.currentTarget.dataset.step||15)
      this.previewRoomPlacement({...this._candidate,angle:space.degrees(value)})
    },
    onRoomRotateEnd(e) {this.onRoomRotate(e);if(this.data.roomDraft.some(p=>p.id===this.data.roomSelected))this.placeRoomCandidate()},
    onRoomStore() {
      if(!this.data.roomSelected||this.data.roomSaving)return
      if(this._scene)this._scene.clearPreview()
      const layout=this.data.roomDraft.filter(p=>p.id!==this.data.roomSelected)
      this.setData({roomDraft:layout,roomDirty:this.data.roomDirty||layout.length!==this.data.roomDraft.length,roomSelected:'',roomSelectionName:'',roomBagOpen:true,roomMessage:'家具已收回小背包，随时可以再拿出来。'})
      this._candidate=null;this.refreshRoom()
    },
    async onRoomSave() {
      if(!this.data.roomEditing||this.data.roomSaving||this.data.busy||this._loadPromise)return
      if(this._candidate){if(!this.data.roomPreviewValid){this.setData({roomMessage:'先把红框家具移到空地，或收回背包。'});return}this.placeRoomCandidate()}
      if(!this.data.roomDirty){this.onRoomCancel();return}
      this.stopRoomWalk();this.setData({roomSaving:true,busy:true})
      const layout=this.data.roomDraft.map(p=>({...p}))
      const finish=()=>{this._candidate=null;if(this._scene)this._scene.clearPreview();this.setData({roomEditing:false,roomDirty:false,roomSelected:'',roomBagOpen:false});this.restoreRoomCamera()}
      try {
        const state=await api.put('/resident/room',{expected_version:this.data.roomVersion,layout})
        if(this._disposed)return
        finish();this.applyState(state);this.setData({roomMessage:'布置保存好了，来家里走走吧。'})
      } catch(err) {
        if(this._disposed)return
        let recovered=false,conflict=false
        try{
          const state=await api.get('/resident');if(this._disposed)return
          const normalize=items=>items.map(p=>space.normalize(p,state.furniture)).sort((a,b)=>a.id.localeCompare(b.id))
          recovered=JSON.stringify(normalize(state.room.layout))===JSON.stringify(normalize(layout))
          conflict=state.room.version!==this.data.roomVersion
          if(recovered||conflict)finish()
          this.applyState(state)
        }catch(_){}
        if(!this._disposed){if(recovered)this.setData({roomMessage:'布置已经保存好了。'});else {this.setData({roomMessage:conflict?'已取回另一处保存的新布置。':'没有保存成功，布置草稿还在。'});showError(err.message||'请稍后再试')}}
      } finally {if(!this._disposed)this.setData({roomSaving:false,busy:false})}
    },
    onRoomFloor(point) {
      if(this.data.natureExploring){this.onNatureInteract();return}
      if(this.data.busy||!this.data.roomSupported||!point)return
      if(this.data.roomEditing){
        if(!this._candidate){this.setData({roomMessage:'打开底部小背包，选一件家具。'});return}
        this.previewRoomPlacement({...this._candidate,...point});this.placeRoomCandidate();return
      }
      this.leaveRoomSeat();this.walkRoom(space.pathTo(this._actor,point,this.data.roomDraft,this.data.state.furniture,this.roomGeometry()))
    },
    walkRoom(path,done) {
      this.stopRoomWalk()
      if(path===null){this.setData({roomMessage:'那里走不过去，换一块空地试试。'});return}
      this._walkPath=path.slice();this._walkDone=done
      this.setData({roomAction:'',roomMessage:'慢慢走，家里的一切都属于你。'})
    },
    setRoomKey(key,down) {
      if(key==='b'&&this.data.natureExploring){if(!down){this._natureBagKey=false;return}if(!this._natureBagKey){this.onNatureBag();this._natureBagKey=true}return}
      if(key==='space'){if(!down){this._jumpHeld=false;return}if(!this._jumpHeld){this._jumpHeld=true;this.onRoomJump()}return}
      if(key==='escape'){if(down&&this._visible){this.stopRoomWalk();this.setData({roomMouseLook:false,roomMessage:'鼠标视角已暂停，按 M 或点右上角按钮继续。'})}return}
      if(key==='m'){if(!down){this._mouseKeyHeld=false;return}if(!this._mouseKeyHeld&&this._visible){this._mouseKeyHeld=true;this.onRoomMouseLook()}return}
      if(key==='v'){if(!down){this._viewKeyHeld=false;return}if(!this._viewKeyHeld&&this._visible&&!this.data.roomEditing&&!this.data.roomTV&&!this.data.roomBagOpen&&!this.data.natureBagOpen){this.onRoomPerspective();this._viewKeyHeld=true}return}
      if(key==='e'){if(!down){this._doorKeyHeld=false;return}if(!this._doorKeyHeld&&this._visible){if(this.data.natureExploring)this.onNatureInteract();else this.onRoomDoor();this._doorKeyHeld=true}return}
      if(!['w','a','s','d'].includes(key))return
      if(!this._heldKeys)this._heldKeys=new Set()
      if(!down){this._heldKeys.delete(key);if(!this._disposed)this.setData({['roomKeys.'+key]:false});return}
      if(!this._visible||this.data.roomEditing||this.data.roomBagOpen||this.data.natureBagOpen||this.data.roomTV||this.data.busy)return
      this.leaveRoomSeat()
      this._walkPath=null;this._walkDone=null;this._heldKeys.add(key)
      if(this._actor)this._actor.pose=''
      if(!this.data.roomKeys[key])this.setData({['roomKeys.'+key]:true,roomAction:''})
    },
    onRoomKeyStart(e) {this.setRoomKey(e.currentTarget.dataset.key,true)},
    onRoomKeyEnd(e) {this.setRoomKey(e.currentTarget.dataset.key,false)},
    onRoomJump() {
      if(!this._visible||!this._actor||this._actor.airborne||!this.data.roomSupported||this.data.roomEditing||this.data.roomBagOpen||this.data.natureBagOpen||this.data.roomTV||this.data.busy)return
      this.leaveRoomSeat();this._walkPath=null;this._walkDone=null;this._jumpVelocity=4.8
      Object.assign(this._actor,{elevation:0,airborne:true,pose:''})
      this.setData({roomJumping:true,roomAction:'',roomActor:{...this._actor}})
      if(this._scene)this._scene.setActor(this._actor)
    },
    onRoomMouseLook() {
      if(!this._visible||this.data.busy)return
      this._roomPointer=null
      this.setData({roomMouseAvailable:true,roomMouseLook:!this.data.roomMouseLook,roomMessage:this.data.roomMouseLook?'鼠标视角已暂停，仍可拖动画面转动。':'鼠标移进房间即可转动视角，Esc 暂停。'})
    },
    tickRoom(dt) {
      if(!this._visible||!this._actor||this.data.roomEditing||this.data.roomBagOpen||this.data.natureBagOpen||this.data.roomTV||this.data.busy)return
      if(this.data.natureExploring){this.tickNature(dt);return}
      const held=this._heldKeys||new Set(),before={...this._actor}
      if(this._actor.airborne){
        this._actor.elevation=Math.max(0,this._actor.elevation+this._jumpVelocity*dt-8*dt*dt)
        this._jumpVelocity-=16*dt
        if(this._actor.elevation===0&&this._jumpVelocity<0){this._actor.airborne=false;this._jumpVelocity=0;this.setData({roomJumping:false})}
      }
      let dx=Number(held.has('d'))-Number(held.has('a')),dy=Number(held.has('s'))-Number(held.has('w'))
      if(dx||dy){
        const len=Math.hypot(dx,dy);dx/=len;dy/=len
        const move=this._scene?this._scene.movement(dx,dy):{x:dx,y:dy}
        Object.assign(this._actor,space.move(this._actor,move.x*dt*1.75,move.y*dt*1.75,this.data.roomDraft,this.data.state.furniture,this.roomGeometry()))
      }else if(this._walkPath&&this._walkPath.length){
        const target=this._walkPath[0],vx=target.x-this._actor.x,vy=target.y-this._actor.y,d=Math.hypot(vx,vy),step=Math.min(d,dt*1.75)
        if(d<.015)this._walkPath.shift()
        else Object.assign(this._actor,space.move(this._actor,vx/d*step,vy/d*step,this.data.roomDraft,this.data.state.furniture,this.roomGeometry()))
      }
      const mx=this._actor.x-before.x,my=this._actor.y-before.y
      this._actor.moving=Math.hypot(mx,my)>.0001
      if(this._actor.moving){this._actor.angle=Math.atan2(mx,my);this._actor.pose=''}
      if(this._walkPath&&!this._walkPath.length){this._walkPath=null;const done=this._walkDone;this._walkDone=null;if(done)done()}
      if(this._scene)this._scene.setActor(this._actor)
      if(before.moving!==this._actor.moving||before.airborne!==this._actor.airborne)this.setData({roomActor:{...this._actor}})
    },
    onRoomFurniture(e) {
      if(this.data.natureExploring){this.onNatureInteract();return}
      if(this.data.busy)return
      if(this.data.roomEditing){this.onRoomChoose(e);return}
      const id=e.currentTarget.dataset.id,placed=this.data.roomDraft.find(p=>p.id===id)
      if(!placed||!actions[id])return
      this.leaveRoomSeat();this.walkRoom(space.approach(this._actor,placed,this.data.roomDraft,this.data.state.furniture,this.roomGeometry()),()=>{
        const action=actions[id];this._actor.pose=action.pose;this._actor.angle=Math.atan2(placed.x-this._actor.x,placed.y-this._actor.y)
        if(['chair','sofa','bed','sectional','bathtub','pool','treadmill'].includes(id)){this._seatReturn={x:this._actor.x,y:this._actor.y};this._actor.x=placed.x;this._actor.y=placed.y;this._actor.angle=-placed.angle*Math.PI/180}
        this.setData({roomAction:id,roomMessage:action.text,roomActor:{...this._actor}})
        if(id==='fireplace'){this.setData({roomFire:!this.data.roomFire});if(this._scene)this._scene.setFire(this.data.roomFire)}
        if(id==='lamp'){this.setData({roomLamp:!this.data.roomLamp});if(this._scene)this._scene.setLamp(this.data.roomLamp)}
        if(id==='tv'){this._heldKeys=new Set();this.setData({roomTV:true})}
      })
    },
    leaveRoomSeat() {if(this._seatReturn&&this._actor){Object.assign(this._actor,this._seatReturn,{pose:''});this._seatReturn=null}},
    onRoomNature(e) {const index=(this.data.roomNatureIndex+Number(e.currentTarget.dataset.step)+nature.length)%nature.length;this.setData({roomNatureIndex:index,roomNature:nature[index]});if(this._scene)this._scene.setNature(nature[index].image)},
    onRoomTVClose() {this.setData({roomTV:false})},
    onRoomCamera() {const mode=this.data.roomCamera==='overview'?'close':'overview';this.setData({roomCamera:mode});if(this._scene)this._scene.setMode(mode)},
    onRoomPerspective(){if(this.data.roomEditing||this.data.busy)return;const mode=this.data.roomCamera==='first'?'close':'first';this.setData({roomCamera:mode});if(this._scene)this._scene.setMode(mode)},
    onRoomExterior() {
      if(this.data.roomEditing)return
      const mode=this.data.roomCamera==='outside'?'close':'outside'
      this.setData({roomCamera:mode});if(this._scene)this._scene.setMode(mode)
    },
    onRoomDoor() {
      if(this.data.natureExploring){this.onNatureInteract();return}
      if(this.data.roomEditing||this.data.roomBagOpen||this.data.roomTV||this.data.busy||!this._actor)return
      const {size,doorWidth,entry}=space.dimensions(this.roomGeometry())
      if(this.data.roomDoorOpen&&Math.abs(this._actor.x-entry.x)<doorWidth/2+.2&&Math.abs(this._actor.y-size)<.35){this.setData({roomMessage:'先从门口走开一点，再关门。'});return}
      const toggle=()=>{const held=this._doorKeyHeld;this.stopRoomWalk();this._doorKeyHeld=held;this.setData({roomDoorOpen:!this.data.roomDoorOpen,roomMessage:this.data.roomDoorOpen?'木门关好啦。':'木门打开了，按 WASD 就能穿过门口。'});if(this._scene)this._scene.setDoor(this.data.roomDoorOpen)}
      if(Math.hypot(this._actor.x-entry.x,this._actor.y-size)>1.8){
        this.leaveRoomSeat();this.walkRoom(space.pathTo(this._actor,entry,this.data.roomDraft,this.data.state.furniture,this.roomGeometry()),toggle)
      }else toggle()
    },
    onRoomHelp() {this.setData({roomHelp:!this.data.roomHelp})},
    onGoMall() {if(this.data.busy)return;this.stopRoomWalk();wxApi.navigateTo({url:'/home/pages/mall/mall'})}
  }
}
module.exports={roomData,createHomeRoom}
