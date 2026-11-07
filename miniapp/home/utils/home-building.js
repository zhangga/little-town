// Original voxel architecture: oak planks, stone blocks, stepped roofs and hinged doors.
function createBuilding(T, kit, plan = {}) {
  const {box,bake}=kit, size=plan.size||7,level=plan.level||1,mid=size/2
  const high=level>=4?3.6:2.8,doorWidth=level>=4?2:1,porchWidth=Math.min(size-1,doorWidth+4)
  const oak=0xaf7e46,light=0xd8ae70,dark=0x71502e,cream=0xe4dac2,stone=0x9d9d86,glass=0xa5c8c3
  const groups={};for(const id of ['base','back','left','right','front','roof','porch','door'])groups[id]=new T.Group()
  const {base,back,left,right,front,roof,porch,door}=groups
  box(base,mid,-.24,mid,size+.3,.48,size+.3,level>=2?stone:dark)
  box(base,mid,-.035,mid,size+.08,.09,size+.08,oak)
  const woods=[0xd9b37c,0xe0bc87,0xd6af75,0xe2bd86,0xdab780]
  for(let row=0;row<size*2;row++)for(let x=row%2?-.7:0;x<size;x+=1.4){
    const start=Math.max(0,x),end=Math.min(size,x+1.4)
    box(base,(start+end)/2,.005,row*.5+.25,end-start-.015,.025,.485,woods[(row+Math.floor(x*3)+9)%woods.length])
  }
  function window(g,x,z,width,rotation=0){
    const w=new T.Group();g.add(w);w.position.set(x,0,z);w.rotation.y=rotation
    box(w,0,high*.57,0,width,high*.54,.14,dark)
    box(w,0,high*.57,.085,width-.18,high*.54-.18,.045,glass)
    // Soft landscape colours remain a backdrop behind the window mullions.
    box(w,0,high*.4,.115,width-.2,high*.19,.015,0xa3b685)
    for(let i=0;i<Math.floor(width/.45);i++)box(w,-width/2+.32+i*.45,high*.42,.13,.31,.46+(i%3)*.13,.012,[0x809863,0x8aa876,0x70915c][i%3])
    for(const px of [-width/2,0,width/2])box(w,px,high*.57,.17,.09,high*.56,.2,oak)
    for(const py of [high*.29,high*.57,high*.85])box(w,0,py,.17,width+.13,.09,.2,oak)
    box(w,0,high*.28,.22,width+.35,.11,.48,light)
  }
  function wall(g,length,position,rotation,hasDoor=false){
    g.position.set(position[0],0,position[1]);g.rotation.y=rotation
    if(hasDoor){
      const side=(length-doorWidth)/2
      box(g,-doorWidth/2-side/2,high/2,0,side,high,.2,cream)
      box(g,doorWidth/2+side/2,high/2,0,side,high,.2,cream)
      box(g,0,(high+2.12)/2,0,doorWidth,high-2.12,.2,cream)
    }else box(g,0,high/2,0,length,high,.2,cream)
    const posts=Math.max(2,Math.round(length/3))
    for(let i=0;i<=posts;i++){
      const x=-length/2+i*length/posts
      if(hasDoor&&Math.abs(x)<doorWidth/2+.2)continue
      box(g,x,high/2,0,.2,high+.15,.38,oak)
      if(level>=3)for(let row=0;row<3;row++)box(g,x,.17+row*.27,.14,.32,.25,.34,stone)
    }
    box(g,0,high+.04,0,length+.3,.18,.35,dark)
    if(!hasDoor){box(g,0,.28,.14,length,.55,.12,level>=3?0xb4b29b:0xc7ae86);box(g,0,.28,-.14,length,.55,.12,level>=3?0xb4b29b:0xc7ae86)}
    const count=Math.max(1,Math.floor(length/3))
    for(let i=0;i<count;i++){
      const x=-length/2+(i+.5)*length/count,w=Math.min(2.2,length/count-.6)
      if(hasDoor&&Math.abs(x)<doorWidth/2+w/2+.25)continue
      window(g,x,.14,w)
      window(g,x,-.14,w,Math.PI)
    }
  }
  wall(back,size,[mid,0],0)
  wall(left,size,[0,mid],Math.PI/2)
  wall(right,size,[size,mid],-Math.PI/2)
  wall(front,size,[mid,size],Math.PI,true)
  // The visible low perimeter remains when the front wall is cut away indoors.
  box(base,size,.1,mid,.16,.2,size,oak)
  for(const side of [-1,1])box(base,mid+side*(size+doorWidth)/4,.1,size,(size-doorWidth)/2,.2,.16,oak)
  box(porch,mid,-.12,size+.7,porchWidth,.23,1.4,level>=2?stone:light)
  for(let i=0;i<porchWidth;i++)box(porch,mid-porchWidth/2+i+.5,.007,size+.7,.97,.025,1.38,level>=2?0xc8c2a4:light)
  box(base,mid,.025,size-.3,doorWidth-.1,.025,.4,0x8c9b6e)
  // Door: two blocks high, four square upper openings, oak lower panels and latch.
  const leaves=[]
  for(let index=0;index<doorWidth;index++){
    const pivot=new T.Group(),leaf=new T.Group(),reverse=index===1
    const sign=reverse?-1:1
    pivot.position.set(mid+(reverse?1:-doorWidth/2),0,size+.02)
    pivot.add(leaf);door.add(pivot)
    const x=v=>v*sign
    box(leaf,x(.5),.51,0,.96,.98,.13,oak)
    for(let col=0;col<4;col++)box(leaf,x(.14+col*.23),.51,.075,.19,.88,.018,[0xbc8c50,0xc79b5c,0xb18046,0xc19355][col])
    for(const px of [.05,.5,.95])box(leaf,x(px),1.5,0,.08,1,.13,oak)
    for(const py of [1.03,1.52,2.01])box(leaf,x(.5),py,0,.98,.09,.13,light)
    for(const py of [.1,.95])box(leaf,x(.5),py,.085,.91,.075,.028,light)
    for(const py of [.27,1.73])box(leaf,x(.065),py,.09,.08,.17,.055,0x514d39)
    box(leaf,x(.83),.94,.13,.09,.12,.08,0x53563d)
    bake(leaf);leaves.push({pivot,sign})
  }
  for(const x of [mid-doorWidth/2-.1,mid+doorWidth/2+.1])box(door,x,1.08,size,.16,2.2,.24,dark)
  box(door,mid,2.16,size,doorWidth+.35,.14,.28,dark)
  const doorMaterials=new Map()
  door.traverse(m=>{if(!m.isMesh)return;if(!doorMaterials.has(m.material)){const clone=m.material.clone();clone.transparent=true;doorMaterials.set(m.material,clone)}m.material=doorMaterials.get(m.material)})
  door.userData={furniture:'__door__',leaves,materials:Array.from(doorMaterials.values())}
  if(level<=3){
    const layers=Math.ceil(size/2)
    for(let i=0;i<layers;i++)box(roof,mid,high+.19+i*.24,mid,size+.75-i*.9,.26,size+.8,[0xac7042,0xb87d4c,0xc28a52][i%3])
    box(roof,mid,high+.19+layers*.24,mid,.7,.22,size+.85,dark)
  }else{
    // A tall glass atrium and four stepped pavilions make the final villa distinct.
    box(roof,mid,high+.12,mid,size+.65,.25,size+.65,light)
    box(roof,mid,high+.28,mid,size+.25,.12,size+.25,dark)
    const atriumWidth=size*.4,atriumDepth=size*.54
    box(roof,mid,high+1.42,mid,atriumWidth,2.24,atriumDepth,glass)
    for(let x=-atriumWidth/2;x<=atriumWidth/2+.01;x+=atriumWidth/4){
      box(roof,mid+x,high+2.6,mid,.14,.15,atriumDepth+.2,dark)
      for(const z of [-1,1])box(roof,mid+x,high+1.45,mid+z*atriumDepth/2,.14,2.3,.14,oak)
    }
    for(const z of [-atriumDepth/2,0,atriumDepth/2])box(roof,mid,high+2.6,mid+z,atriumWidth+.2,.15,.14,dark)
    const pavilion=size*.25
    for(const x of [pavilion/2,size-pavilion/2])for(const z of [pavilion/2,size-pavilion/2]){
      // Windowed roof pavilions give the large footprint a mansion silhouette.
      const tower=pavilion-.4
      box(roof,x,high+1.3,z,tower,2.2,tower,cream)
      for(const dx of [-1,1])for(const dz of [-1,1])box(roof,x+dx*tower/2,high+1.3,z+dz*tower/2,.2,2.3,.2,oak)
      for(let side=0;side<4;side++){
        const frame=new T.Group();roof.add(frame);frame.position.set(x,high+1.35,z);frame.rotation.y=side*Math.PI/2
        box(frame,0,0,tower/2+.02,tower*.65,1.35,.12,dark)
        box(frame,0,0,tower/2+.1,tower*.65-.2,1.15,.045,glass)
        box(frame,0,0,tower/2+.15,.09,1.35,.12,oak)
        box(frame,0,0,tower/2+.15,tower*.65,.09,.12,oak)
        box(frame,0,-.73,tower/2+.18,tower*.65+.2,.12,.36,light)
      }
      const layers=Math.ceil(pavilion/.7)
      for(let row=0;row<layers;row++)box(roof,x,high+2.5+row*.24,z,pavilion+.45-row*.65,.27,pavilion+.45,[0xac7042,0xb87d4c,0xc28a52][row%3])
      box(roof,x,high+2.55+layers*.24,z,.42,.18,pavilion+.55,dark)
    }
    for(const x of [mid-porchWidth/2+.2,mid+porchWidth/2-.2]){
      for(let row=0;row<7;row++)box(porch,x,row*.45+.22,size+1.08,.5,.43,.5,row%2?0xb1af99:stone)
      box(porch,x,3.24,size+1.08,.66,.16,.66,light)
    }
    box(roof,mid,3.4,size+.7,porchWidth+.5,.23,1.9,dark)
    for(let row=0;row<4;row++)box(roof,mid,3.56+row*.22,size+.7,porchWidth+.2-row*.75,.24,1.8,0xb87d4c)
  }
  for(const id of Object.keys(groups))if(id!=='door')bake(groups[id])
  return groups
}
module.exports={createBuilding}
