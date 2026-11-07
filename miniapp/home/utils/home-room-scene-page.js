const { createHomeScene } = require('./home-scene')
function keyboardKey(event) {
  if(!event)return ''
  if(event.altKey===true||event.altKey==='true'||event.ctrlKey||event.metaKey)return ''
  return ({KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',KeyE:'e',KeyV:'v',KeyM:'m',Space:'space',Escape:'escape',F5:'v'})[event.code]||({' ':'space',Spacebar:'space',Esc:'escape'})[event.key]||String(event.key||'').toLowerCase()
}
function createRoomScenePage(wxApi) {
  return {
    initRoomScene() {
      if(this._disposed||!this._visible||this._scene||this._scenePending||!this.data.state||!this.data.roomSupported||!wxApi.createSelectorQuery)return
      this._scenePending=true
      wxApi.createSelectorQuery().in(this).select('#home-space').fields({node:true,size:true,rect:true}).exec(results=>{
        this._scenePending=false
        if(this._disposed||!this._visible)return
        const result=results&&results[0]
        if(!result||!result.node||!result.width||!result.height){this.setData({roomSceneFailed:true});return}
        try{
          const info=wxApi.getWindowInfo?wxApi.getWindowInfo():wxApi.getSystemInfoSync()
          this._canvasRect=result
          this._scene=createHomeScene(result.node,result.width,result.height,{pixelRatio:info.pixelRatio,catalog:this.data.state.furniture,room:this.data.state.room,outfit:this.data.state.resident.outfit_id,onFrame:dt=>this.tickRoom(dt),onError:()=>{this.stopRoomWalk();if(!this._disposed)this.setData({roomSceneFailed:true,roomSceneReady:false})}})
          this.refreshRoom();this._scene.setMode(this.data.roomCamera);this._scene.start()
          this.setData({roomSceneReady:true,roomSceneFailed:false})
          if(this._candidate)this.previewRoomPlacement(this._candidate)
        }catch(err){if(this._scene)this._scene.dispose();this._scene=null;this.setData({roomSceneFailed:true,roomSceneReady:false})}
      })
    },
    onRoomSceneRetry() {
      if(this._scene)this._scene.dispose();this._scene=null
      this.setData({roomSceneFailed:false,roomSceneReady:false});this.initRoomScene()
    },
    bindRoomKeyboard() {
      if(this._keyboardDown||!wxApi.onKeyDown||!wxApi.onKeyUp)return
      this._keyboardDown=e=>this.setRoomKey(keyboardKey(e),true)
      this._keyboardUp=e=>this.setRoomKey(keyboardKey(e),false)
      wxApi.onKeyDown(this._keyboardDown);wxApi.onKeyUp(this._keyboardUp)
    },
    unbindRoomKeyboard() {
      if(this._keyboardDown&&wxApi.offKeyDown)wxApi.offKeyDown(this._keyboardDown)
      if(this._keyboardUp&&wxApi.offKeyUp)wxApi.offKeyUp(this._keyboardUp)
      this._keyboardDown=null;this._keyboardUp=null
    },
    pauseRoomScene() {this.stopRoomWalk();this.unbindRoomKeyboard();this._gesture=null;if(this._scene)this._scene.stop()},
    disposeRoomScene() {this.pauseRoomScene();if(this._scene)this._scene.dispose();this._scene=null},
    resizeRoomScene() {
      if(!this._scene||!wxApi.createSelectorQuery)return
      wxApi.createSelectorQuery().in(this).select('#home-space').boundingClientRect(rect=>{
        if(!rect||!this._scene)return
        this._canvasRect=rect;const info=wxApi.getWindowInfo?wxApi.getWindowInfo():wxApi.getSystemInfoSync();this._scene.resize(rect.width,rect.height,info.pixelRatio)
      }).exec()
    },
    roomTouchPoint(touch) {
      const rect=this._canvasRect||{left:0,top:0}
      return {x:Number.isFinite(touch.clientX)?touch.clientX-(rect.left||0):touch.x,y:Number.isFinite(touch.clientY)?touch.clientY-(rect.top||0):touch.y}
    },
    onRoomPointerLeave() {this._roomPointer=null},
    onRoomPointerMove(e) {
      // PC WeChat forwards PointerEvent fields in detail, even with no mouse button held.
      const detail=e.detail||e
      if(detail.pointerType!=='mouse')return
      if(!this.data.roomMouseAvailable&&this._visible)this.setData({roomMouseAvailable:true})
      const overRoom=e.target&&e.target.id==='home-space'
      if(!overRoom||!this._visible||!this._scene||!this.data.roomMouseLook||this.data.roomEditing||this.data.roomBagOpen||this.data.roomTV||this.data.roomHelp||this.data.busy||this._gesture||detail.buttons||!['first','close'].includes(this.data.roomCamera)){this._roomPointer=null;return}
      if(!Number.isFinite(detail.clientX)||!Number.isFinite(detail.clientY)){this._roomPointer=null;return}
      const previous=this._roomPointer
      this._roomPointer={x:detail.clientX,y:detail.clientY}
      if(!previous)return
      const dx=detail.clientX-previous.x,dy=detail.clientY-previous.y
      // Re-entering a window must not whip the camera around.
      if(Math.abs(dx)>120||Math.abs(dy)>120)return
      this._scene.orbit(dx,dy)
    },
    onRoomTouchStart(e) {
      if(!this._scene||this.data.busy||this.data.roomBagOpen||this.data.roomTV||!e.touches.length)return
      this._roomPointer=null
      const p=this.roomTouchPoint(e.touches[0]),hit=this._scene.hit(p.x,p.y)
      this._gesture={start:p,last:p,id:hit.id,time:Date.now(),moved:false,pinch:false}
      if(e.touches.length>1){this._gesture.pinch=true;this._gesture.distance=this.roomPinchDistance(e.touches);return}
      if(this.data.roomEditing&&hit.id&&hit.id!=='__door__'){if(hit.id!==this.data.roomSelected)this.onRoomChoose({currentTarget:{dataset:{id:hit.id}}});this._gesture.drag=!!this._candidate}
    },
    roomPinchDistance(touches) {const a=this.roomTouchPoint(touches[0]),b=this.roomTouchPoint(touches[1]);return Math.hypot(a.x-b.x,a.y-b.y)},
    onRoomTouchMove(e) {
      const g=this._gesture;if(!g||!this._scene||!e.touches.length)return
      const p=this.roomTouchPoint(e.touches[0])
      if(e.touches.length>1){const d=this.roomPinchDistance(e.touches);if(g.distance&&d)this._scene.zoom(d/g.distance);g.distance=d;g.pinch=true;g.moved=true;g.last=p;return}
      if(g.pinch)return
      if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>5)g.moved=true
      if(g.moved){
        if(g.drag&&this._candidate){const hit=this._scene.hit(p.x,p.y);if(hit.point)this.previewRoomPlacement({...this._candidate,...hit.point})}
        else this._scene.orbit(p.x-g.last.x,p.y-g.last.y)
      }
      g.last=p
    },
    onRoomTouchEnd(e) {
      const g=this._gesture;this._gesture=null
      if(!g||!this._scene||this.data.busy)return
      if(g.pinch)return
      if(g.moved){if(g.drag)this.placeRoomCandidate();return}
      const p=e.changedTouches&&e.changedTouches[0]?this.roomTouchPoint(e.changedTouches[0]):g.last,hit=this._scene.hit(p.x,p.y)
      if(hit.id==='__door__'){this.onRoomDoor();return}
      if(hit.id){const event={currentTarget:{dataset:{id:hit.id}}};if(Date.now()-g.time>450)this.onRoomChoose(event);else this.onRoomFurniture(event)}
      else if(hit.point)this.onRoomFloor(hit.point)
    },
    onRoomTouchCancel() {this._gesture=null;this.stopRoomWalk()},
    onRoomZoom(e) {if(this._scene)this._scene.zoom(Number(e.currentTarget.dataset.scale))}
  }
}
module.exports={createRoomScenePage,keyboardKey}
