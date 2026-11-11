const { createBuilding } = require('./home-building')
const { buildExtraFurniture } = require('./home-furniture-extra')
// Small, editable oak-and-voxel models. All dimensions share the placement footprint.
function createModels(T, options = {}) {
  const materials = new Map(), cube = new T.BoxGeometry(1,1,1)
  const C = { oak:0xb98751, edge:0x805435, light:0xe3bd86, cream:0xf6e8cb, green:0x81976c, dark:0x34483c, leaf:0x658b48, clay:0xba7956, blue:0x8eafb3 }
  function material(color) {
    if(!materials.has(color)){
      const tint=new T.Color(color);if(options.linearColors)tint.convertSRGBToLinear()
      materials.set(color,options.physical?new T.MeshStandardMaterial({color:tint,roughness:.82,metalness:0}):new T.MeshLambertMaterial({color:tint}))
    }
    return materials.get(color)
  }
  function box(g,x,y,z,w,h,d,color) {
    const m=new T.Mesh(cube,material(color));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;g.add(m);return m
  }
  function cylinder(g,x,y,z,top,bottom,height,color,sides=12) {
    const m=new T.Mesh(new T.CylinderGeometry(top,bottom,height,sides),material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m
  }
  function legs(g,w,d,h=.38) {
    for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])box(g,x,h/2,z,.1,h,.1,C.edge)
  }
  // Merge static parts by material; keeps the little house inexpensive on phones.
  function bake(g) {
    g.updateMatrixWorld(true);const batches=new Map(), geometries=new Set(), inverse=new T.Matrix4().getInverse(g.matrixWorld)
    g.traverse(m=>{if(!m.isMesh)return;let b=batches.get(m.material);if(!b){b=new T.Geometry();batches.set(m.material,b)}
      const matrix=new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld);b.merge(m.geometry,matrix);if(m.geometry!==cube)geometries.add(m.geometry)
    })
    while(g.children.length)g.remove(g.children[0])
    batches.forEach((geometry,mat)=>{const m=new T.Mesh(new T.BufferGeometry().fromGeometry(geometry),mat);m.castShadow=true;m.receiveShadow=true;g.add(m);geometry.dispose()})
    geometries.forEach(geo=>geo.dispose());return g
  }
  function furniture(id) {
    const g=new T.Group()
    if(id==='chair') {
      legs(g,.72,.72,.42);box(g,0,.46,0,.78,.13,.76,C.light);box(g,0,.77,-.31,.78,.56,.12,C.oak)
      box(g,0,.83,-.235,.56,.2,.03,C.light);box(g,0,.54,.03,.57,.05,.55,C.green)
    } else if(id==='sofa') {
      legs(g,1.7,.78,.18);box(g,0,.29,0,1.78,.3,.78,C.oak)
      box(g,0,.64,-.33,1.84,.54,.18,C.cream)
      for(const x of [-.83,.83])box(g,x,.53,0,.18,.42,.84,C.cream)
      for(const x of [-.39,.39]){box(g,x,.47,.06,.72,.18,.65,0xe6d9b6);box(g,x,.7,-.17,.64,.32,.2,C.cream)}
      const cushion=box(g,-.5,.68,.02,.29,.29,.17,C.green);cushion.rotation.z=.15
      box(g,.51,.64,.14,.31,.06,.4,0xc79a63)
    } else if(id==='bed') {
      legs(g,.8,1.8,.23);box(g,0,.31,0,.86,.2,1.86,C.oak);box(g,0,.55,-.85,.86,.88,.15,C.light)
      box(g,0,.46,0,.8,.22,1.7,0xfaf3df);box(g,0,.6,.3,.81,.16,1.1,C.green)
      for(const x of [-.25,0,.25])box(g,x,.685,.3,.07,.014,1.1,0xa8b48c)
      box(g,0,.61,-.59,.6,.15,.36,C.cream)
    } else if(id==='tv') {
      legs(g,.8,.68,.28);box(g,0,.4,0,.84,.26,.7,C.oak);box(g,0,.56,0,.85,.07,.72,C.light)
      box(g,0,.72,-.1,.16,.26,.12,C.dark);box(g,0,.61,-.08,.45,.03,.24,C.dark)
      box(g,0,1.03,-.1,.86,.54,.09,0x334238);box(g,0,1.03,-.045,.76,.43,.01,0x98b5a1)
      box(g,.33,.795,-.04,.03,.02,.01,0xd4dd8a)
    } else if(id==='lamp') {
      cylinder(g,0,.06,0,.25,.28,.12,C.edge);box(g,0,.75,0,.055,1.4,.055,C.oak)
      cylinder(g,0,1.36,0,.22,.37,.43,0xf3dca9,8);cylinder(g,0,1.13,0,.26,.26,.03,0xffefbd,8)
    } else if(id==='plant') {
      cylinder(g,0,.22,0,.28,.2,.4,C.clay,8);cylinder(g,0,.43,0,.29,.29,.07,0xd69b6d,8)
      box(g,0,.7,0,.07,.5,.07,C.edge)
      for(const [x,y,z,s] of [[0,.96,0,.4],[-.22,.8,.03,.3],[.21,.82,-.09,.33],[.06,1.16,.03,.3],[-.1,.94,.2,.25]])box(g,x,y,z,s,s*.75,s,x>0?0x789c53:0x608347)
    } else if(id==='desk'||id==='table') {
      legs(g,1.8,.8,.68);box(g,0,.73,0,1.84,.13,.84,C.light);box(g,0,.63,0,1.65,.1,.68,C.oak)
      if(id==='desk'){
        box(g,.55,.53,0,.48,.28,.68,C.oak);box(g,.55,.54,.35,.44,.19,.03,C.light);box(g,.55,.55,.38,.12,.04,.04,C.edge)
        box(g,-.29,.807,0,.55,.015,.4,0xfff6dc);box(g,-.3,.82,.03,.36,.015,.015,C.clay)
        cylinder(g,.46,.9,-.15,.075,.06,.22,C.green,8)
        for(let i=0;i<3;i++)box(g,.43+i*.027,1.02,-.15,.015,.18,.015,[C.oak,C.clay,C.blue][i])
      }else{
        for(const x of [-.52,.52]){cylinder(g,x,.81,0,.17,.17,.025,0xf9f0d9);cylinder(g,x,.9,-.1,.07,.06,.16,C.cream)}
        cylinder(g,0,.9,0,.09,.06,.2,C.clay);box(g,0,1.06,0,.17,.13,.16,C.leaf)
      }
    } else if(id==='bookshelf') {
      for(const x of [-.38,.38])box(g,x,.8,0,.09,1.6,.76,C.oak)
      box(g,0,.8,-.35,.78,1.6,.06,C.edge)
      for(const y of [.1,.58,1.06,1.57])box(g,0,y,0,.84,.09,.8,C.light)
      const colors=[C.green,C.clay,C.blue,0xe1c48b,0xb5bb91]
      for(let row=0;row<3;row++)for(let col=0;col<5;col++){
        const h=.25+((row+col)%3)*.045,x=-.27+col*.125,y=.15+row*.48+h/2
        box(g,x,y,-.04,.09,h,.38,colors[(row+col)%5]);box(g,x,y+.05,.155,.06,.018,.012,C.cream)
      }
    } else if(id==='wardrobe') {
      box(g,0,.85,0,.86,1.7,.84,C.oak);box(g,0,1.73,0,.92,.1,.9,C.light)
      for(const x of [-.21,.21]){box(g,x,.87,.43,.39,1.55,.04,C.light);box(g,x,.88,.46,.29,1.35,.015,0xd3a56d)}
      for(const x of [-.06,.06])box(g,x,.86,.5,.035,.17,.04,C.edge)
    } else if(id==='fridge') {
      box(g,0,.76,0,.8,1.5,.8,0x9cab8d);box(g,0,.74,.42,.78,1.41,.06,0xc0cfac)
      box(g,0,1.05,.46,.76,.035,.018,0x82967a)
      box(g,-.27,1.23,.49,.035,.22,.06,C.cream);box(g,-.27,.84,.49,.035,.22,.06,C.cream)
      box(g,.18,.82,.47,.18,.2,.01,0xf6e3b8);box(g,.18,.9,.48,.035,.035,.015,C.clay)
    } else if(id==='rug') {
      cylinder(g,0,.018,0,.47,.47,.035,0xd5b87a,24);cylinder(g,0,.038,0,.39,.39,.008,0xe7d4a4,24);cylinder(g,0,.044,0,.32,.32,.006,0xb3b88a,24)
    }
    if(!g.children.length)buildExtraFurniture(id,g,{box,cylinder},T)
    g.userData.furniture=id
    return bake(g)
  }
  function house(plan) { return createBuilding(T,{box,bake},plan) }
  function actor(outfit='everyday') {
    const g=new T.Group(), body=new T.Group(), limbs={};g.add(body)
    const shirt={everyday:0xd3ab63,builder:0xdaaf43,gardener:0x789362,explorer:0x79999a}[outfit]||0xd3ab63
    const skin=0xf2c795, hair=0x65492f
    box(body,0,.58,0,.34,.38,.24,shirt);box(body,0,.36,0,.32,.12,.23,0x6a8074)
    box(body,0,.94,0,.43,.43,.4,skin);box(body,0,1.15,-.02,.46,.13,.43,hair)
    box(body,0,1.04,-.17,.44,.2,.08,hair);box(body,-.19,1.04,.015,.09,.18,.35,hair)
    for(const x of [-.1,.1])box(body,x,.96,.204,.042,.055,.015,0x39392d)
    box(body,0,.85,.206,.06,.018,.015,0xb77c5a)
    for(const side of [-1,1]){
      const arm=new T.Group();arm.position.set(side*.23,.72,0);body.add(arm)
      box(arm,0,-.09,0,.13,.21,.2,shirt);box(arm,0,-.24,0,.12,.15,.16,skin)
      const leg=new T.Group();leg.position.set(side*.1,.32,0);body.add(leg)
      box(leg,0,-.12,0,.13,.24,.16,0x6c7f73);box(leg,0,-.27,.035,.16,.09,.23,0x69513a)
      limbs[side===1?'armR':'armL']=arm;limbs[side===1?'legR':'legL']=leg
    }
    if(outfit==='builder'){box(body,0,1.23,0,.5,.14,.46,0xeac150);box(body,0,1.17,.07,.55,.05,.56,0xeac150)}
    if(outfit==='gardener'){box(body,0,1.23,0,.46,.12,.42,0xbda16d);box(body,0,1.17,0,.61,.04,.56,0xd5bb80)}
    if(outfit==='explorer'){box(body,0,.64,-.2,.28,.32,.13,C.oak);box(body,0,1.21,0,.45,.12,.42,C.green)}
    g.userData={body,limbs};return g
  }
  function dispose() {cube.dispose();materials.forEach(m=>m.dispose())}
  return {house,furniture,actor,box,bake,dispose,cube}
}
module.exports={createModels}
