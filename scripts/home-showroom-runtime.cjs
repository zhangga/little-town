// Render actual in-game models as transparent shop and upgrade illustrations.
window.renderHomeModel = async function(kind,id){
 const {createScopedThreejs}=requireFile('miniapp/home/vendor/three.js'),{createModels}=requireFile('miniapp/home/utils/home-models.js')
 const c=document.createElement('canvas');c.width=512;c.height=512;c.addEventListener=EventTarget.prototype.addEventListener.bind(c);c.removeEventListener=EventTarget.prototype.removeEventListener.bind(c);c.createImage=()=>new Image()
 const T=createScopedThreejs(c),models=createModels(T),renderer=new T.WebGLRenderer({canvas:c,alpha:true,antialias:true,preserveDrawingBuffer:true})
 renderer.setSize(512,512,false);renderer.setClearColor(0,0);renderer.outputEncoding=T.LinearEncoding;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
 const scene=new T.Scene();scene.add(new T.HemisphereLight(0xfff9e9,0xc6ccb7,.8))
 const group=new T.Group();if(kind==='home'){const size=[0,7,9,12,16,20][id];Object.values(models.house({size,level:Number(id)})).forEach(g=>group.add(g))}else group.add(models.furniture(id));scene.add(group)
 const bounds=new T.Box3().setFromObject(group),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),span=Math.max(size.x,size.y,size.z)
 const camera=new T.OrthographicCamera(-1,1,1,-1,.1,span*10);camera.position.copy(center).add(new T.Vector3(.9,.8,1.15).normalize().multiplyScalar(span*4));camera.lookAt(center);camera.updateMatrixWorld()
 let extent=0;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).project(camera);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y))}
 extent*=1.09;camera.left=-extent;camera.right=extent;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix()
 const sun=new T.DirectionalLight(0xfff0cf,.6);sun.position.copy(center).add(new T.Vector3(-.6,1.6,1).multiplyScalar(span));sun.target.position.copy(center);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,far:span*5});sun.shadow.bias=-.001;scene.add(sun,sun.target)
 renderer.render(scene,camera);const png=c.toDataURL('image/png')
 scene.traverse(m=>{if(m.geometry&&m.geometry!==models.cube)m.geometry.dispose()});if(sun.shadow.map)sun.shadow.map.dispose();renderer.dispose();models.dispose();return png
}
