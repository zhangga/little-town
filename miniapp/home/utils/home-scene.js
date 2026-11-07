const { createScopedThreejs } = require('../vendor/three')
const { createModels } = require('./home-models')
const { dimensions } = require('./home-space')

function createHomeScene(canvas, width, height, options = {}) {
  const T=createScopedThreejs(canvas), models=createModels(T), scene=new T.Scene()
  scene.background=new T.Color(0xe8e4d4)
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false})
  renderer.setPixelRatio(Math.min(options.pixelRatio||1,2));renderer.setSize(width,height,false)
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
  renderer.outputEncoding=T.LinearEncoding
  const camera=new T.PerspectiveCamera(44,width/height,.1,220)
  const hand=new T.Group();camera.add(hand);scene.add(camera)
  models.box(hand,.14,-.19,-.45,.10,.26,.13,0xf2c795)
  models.box(hand,.14,-.38,-.45,.11,.17,.14,0xb99b61)
  hand.rotation.z=-.2;hand.traverse(m=>{if(m.isMesh){m.castShadow=false;m.receiveShadow=false}})
  scene.add(new T.HemisphereLight(0xfff9e9,0xd3d8bd,.8))
  const sun=new T.DirectionalLight(0xfff1d3,.55);sun.position.set(1,9,4);sun.castShadow=true
  sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:24})
  sun.shadow.bias=-.001;sun.shadow.radius=3;sun.target.position.set(3.5,0,3.5);scene.add(sun,sun.target)
  let plan=dimensions(options.room),house=models.house(plan);Object.values(house).forEach(g=>scene.add(g))
  const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshLambertMaterial({color:0xe4e2d0}))
  ground.rotation.x=-Math.PI/2;ground.position.y=-.46;ground.receiveShadow=true;scene.add(ground)
  const lamp=new T.PointLight(0xffd686,0,4,2);scene.add(lamp)
  const fire=new T.PointLight(0xffaa55,0,5,2);scene.add(fire)
  const furniture=new Map(), ray=new T.Raycaster(), floor=new T.Plane(new T.Vector3(0,1,0),0)
  const marker=new T.Group();scene.add(marker)
  const markerMaterial=new T.LineBasicMaterial({color:0x668a4e,depthTest:false})
  let avatar=models.actor(options.outfit), actor={...plan.entry,angle:Math.PI,moving:false,pose:''}
  scene.add(avatar)
  let yaw=.56,pitch=.74,distance=17.8,mode='overview',selected='',preview=null,time=0,raf=null,last=0,running=false,disposed=false
  let naturePath='',texture=null,screen=null,originalOutfit=options.outfit,doorOpen=false,doorProgress=0,zoomFactor=1,fireOn=false,lookPitch=0
  const target=new T.Vector3(3.5,.45,3.4)
  function destroyGroup(group) {group.traverse(m=>{if(m.geometry&&m.geometry!==models.cube)m.geometry.dispose();if(m===screen)m.material.dispose()});if(group.userData.materials)group.userData.materials.forEach(m=>m.dispose());scene.remove(group)}
  function clearMarker(){while(marker.children.length){const m=marker.children[0];m.geometry.dispose();marker.remove(m)}}
  function outline(p,valid) {
    clearMarker();if(!p)return
    const spec=options.catalog.find(i=>i.id===p.id);if(!spec)return
    const w=spec.width/2+.035,d=spec.depth/2+.035
    const geo=new T.Geometry();geo.vertices.push(new T.Vector3(-w,.045,-d),new T.Vector3(w,.045,-d),new T.Vector3(w,.045,d),new T.Vector3(-w,.045,d),new T.Vector3(-w,.045,-d))
    markerMaterial.color.setHex(valid?0x648d46:0xc26044)
    const line=new T.Line(geo,markerMaterial);line.renderOrder=10;marker.add(line)
    marker.position.set(p.x,0,p.y);marker.rotation.y=-p.angle*Math.PI/180
  }
  function updateCamera(immediate=false) {
    const elevation=actor.elevation||0
    const desired=mode==='close'?new T.Vector3(actor.x,.7+elevation,actor.y):new T.Vector3(plan.size/2,mode==='outside'?1.5:.45,plan.size/2)
    if(immediate)target.copy(desired);else target.lerp(desired,.12)
    const fit=Math.max(1,.58/camera.aspect)
    const d=(mode==='close'?7.5:mode==='outside'?(plan.size*3.1+3)*fit:plan.size*2.55)*zoomFactor
    distance=d
    if(mode==='first'){
      camera.position.set(actor.x,1.05+elevation+Math.sin(time*11)*(actor.moving&&!actor.airborne?.018:0),actor.y)
      camera.lookAt(new T.Vector3(actor.x-Math.sin(yaw)*Math.cos(lookPitch),camera.position.y-Math.sin(lookPitch),actor.y-Math.cos(yaw)*Math.cos(lookPitch)))
    }else{
      camera.position.set(target.x+Math.sin(yaw)*Math.cos(pitch)*d,target.y+Math.sin(pitch)*d,target.z+Math.cos(yaw)*Math.cos(pitch)*d)
      camera.lookAt(target)
    }
    const complete=mode==='outside'||mode==='first'
    house.roof.visible=complete
    house.back.visible=complete||camera.position.z>plan.size/2
    house.left.visible=complete||camera.position.x>plan.size/2
    house.right.visible=complete||camera.position.x<plan.size/2
    house.front.visible=complete||camera.position.z<plan.size/2
    avatar.visible=mode!=='first';hand.visible=mode==='first'
    // Fade only the occluding door in a following view; first person keeps the solid door.
    let fade=false
    if(mode==='close'&&actor.y<plan.size&&camera.position.z>plan.size){const t=(plan.size-actor.y)/(camera.position.z-actor.y);const x=actor.x+(camera.position.x-actor.x)*t;fade=Math.abs(x-plan.size/2)<plan.doorWidth/2+.3}
    house.door.userData.materials.forEach(m=>{m.opacity=fade?.16:1;m.depthWrite=!fade})
    hand.position.y=actor.moving&&!actor.airborne?Math.sin(time*11)*.009:0
    camera.updateMatrixWorld()
  }
  function setActor(value) {actor=Object.assign({},actor,value)}
  function render(dt=0) {
    if(disposed)return
    time+=dt
    doorProgress+=(Number(doorOpen)-doorProgress)*Math.min(1,dt*12)
    house.door.userData.leaves.forEach(({pivot,sign})=>{pivot.rotation.y=sign*doorProgress*Math.PI/2})
    const moving=actor.moving||actor.pose==='run'
    avatar.position.set(actor.x,(actor.elevation||0)+Math.abs(Math.sin(time*11))*(moving&&!actor.airborne?.025:0),actor.y)
    avatar.rotation.y=actor.angle||0
    const {body,limbs}=avatar.userData
    body.rotation.set(0,0,0);body.position.set(0,0,0)
    const stride=moving?Math.sin(time*11)*.48:0
    limbs.legL.rotation.x=stride;limbs.legR.rotation.x=-stride;limbs.armL.rotation.x=-stride*.7;limbs.armR.rotation.x=stride*.7
    if(actor.pose==='sit'){body.position.y=.18;limbs.legL.rotation.x=-1.3;limbs.legR.rotation.x=-1.3}
    if(actor.pose==='sleep'){body.rotation.x=-Math.PI/2;body.position.set(0,.58,.35)}
    if(['read','draw','tea','water','tidy','open','cook','wash','clean','play'].includes(actor.pose)){limbs.armR.rotation.x=-1.1+Math.sin(time*6)*.2;limbs.armL.rotation.x=-.7-Math.sin(time*6)*.15}
    if(actor.pose==='run')body.position.y=.24
    if(actor.pose==='swim'||actor.pose==='bath'){body.position.y=-.28;limbs.armL.rotation.x=Math.sin(time*3)*.6;limbs.armR.rotation.x=-Math.sin(time*3)*.6}
    if(fireOn)fire.intensity=1+Math.sin(time*7)*.12
    if(actor.pose==='stretch'){limbs.armR.rotation.z=-1.8;limbs.armL.rotation.z=1.8}else{limbs.armR.rotation.z=0;limbs.armL.rotation.z=0}
    if(actor.airborne){limbs.legL.rotation.x=.25;limbs.legR.rotation.x=-.2;limbs.armL.rotation.z=.3;limbs.armR.rotation.z=-.3}
    updateCamera();renderer.render(scene,camera)
  }
  function frame(ms) {
    if(!running||disposed)return
    raf=canvas.requestAnimationFrame(frame)
    if(!last)last=ms
    const elapsed=(ms-last)/1000
    if(elapsed<1/32)return
    const dt=Math.min(elapsed,.05);last=ms
    try{if(options.onFrame)options.onFrame(dt);render(dt)}catch(error){stop();if(options.onError)options.onError(error)}
  }
  function start(){if(running||disposed)return;running=true;last=0;raf=canvas.requestAnimationFrame(frame)}
  function stop(){running=false;if(raf!==null)canvas.cancelAnimationFrame(raf);raf=null;last=0}
  function setLayout(layout) {
    const ids=new Set(layout.map(p=>p.id));furniture.forEach((g,id)=>{if(!ids.has(id)){destroyGroup(g);if(id==='tv')screen=null;furniture.delete(id)}})
    for(const p of layout){let g=furniture.get(p.id);if(!g){g=models.furniture(p.id);furniture.set(p.id,g);scene.add(g)}g.position.set(p.x,0,p.y);g.rotation.y=-p.angle*Math.PI/180;g.userData.placement=p}
    if(texture)applyTexture()
    const p=layout.find(p=>p.id===selected);outline(p,true)
  }
  function configureSun(){
    const s=plan.size;sun.position.set(s*.14,s*1.3,s*.65);sun.target.position.set(s/2,0,s/2)
    Object.assign(sun.shadow.camera,{left:-s*.85,right:s*.85,top:s*.85,bottom:-s*.85,near:.5,far:s*3+20});sun.shadow.camera.updateProjectionMatrix()
  }
  function setHouse(room){
    const next=dimensions(room)
    if(next.size===plan.size&&next.level===plan.level)return
    Object.values(house).forEach(destroyGroup);plan=next;house=models.house(plan);Object.values(house).forEach(g=>scene.add(g));configureSun();updateCamera(true)
  }
  function setDoor(open){doorOpen=!!open}
  function applyTexture() {
    const tv=furniture.get('tv');if(!tv||!texture)return
    if(!screen){screen=new T.Mesh(new T.PlaneGeometry(.76,.43),new T.MeshBasicMaterial({map:texture}));screen.position.set(0,1.03,-.038);tv.add(screen)}
    else{screen.material.map=texture;screen.material.needsUpdate=true}
  }
  function setNature(path) {
    if(path===naturePath)return;naturePath=path
    const img=canvas.createImage();img.onload=()=>{
      if(disposed||path!==naturePath)return
      if(texture)texture.dispose();texture=new T.Texture(img);texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;applyTexture()
    };img.onerror=()=>{};img.src=options.assetPath?options.assetPath(path):path
  }
  function hit(x,y) {
    ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),camera)
    scene.updateMatrixWorld(true)
    const hits=ray.intersectObjects(Array.from(furniture.values()).concat(house.door),true)
    const point=new T.Vector3();const floorHit=ray.ray.intersectPlane(floor,point)
    let id=''
    if(hits.length){let object=hits[0].object;while(object&&!object.userData.furniture)object=object.parent;id=object?object.userData.furniture:''}
    return {id,point:floorHit?{x:point.x,y:point.z}:null}
  }
  function setPreview(p,valid) {
    if(preview&&preview.id!==(p&&p.id))clearPreview()
    if(!p){clearPreview();return}
    let g=furniture.get(p.id)
    if(!g){g=models.furniture(p.id);scene.add(g);furniture.set(p.id,g);g.userData.temporary=true}
    if(!preview)preview={id:p.id,original:g.userData.placement}
    g.position.set(p.x,0,p.y);g.rotation.y=-p.angle*Math.PI/180;outline(p,valid)
  }
  function clearPreview() {
    if(preview){const g=furniture.get(preview.id);if(g){if(g.userData.temporary){destroyGroup(g);furniture.delete(preview.id)}else if(preview.original){const p=preview.original;g.position.set(p.x,0,p.y);g.rotation.y=-p.angle*Math.PI/180}}}
    preview=null;clearMarker()
  }
  function setSelected(id){clearPreview();selected=id;const g=furniture.get(id);outline(g&&g.userData.placement,true)}
  function orbit(dx,dy){yaw-=dx*.007;if(mode==='first')lookPitch=Math.max(-1.05,Math.min(1.05,lookPitch+dy*.004));else pitch=Math.max(.3,Math.min(1.17,pitch+dy*.004));updateCamera()}
  function zoom(scale){zoomFactor=Math.max(.6,Math.min(1.55,zoomFactor/scale));updateCamera()}
  function setMode(value){mode=value;pitch=mode==='close'?.48:.74;camera.fov=mode==='first'?68:44;camera.updateProjectionMatrix();updateCamera(true)}
  function resize(w,h,ratio){width=w;height=h;renderer.setPixelRatio(Math.min(ratio||1,2));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();updateCamera(true)}
  function setOutfit(outfit){if(outfit===originalOutfit)return;destroyGroup(avatar);avatar=models.actor(outfit);originalOutfit=outfit;scene.add(avatar)}
  function setLamp(on){const g=furniture.get('lamp');lamp.intensity=on&&g?1.25:0;if(g)lamp.position.set(g.position.x,1.3,g.position.z)}
  function setFire(on){const g=furniture.get('fireplace');fireOn=!!on&&!!g;fire.intensity=fireOn?1:0;if(g)fire.position.set(g.position.x,.7,g.position.z+.4)}
  function contextLost(event){if(event.preventDefault)event.preventDefault();stop();if(options.onError)options.onError(new Error('WebGL context lost'))}
  if(canvas.addEventListener)canvas.addEventListener('webglcontextlost',contextLost)
  function dispose(){if(disposed)return;stop();disposed=true;if(canvas.removeEventListener)canvas.removeEventListener('webglcontextlost',contextLost);clearPreview();scene.traverse(m=>{if(m.geometry)m.geometry.dispose()});materialsDispose();renderer.dispose();models.dispose()}
  function materialsDispose(){ground.material.dispose();markerMaterial.dispose();house.door.userData.materials.forEach(m=>m.dispose());if(screen)screen.material.dispose();if(texture)texture.dispose();if(sun.shadow.map)sun.shadow.map.dispose()}
  configureSun();updateCamera(true);render()
  return {start,stop,dispose,render,resize,setLayout,setHouse,setDoor,setActor,setSelected,setPreview,clearPreview,setNature,setOutfit,setLamp,setFire,hit,orbit,zoom,setMode,
    // Screen-relative directions remain intuitive after orbiting the camera.
    movement(x,y){return {x:x*Math.cos(yaw)+y*Math.sin(yaw),y:-x*Math.sin(yaw)+y*Math.cos(yaw)}},
    project(x,y,z=0){const p=new T.Vector3(x,z,y).project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2}},
    stats(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,size:plan.size,level:plan.level,doorOpen,doorProgress,position:{...actor},camera:{yaw,pitch,distance,mode,lookPitch,eye:{x:camera.position.x,y:camera.position.y,z:camera.position.z}},avatarVisible:avatar.visible,avatarElevation:avatar.position.y,furniture:Array.from(furniture.keys())}}
  }
}
module.exports={createHomeScene}
