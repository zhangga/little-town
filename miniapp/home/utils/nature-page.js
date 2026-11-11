const world = require('./nature-resources')
const natureData = { natureExploring:false,natureBagOpen:false,natureBagTab:'recipes',natureItems:[],natureRecipes:[],natureTarget:null,natureTool:'徒手 / 木镐',natureAtBench:false,natureSaveError:false,natureRegion:'林溪草地',natureReturnLabel:'回小家' }
function createNaturePage(wxApi) {
  function identity() {
    const user=wxApi.getStorageSync&&wxApi.getStorageSync('userInfo')
    return user&&user.id?'nature-world-v1:'+(wxApi.getStorageSync('apiBackend')||'local')+':'+user.id:null
  }
  return {
    loadNatureWorld() {
      let key
      try{key=identity()}catch(_){key=null}
      if(key===this._natureIdentity&&this._natureState&&this._natureLoaded)return
      if(this.data.natureExploring)this.onNatureReturn()
      this._natureIdentity=key;this._natureState=world.fresh();this._natureLoaded=false
      try{if(key){this._natureState=world.restore(wxApi.getStorageSync(key));this._natureLoaded=true;this.setData({natureSaveError:false})}}catch(_){this.setData({natureSaveError:true})}
      this._natureInteractAt=-1;this._natureUI=0;this._natureViewSignature=''
      this.refreshNatureWorld()
    },
    naturePosition() {const size=this.data.roomSize;return this._actor?{x:this._actor.x-size/2,y:this._actor.y-size-1.8}:{...world.spawn}},
    refreshNatureWorld() {
      if(!this._natureState)return
      this.setData(world.view(this._natureState,this.data.natureExploring?this.naturePosition():world.spawn))
      if(this._scene&&this._scene.setNatureInventory)this._scene.setNatureInventory(this._natureState.inventory)
    },
    commitNatureWorld(next,message) {
      // Keep the previous inventory if a local save fails; retry cannot duplicate a craft.
      try{
        if(!this._natureIdentity||!this._natureLoaded||!wxApi.setStorageSync)throw Error('No account storage')
        wxApi.setStorageSync(this._natureIdentity,next)
      }catch(_){this.setData({natureSaveError:true,roomMessage:'这次没有保存成功，材料保留原样，稍后再试。'});return false}
      this._natureState=next;this.setData({natureSaveError:false,roomMessage:message});this.refreshNatureWorld();return true
    },
    onNatureExplore() {
      if(!this._visible||this.data.busy||this.data.roomEditing||!this.data.roomSceneReady)return
      this.loadNatureWorld();this.stopRoomWalk()
      this._homeReturn={actor:{...this._actor},camera:this.data.roomCamera}
      this._actor={x:this.data.roomSize/2+world.spawn.x,y:this.data.roomSize+1.8+world.spawn.y,angle:0,moving:false,pose:''}
      this.setData({natureExploring:true,natureBagOpen:false,roomBagOpen:false,roomTV:false,roomHelp:false,roomCamera:'close',roomMessage:'沿溪走走吧。靠近原木、石块或矿脉，按 E 采集；B 打开合成背包。'})
      if(this._scene){this._scene.setExploring(true);this._scene.setActor(this._actor);this._scene.setMode('close')}
      this.refreshNatureWorld()
    },
    onNatureReturn() {
      this.saveNatureCheckpoint()
      this.stopRoomWalk()
      const saved=this._homeReturn
      this._actor=saved?saved.actor:{x:this.data.roomSize/2,y:this.data.roomSize-.5,angle:Math.PI,moving:false,pose:''}
      this._actor.moving=false;this._actor.airborne=false;this._actor.elevation=0
      this.setData({natureExploring:false,natureBagOpen:false,roomCamera:saved?saved.camera:'close',roomMessage:'回到小家啦，溪边的收藏已经保存。',roomActor:{...this._actor}})
      if(this._scene){this._scene.setExploring(false);this._scene.setActor(this._actor);this._scene.setMode(this.data.roomCamera)}
    },
    saveNatureCheckpoint(){
      if(!this._natureLoaded||!this._natureIdentity||!this._natureState)return
      try{wxApi.setStorageSync(this._natureIdentity,this._natureState)}catch(_){if(this._visible)this.setData({natureSaveError:true})}
    },
    onNatureLeave(){if(this._natureViaWorld&&wxApi.navigateBack){this.stopRoomWalk();this.saveNatureCheckpoint();wxApi.navigateBack()}else this.onNatureReturn()},
    onNatureBag() {
      if(!this._visible||this._disposed||!this.data.natureExploring)return
      this.stopRoomWalk();this.setData({natureBagOpen:!this.data.natureBagOpen,roomHelp:false});this.refreshNatureWorld()
    },
    onNatureBagTab(e){if(['recipes','materials'].includes(e.currentTarget.dataset.id))this.setData({natureBagTab:e.currentTarget.dataset.id})},
    onNatureInteract() {
      if(!this._visible||!this.data.natureExploring||this.data.natureBagOpen||this._actor.airborne||!this._natureState)return
      const target=world.nearest(this.naturePosition());if(!target){this.setData({roomMessage:'靠近原木、石块、沙滩或洞里的矿脉，就能采集。'});return}
      if(target.id==='bench'){this.onNatureBag();return}
      if(this._natureInteractAt>=0&&this._natureState.clock-this._natureInteractAt<.32)return
      this._natureInteractAt=this._natureState.clock
      const result=world.gather(this._natureState,target.id,this.naturePosition())
      if(result.ok){if(this.commitNatureWorld(result.state,result.message)){this._actor.pose='tidy';this._natureActionUntil=this._natureState.clock+.45}}else this.setData({roomMessage:result.message})
    },
    onNatureCraft(e) {
      if(!this._visible||!this.data.natureExploring||!this.data.natureBagOpen||!this._natureState)return
      const result=world.craft(this._natureState,e.currentTarget.dataset.id,this.naturePosition())
      if(result.ok)this.commitNatureWorld(result.state,result.message);else this.setData({roomMessage:result.message})
    },
    tickNature(dt) {
      if(!this._natureState)return
      this._natureState.clock+=dt
      if(this._actor.pose&&this._natureState.clock>this._natureActionUntil)this._actor.pose=''
      const held=this._heldKeys||new Set(),before={...this._actor}
      if(this._actor.airborne){this._actor.elevation=Math.max(0,this._actor.elevation+this._jumpVelocity*dt-8*dt*dt);this._jumpVelocity-=16*dt;if(this._actor.elevation===0&&this._jumpVelocity<0){this._actor.airborne=false;this._jumpVelocity=0;this.setData({roomJumping:false})}}
      const dx=Number(held.has('d'))-Number(held.has('a')),dy=Number(held.has('s'))-Number(held.has('w')),length=Math.hypot(dx,dy)
      if(length){const v=this._scene?this._scene.movement(dx/length,dy/length):{x:dx/length,y:dy/length},p=world.move(this.naturePosition(),v.x*dt*2.6,v.y*dt*2.6);this._actor.x=p.x+this.data.roomSize/2;this._actor.y=p.y+this.data.roomSize+1.8}
      const mx=this._actor.x-before.x,my=this._actor.y-before.y;this._actor.moving=Math.hypot(mx,my)>.0001
      if(this._actor.moving){this._actor.angle=Math.atan2(mx,my);this._actor.pose=''}
      if(this._scene)this._scene.setActor(this._actor)
      this._natureUI+=dt
      if(this._natureUI>.2){this._natureUI=0;const p=this.naturePosition(),region=p.y>15&&p.x< -6.5?'晶石矿洞':Math.abs(p.x-world.creekX(p.y))<3?'慢溪与木桥':'林溪草地',view=world.view(this._natureState,p)
        const patch={natureRegion:region,natureTarget:view.natureTarget,natureAtBench:view.natureAtBench},signature=JSON.stringify(patch)
        if(signature!==this._natureViewSignature){this._natureViewSignature=signature;this.setData(patch)}
      }
      if(before.moving!==this._actor.moving||before.airborne!==this._actor.airborne)this.setData({roomActor:{...this._actor}})
    }
  }
}
module.exports={natureData,createNaturePage}
