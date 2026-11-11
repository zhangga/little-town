const {nodes,trees,creekX}=require('./nature-resources')
const {createReflections}=require('./nature-reflections')
function createNatureWorld(T,models,scene,renderer,plan) {
  const root=new T.Group();root.position.set(plan.size/2,0,plan.size+1.8);scene.add(root)
  const staticParts=new T.Group();root.add(staticParts)
  const materials=[],geometries=[],leaves=[],waters=[],displays={},oreMeshes=[]
  let time=0,exploring=false,envReady=false,wind=0,flow=0
  const mat=(color,roughness=.9,metalness=0)=>{const m=new T.MeshStandardMaterial({color:new T.Color(color).convertSRGBToLinear(),roughness,metalness});materials.push(m);return m}
  const grass=mat(0x617d36),earth=mat(0x8e8160),rock=mat(0x6b756a),rockLight=mat(0x959b84),bark=mat(0x65503c),wood=mat(0xa27c4e)
  const leafMats=[0x487144,0x64863e,0x809648,0x96a351].map(c=>mat(c)),petal=mat(0xeadba2),pink=mat(0xc99c8c)
  const leafTime={value:0},windDepth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking})
  function flutter(shader){shader.uniforms.leafTime=leafTime;shader.vertexShader='uniform float leafTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x+=sin(position.y*5.0+position.x*3.0+leafTime*1.7)*.027;transformed.z+=sin(position.z*6.0+position.y*4.0+leafTime*1.3)*.018;')}
  leafMats.forEach(m=>{m.side=T.DoubleSide;m.onBeforeCompile=flutter});windDepth.onBeforeCompile=flutter;materials.push(windDepth)
  const cube=models.cube,stoneGeo=new T.IcosahedronGeometry(1,1),leafGeo=new T.IcosahedronGeometry(1,1),smallLeafGeo=new T.PlaneGeometry(.3,.13),crystalGeo=new T.CylinderGeometry(0,.17,.8,6)
  geometries.push(stoneGeo,leafGeo,smallLeafGeo,crystalGeo)
  function mesh(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
  function box(parent,x,y,z,w,h,d,material){return mesh(parent,cube,material,x,y,z,w,h,d)}
  const random=i=>{const n=Math.sin(i*127.1+71.7)*43758.5453;return n-Math.floor(n)}
  // Broad ground with an actual depressed creek bed and varied mossy faces.
  const groundGeo=new T.PlaneGeometry(40,38,72,72);groundGeo.rotateX(-Math.PI/2)
  groundGeo.vertices.forEach(v=>{v.z+=14;const bank=Math.abs(v.x-creekX(v.z));v.y=bank<1.75?-.48:-.06+Math.sin(v.x*.4)*Math.sin(v.z*.25)*.035})
  const groundColors=groundGeo.vertices.map(v=>{const river=Math.abs(v.x-creekX(v.z))<2.2;return new T.Color(river?0xb7a777:0x698144).convertSRGBToLinear().multiplyScalar(.94+Math.sin(v.x*.7)*Math.cos(v.z*.45)*.13)})
  groundGeo.faces.forEach(f=>{f.vertexColors=[groundColors[f.a],groundColors[f.b],groundColors[f.c]]})
  groundGeo.computeVertexNormals();const groundMat=new T.MeshStandardMaterial({vertexColors:T.VertexColors,roughness:1});materials.push(groundMat);geometries.push(groundGeo)
  mesh(root,groundGeo,groundMat,0,0,0).castShadow=false
  box(staticParts,3.6,-.52,14,10,.16,36,earth)
  // Meandering translucent water; both geometry and specular normals move slowly.
  const waterGeo=new T.PlaneBufferGeometry(3.35,34,12,92);waterGeo.rotateX(-Math.PI/2)
  const positions=waterGeo.attributes.position.array,original=new Float32Array(positions)
  for(let i=0;i<positions.length;i+=3){positions[i+2]+=14;positions[i]+=creekX(positions[i+2]);positions[i+1]=-.16}
  original.set(positions)
  const waterMat=new T.MeshPhongMaterial({color:new T.Color(0x559c91).convertSRGBToLinear(),specular:0xd3f5e3,shininess:110,transparent:true,opacity:.68,reflectivity:.65,side:T.DoubleSide,depthWrite:false})
  const waterUniform={value:0}
  waterMat.onBeforeCompile=shader=>{
    shader.uniforms.natureTime=waterUniform
    shader.vertexShader='varying vec3 creekPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncreekPosition=position;')
    shader.fragmentShader='uniform float natureTime; varying vec3 creekPosition;\n'+shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(normal+vec3(sin(creekPosition.z*4.0-natureTime*.7)*.07,cos(creekPosition.x*5.0+creekPosition.z*2.0-natureTime*.4)*.055,0.0));').replace('#include <color_fragment>','#include <color_fragment>\nfloat streak=pow(max(0.0,sin(creekPosition.x*7.0+sin(creekPosition.z*.8-natureTime*.18)*1.2)),28.0);diffuseColor.rgb+=vec3(.12,.15,.10)*streak;')
  }
  materials.push(waterMat);geometries.push(waterGeo)
  const water=mesh(root,waterGeo,waterMat,0,0,0);water.castShadow=false;water.renderOrder=1;waters.push({geometry:waterGeo,original})
  for(let i=0;i<64;i++){const z=random(i+30)*30,x=creekX(z)+(random(i+400)>.5?1:-1)*(1.9+random(i)*.5);const m=mesh(staticParts,stoneGeo,i%3?rock:rockLight,x,-.05,z,.12+random(i+20)*.28,.09+random(i+50)*.15,.14+random(i+90)*.2);m.rotation.y=random(i+66)*6.28}
  const bridgeX=creekX(9)
  for(let i=0;i<19;i++)box(staticParts,bridgeX-3.2+i*.36,.07,9,.34,.16,2,wood)
  for(const z of [8.04,9.96]){box(staticParts,bridgeX,.64,z,6.9,.09,.1,bark);for(const x of [-3.3,0,3.3])box(staticParts,bridgeX+x,.4,z,.12,.92,.12,wood)}
  // Gentle trail of flat stepping stones from the house to the cavern.
  for(let i=0;i<35;i++){const z=1.1+i*.68,x=-Math.min(9.5,z*.46)+Math.sin(i*.6)*.35;const m=mesh(staticParts,stoneGeo,rockLight,x,-.025,z,.36,.055,.29);m.rotation.y=random(i+200)*4}
  const treePositions=trees
  for(let i=0;i<treePositions.length;i++){
    const [x,z]=treePositions[i],h=2.7+random(i+30)*1.9
    const trunk=box(staticParts,x,h*.45,z,.25,h,.28,bark);trunk.rotation.z=(random(i+80)-.5)*.12
    for(let j=0;j<3;j++){
      const pivot=new T.Group();pivot.position.set(x,h*.66+j*.38,z);root.add(pivot)
      for(let k=0;k<3;k++)mesh(pivot,leafGeo,leafMats[(i+j+k)%4],(random(i*31+j*11+k)-.5)*1.6,j*.12,(random(i*19+j*5+k+50)-.5)*1.6,1.15+j*.12,.65+j*.06,1.04)
      for(let k=0;k<24;k++){const a=k/24*Math.PI*2,leaf=mesh(pivot,smallLeafGeo,leafMats[(i+j+k)%4],Math.cos(a)*(1.2+random(i+k)*.5),Math.sin(k*2)*.5+j*.12,Math.sin(a)*(1.1+random(i+k+20)*.5));leaf.rotation.set(random(k+3)*2,random(k+50)*6,a*.3)}
      models.bake(pivot);pivot.traverse(m=>{if(m.isMesh)m.customDepthMaterial=windDepth});leaves.push({pivot,phase:i*1.6+j,amplitude:.012+j*.009})
    }
  }
  // Fine grass and wildflowers are batched once, with no per-blade draw calls.
  const meadow=new T.Group();root.add(meadow)
  for(let i=0;i<480;i++){
    const x=random(i+800)*29-14.5,z=random(i+1600)*28
    if(Math.abs(x-creekX(z))<2.15||(x< -6.5&&z>14)||Math.abs(x+z*.46)<.6)continue
    const h=.10+random(i+90)*.2
    const blade=box(meadow,x,h/2-.025,z,.025,h,.05,leafMats[i%4]);blade.rotation.z=(random(i+11)-.5)*.8
    if(i%9===0){box(meadow,x,h,z,.13,.045,.13,i%2?petal:pink);box(meadow,x,h+.02,z,.04,.02,.04,petal)}
  }
  models.bake(meadow)
  // Low hills provide a horizon without loading landscape images.
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2,x=Math.cos(a)*31,z=14+Math.sin(a)*33;mesh(staticParts,stoneGeo,i%2?grass:leafMats[0],x,-1.6,z,8+random(i)*5,4+random(i+10)*7,8+random(i+20)*7)}
  // A roofed, open-front mine, with faceted veins along the walkable sides.
  box(staticParts,-14.1,1.65,21.1,1.2,3.5,13,rock);box(staticParts,-6.25,1.65,21.1,1.1,3.5,13,rock)
  box(staticParts,-10.2,1.65,27.4,8.9,3.5,1.1,rock);box(staticParts,-10.2,3.5,21.1,8.9,.65,13.7,rock)
  for(const x of [-12.9,-7.5])box(staticParts,x,1.35,14.9,1.8,2.8,1.1,rockLight)
  for(let i=0;i<5;i++)mesh(staticParts,stoneGeo,rockLight,-14+i*1.9,3.4,15.1,1.7,.8,1.5)
  for(const z of [15.2,19.5,24]){for(const x of [-13,-7.4])box(staticParts,x,1.35,z,.16,2.7,.18,bark);box(staticParts,-10.2,2.75,z,5.8,.18,.2,wood)}
  box(staticParts,-10.2,-.025,21,7.1,.08,12,rock)
  const amber=mat(0xffc475,.4);amber.emissive=new T.Color(0xf0a148);amber.emissiveIntensity=.85
  for(const [x,z]of [[-12.9,16.4],[-7.45,21],[-12.9,25.5]]){box(staticParts,x,1.7,z,.14,.38,.14,bark);mesh(staticParts,stoneGeo,amber,x,1.95,z,.1,.16,.1);const light=new T.PointLight(0xffc778,3.5,8,1.7);light.position.set(x,2,z);root.add(light)}
  for(const node of nodes){
    const g=new T.Group();g.position.set(node.x,0,node.y);g.userData.natureNode=node.id;root.add(g)
    if(node.material==='wood'){
      box(g,0,.25,0,1.12,.5,.54,bark);box(g,.575,.25,0,.015,.36,.39,wood)
      box(g,.59,.25,0,.015,.12,.13,mat(0xcfac78))
    }else if(node.material==='sand')box(g,0,-.01,0,.95,.06,.85,mat(0xd7c294))
    else{
      mesh(g,stoneGeo,rock,0,.3,0,.64,.53,.57)
      const mineral=mat(parseInt(node.color.slice(1),16),node.tier===2?.22:.38,node.material==='silver'?.65:.15)
      if(['amethyst','fluorite','quartz'].includes(node.material)){
        mineral.emissive=new T.Color(parseInt(node.color.slice(1),16));mineral.emissiveIntensity=.12
        for(let k=0;k<5;k++){const c=mesh(g,crystalGeo,mineral,(k-2)*.16,.57+(k%2)*.13,Math.sin(k)*.16,.7,1+(k%3)*.24,.7);c.rotation.z=(k-2)*.15}
      }else for(let k=0;k<7;k++)mesh(g,cube,mineral,(random(k+node.y)-.5)*.72,.44+random(k+60)*.3,(random(k+20)-.5)*.6,.14,.11,.13)
    }
    models.bake(g);oreMeshes.push(g)
  }
  // A little workshop. Crafted objects appear here and remain after re-entry.
  for(const x of [-6.4,-4.6])for(const z of [5.12,5.88])box(staticParts,x,.45,z,.14,.9,.14,bark)
  box(staticParts,-5.5,.95,5.5,2.5,.2,1.15,wood)
  for(let i=0;i<6;i++)box(staticParts,-6.5+i*.4,1.065,5.5,.025,.015,1.1,bark)
  box(staticParts,-5.4,1.14,5.5,.3,.13,.18,rockLight)
  box(staticParts,-6.8,.44,6.3,.65,.9,.65,rock);box(staticParts,-6.8,.46,5.965,.4,.36,.015,bark)
  const reflection=createReflections(T,scene,renderer,root.position.z+6.145)
  function pedestal(id,x){const group=new T.Group();root.add(group);box(staticParts,x,.3,6.2,1,.6,.8,wood);displays[id]=group;return group}
  const mirror=pedestal('mirror',-2)
  const silverFrame=mat(0xb4bdb5,.23,.7)
  for(const x of [-2.62,-1.38])box(mirror,x,1.53,6.22,.08,1.85,.12,silverFrame)
  for(const y of [.645,2.415])box(mirror,-2,y,6.22,1.32,.08,.12,silverFrame)
  reflection.add(mirror,-2,1.53,1.16,1.68)
  const white=pedestal('white_glass',-3.6),glassMat=new T.MeshPhysicalMaterial({color:0xe6f0e8,roughness:.12,metalness:.1,transparent:true,opacity:.7,reflectivity:1,clearcoat:1,clearcoatRoughness:.08,side:T.DoubleSide})
  materials.push(glassMat);box(white,-3.6,1.52,6.2,1.15,1.8,.08,glassMat).castShadow=false
  for(const x of [-4.22,-2.98])box(white,x,1.52,6.2,.05,1.9,.13,wood)
  const clear=pedestal('glass',-5),clearMat=new T.MeshPhongMaterial({color:0xbfd8d1,transparent:true,opacity:.27,shininess:160,specular:0xffffff,reflectivity:.9,side:T.DoubleSide})
  materials.push(clearMat);box(clear,-5,1.3,6.2,.9,1.25,.07,clearMat).castShadow=false
  const crystals=pedestal('crystal',-.4),crystalMat=mat(0xa88bc6,.16,.2)
  for(let i=0;i<5;i++)mesh(crystals,crystalGeo,crystalMat,-.7+i*.14,.98+(i%2)*.12,6.2,.7,1.1+(i%3)*.2,.7)
  const lantern=new T.Group();root.add(lantern);displays.lantern=lantern
  box(lantern,-9.2,1.1,14.6,.15,2.2,.15,bark);box(lantern,-9.2,2.15,14.6,.52,.12,.52,wood);box(lantern,-9.2,1.86,14.6,.34,.45,.34,amber)
  const lamp=new T.PointLight(0xffd092,0,9,2);lamp.position.set(-9.2,1.9,14.6);root.add(lamp)
  models.bake(staticParts)
  const probe=new T.CubeCamera(.1,130,128,{format:T.RGBFormat,minFilter:T.LinearMipMapLinearFilter,magFilter:T.LinearFilter});probe.position.copy(root.position).add(new T.Vector3(-3,2,5));scene.add(probe)
  function captureEnvironment(){
    if(envReady)return
    const visible=Object.values(displays).map(g=>g.visible);Object.values(displays).forEach(g=>g.visible=false);water.visible=false
    const shadow=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false
    try{probe.update(renderer,scene);envReady=true}
    finally{renderer.shadowMap.autoUpdate=shadow;Object.values(displays).forEach((g,i)=>g.visible=visible[i]);water.visible=true}
    for(const m of [glassMat,clearMat,waterMat]){m.envMap=probe.renderTarget.texture;m.needsUpdate=true}
  }
  function setInventory(inventory){Object.entries(displays).forEach(([id,g])=>g.visible=!!inventory[id]);lamp.intensity=inventory.lantern?1.8:0}
  setInventory({})
  return {root,setInventory,setExploring(value){exploring=value},
    update(dt,camera,avatar,hand){time+=dt;waterUniform.value=time;leafTime.value=time;wind=Math.sin(time*.7)*.025;flow=time*.18
      for(const leaf of leaves){leaf.pivot.rotation.z=Math.sin(time*.75+leaf.phase)*leaf.amplitude;leaf.pivot.rotation.x=Math.sin(time*.53+leaf.phase)*leaf.amplitude*.5}
      for(const w of waters){const p=w.geometry.attributes.position.array;for(let i=0;i<p.length;i+=3)p[i+1]=w.original[i+1]+Math.sin(p[i]*2.1+p[i+2]*1.7-time*.7)*.014+Math.sin(p[i+2]*3.6-time*.5)*.009;w.geometry.attributes.position.needsUpdate=true;w.geometry.computeVertexNormals()}
      if(root.visible){captureEnvironment();reflection.update(camera,avatar,hand,dt,exploring)}
    },
    stats(){return {time,wind,flow,waterSpeed:.18,treeCrowns:leaves.length,region:exploring?'nature':'home',displays:Object.keys(displays).filter(id=>displays[id].visible),reflections:reflection.stats()}},
    dispose(){reflection.dispose();probe.renderTarget.dispose();scene.remove(probe,root);const all=new Set(geometries);root.traverse(m=>{if(m.geometry&&m.geometry!==cube)all.add(m.geometry)});all.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}
  }
}
module.exports={createNatureWorld}
