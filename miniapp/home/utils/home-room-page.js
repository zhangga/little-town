const { nature, actions, presentFurniture } = require('./home-room')
const space = require('./home-space')
const roomData = {
  roomSupported:false,roomEditing:false,roomDirty:false,roomVersion:0,roomDraft:[],roomFurniture:[],roomInventory:[],
  roomSelected:'',roomRotation:0,roomAngle:0,roomSelectionName:'',roomActor:null,roomMessage:'按住 WASD 走动，拖动空白处转动视角。',
  roomAction:'',roomLamp:false,roomTV:false,roomNatureIndex:0,roomNature:nature[0],roomSaving:false,
  roomBagOpen:false,roomBagCount:0,roomPreviewValid:true,roomSceneReady:false,roomSceneFailed:false,roomCamera:'overview',roomKeys:[],roomHelp:false
}
function createHomeRoom(api, wxApi, showError) {
  return {
    syncRoom(state) {
      if(!state.room||!Array.isArray(state.furniture)){this.setData({roomSupported:false});return}
      const patch={roomSupported:true}
      if(!this.data.roomEditing){patch.roomDraft=state.room.layout.map(p=>space.normalize(p,state.furniture));patch.roomVersion=state.room.version}
      this.setData(patch)
      if(!this._actor||!space.canWalk(this._actor,this.data.roomDraft,state.furniture))this._actor={...space.ENTRY,angle:Math.PI,moving:false,pose:''}
      this.setData({roomActor:{...this._actor}});this.refreshRoom()
    },
    refreshRoom() {
      if(!this.data.state)return
      const catalog=presentFurniture(this.data.state.furniture,this.data.state.wallet,this.data.roomDraft)
      this.setData({roomInventory:catalog.filter(i=>i.owned),roomBagCount:catalog.filter(i=>i.owned&&!i.placed).length,roomFurniture:this.data.roomDraft.map(p=>({...catalog.find(i=>i.id===p.id),...p}))})
      if(this._scene){this._scene.clearPreview();this._scene.setLayout(this.data.roomDraft);this._scene.setActor(this._actor);this._scene.setSelected(this.data.roomSelected);this._scene.setOutfit(this.data.state.resident.outfit_id);this._scene.setNature(this.data.roomNature.image);this._scene.setLamp(this.data.roomLamp)}
    },
    stopRoomWalk() {
      this.leaveRoomSeat()
      this._walkPath=null;this._walkDone=null;this._heldKeys=new Set()
      if(this._actor){this._actor.moving=false;this._actor.pose=''}
      if(!this._disposed){this.setData({roomKeys:[],roomActor:this._actor?{...this._actor}:null});if(this._scene)this._scene.setActor(this._actor)}
    },
    onRoomBag() {
      if(this.data.roomSaving||this.data.busy)return
      this.stopRoomWalk();this.setData({roomBagOpen:!this.data.roomBagOpen,roomHelp:false})
    },
    onRoomEdit() {
      if(this.data.busy||this.data.roomSaving||!this.data.roomSupported)return
      this.stopRoomWalk();this.setData({roomEditing:true,roomAction:'',roomTV:false})
    },
    onRoomCancel() {
      if(this.data.roomSaving)return
      this._candidate=null
      if(this._scene)this._scene.clearPreview()
      this.setData({roomEditing:false,roomDirty:false,roomSelected:'',roomSelectionName:'',roomBagOpen:false,roomAngle:0,roomPreviewValid:true,roomMessage:'按住 WASD 走动，拖动空白处转动视角。'})
      this.syncRoom(this.data.state)
    },
    onRoomChoose(e) {
      if(this.data.busy||this.data.roomSaving)return
      const id=e.currentTarget.dataset.id,item=this.data.roomInventory.find(i=>i.id===id)
      if(!item)return
      this.onRoomEdit()
      const placed=this.data.roomDraft.find(p=>p.id===id)
      let candidate=placed?{...placed}:{id,x:3.5,y:4.5,rotation:0,angle:0}
      if(!placed){
        const spots=[];for(let x=.5;x<7;x+=.25)for(let y=.5;y<6;y+=.25)spots.push({id,x,y,rotation:0,angle:0})
        spots.sort((a,b)=>Math.hypot(a.x-3.5,a.y-4)-Math.hypot(b.x-3.5,b.y-4))
        candidate=spots.find(p=>space.canPlace(this.data.roomDraft,this.data.state.furniture,p))||candidate
      }
      this.setData({roomSelected:id,roomSelectionName:item.name,roomAngle:candidate.angle,roomRotation:0,roomBagOpen:false,roomMessage:'拖动家具或点地板放置，滑动角度条自由旋转。'})
      if(this._scene)this._scene.setSelected(id)
      this.previewRoomPlacement(candidate)
    },
    previewRoomPlacement(p) {
      if(!p||this.data.roomSaving)return
      this._candidate={...p,x:space.round(p.x),y:space.round(p.y),angle:space.degrees(p.angle)}
      const valid=space.canPlace(this.data.roomDraft,this.data.state.furniture,this._candidate)
      this.setData({roomPreviewValid:valid,roomAngle:this._candidate.angle})
      if(this._scene)this._scene.setPreview(this._candidate,valid)
    },
    placeRoomCandidate() {
      if(this.data.roomSaving||!this._candidate)return false
      const p={...this._candidate}
      if(!space.canPlace(this.data.roomDraft,this.data.state.furniture,p)){this.setData({roomMessage:'这里放不下，红框移到空地变绿后就能放下。'});return false}
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
      const finish=()=>{this._candidate=null;if(this._scene)this._scene.clearPreview();this.setData({roomEditing:false,roomDirty:false,roomSelected:'',roomBagOpen:false})}
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
      if(this.data.busy||!this.data.roomSupported||!point)return
      if(this.data.roomEditing){
        if(!this._candidate){this.setData({roomMessage:'打开底部小背包，选一件家具。'});return}
        this.previewRoomPlacement({...this._candidate,...point});this.placeRoomCandidate();return
      }
      this.walkRoom(space.pathTo(this._actor,point,this.data.roomDraft,this.data.state.furniture))
    },
    walkRoom(path,done) {
      this.stopRoomWalk()
      if(path===null){this.setData({roomMessage:'那里走不过去，换一块空地试试。'});return}
      this._walkPath=path.slice();this._walkDone=done
      this.setData({roomAction:'',roomMessage:'慢慢走，家里的一切都属于你。'})
    },
    setRoomKey(key,down) {
      if(!['w','a','s','d'].includes(key))return
      if(!this._heldKeys)this._heldKeys=new Set()
      if(!down){this._heldKeys.delete(key);if(!this._disposed)this.setData({roomKeys:Array.from(this._heldKeys)});return}
      if(!this._visible||this.data.roomEditing||this.data.roomBagOpen||this.data.roomTV||this.data.busy)return
      this.leaveRoomSeat()
      this._walkPath=null;this._walkDone=null;this._heldKeys.add(key)
      if(this._actor)this._actor.pose=''
      this.setData({roomKeys:Array.from(this._heldKeys),roomAction:''})
    },
    onRoomKeyStart(e) {this.setRoomKey(e.currentTarget.dataset.key,true)},
    onRoomKeyEnd(e) {this.setRoomKey(e.currentTarget.dataset.key,false)},
    tickRoom(dt) {
      if(!this._visible||!this._actor||this.data.roomEditing||this.data.roomBagOpen||this.data.roomTV||this.data.busy)return
      const held=this._heldKeys||new Set(),before={...this._actor}
      let dx=Number(held.has('d'))-Number(held.has('a')),dy=Number(held.has('s'))-Number(held.has('w'))
      if(dx||dy){
        const len=Math.hypot(dx,dy);dx/=len;dy/=len
        const move=this._scene?this._scene.movement(dx,dy):{x:dx,y:dy}
        Object.assign(this._actor,space.move(this._actor,move.x*dt*1.75,move.y*dt*1.75,this.data.roomDraft,this.data.state.furniture))
      }else if(this._walkPath&&this._walkPath.length){
        const target=this._walkPath[0],vx=target.x-this._actor.x,vy=target.y-this._actor.y,d=Math.hypot(vx,vy),step=Math.min(d,dt*1.75)
        if(d<.015)this._walkPath.shift()
        else Object.assign(this._actor,space.move(this._actor,vx/d*step,vy/d*step,this.data.roomDraft,this.data.state.furniture))
      }
      const mx=this._actor.x-before.x,my=this._actor.y-before.y
      this._actor.moving=Math.hypot(mx,my)>.0001
      if(this._actor.moving){this._actor.angle=Math.atan2(mx,my);this._actor.pose=''}
      if(this._walkPath&&!this._walkPath.length){this._walkPath=null;const done=this._walkDone;this._walkDone=null;if(done)done()}
      if(this._scene)this._scene.setActor(this._actor)
      if(before.moving!==this._actor.moving)this.setData({roomActor:{...this._actor}})
    },
    onRoomFurniture(e) {
      if(this.data.busy)return
      if(this.data.roomEditing){this.onRoomChoose(e);return}
      const id=e.currentTarget.dataset.id,placed=this.data.roomDraft.find(p=>p.id===id)
      if(!placed||!actions[id])return
      this.walkRoom(space.approach(this._actor,placed,this.data.roomDraft,this.data.state.furniture),()=>{
        const action=actions[id];this._actor.pose=action.pose;this._actor.angle=Math.atan2(placed.x-this._actor.x,placed.y-this._actor.y)
        if(['chair','sofa','bed'].includes(id)){this._seatReturn={x:this._actor.x,y:this._actor.y};this._actor.x=placed.x;this._actor.y=placed.y;this._actor.angle=-placed.angle*Math.PI/180}
        this.setData({roomAction:id,roomMessage:action.text,roomActor:{...this._actor}})
        if(id==='lamp'){this.setData({roomLamp:!this.data.roomLamp});if(this._scene)this._scene.setLamp(this.data.roomLamp)}
        if(id==='tv'){this._heldKeys=new Set();this.setData({roomTV:true})}
      })
    },
    leaveRoomSeat() {if(this._seatReturn&&this._actor){Object.assign(this._actor,this._seatReturn,{pose:''});this._seatReturn=null}},
    onRoomNature(e) {const index=(this.data.roomNatureIndex+Number(e.currentTarget.dataset.step)+nature.length)%nature.length;this.setData({roomNatureIndex:index,roomNature:nature[index]});if(this._scene)this._scene.setNature(nature[index].image)},
    onRoomTVClose() {this.setData({roomTV:false})},
    onRoomCamera() {const mode=this.data.roomCamera==='overview'?'close':'overview';this.setData({roomCamera:mode});if(this._scene)this._scene.setMode(mode)},
    onRoomHelp() {this.setData({roomHelp:!this.data.roomHelp})},
    onGoMall() {if(this.data.busy)return;this.stopRoomWalk();wxApi.navigateTo({url:'/home/pages/mall/mall'})}
  }
}
module.exports={roomData,createHomeRoom}
