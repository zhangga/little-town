// All display mirrors share one plane and one throttled reflection pass.
function createReflections(T,scene,renderer,planeZ) {
  const target=new T.WebGLRenderTarget(384,384,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,format:T.RGBFormat})
  target.texture.generateMipmaps=false
  const reflected=new T.PerspectiveCamera(),matrix=new T.Matrix4(),normal=new T.Vector3(0,0,-1),point=new T.Vector3(0,0,planeZ)
  const plane=new T.Plane(),clip=new T.Vector4(),q=new T.Vector4(),direction=new T.Vector3(),faces=[]
  let elapsed=1,updates=0,lastView=null
  const material=new T.ShaderMaterial({
    uniforms:{reflection:{value:target.texture},textureMatrix:{value:matrix}},
    vertexShader:'uniform mat4 textureMatrix; varying vec4 mirrorCoord; void main(){vec4 world=modelMatrix*vec4(position,1.0);mirrorCoord=textureMatrix*world;gl_Position=projectionMatrix*viewMatrix*world;}',
    fragmentShader:'uniform sampler2D reflection; varying vec4 mirrorCoord; void main(){vec3 color=texture2DProj(reflection,mirrorCoord).rgb;gl_FragColor=vec4(mix(color,vec3(0.72,0.85,0.84),0.055),1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}',side:T.FrontSide
  })
  function add(parent,x,y,width,height) {
    const face=new T.Mesh(new T.PlaneGeometry(width,height),material)
    face.position.set(x,y,6.145);face.rotation.y=Math.PI;parent.add(face);faces.push(face);return face
  }
  function update(camera,avatar,hand,dt,enabled) {
    elapsed+=dt
    if(!enabled||elapsed<.12||camera.position.z>=planeZ-.03||Math.abs(camera.position.z-planeZ)>20)return
    if(!faces.some(f=>f.visible&&f.parent.visible))return
    elapsed=0
    reflected.copy(camera,false);reflected.position.copy(camera.position);reflected.position.z=2*planeZ-camera.position.z
    camera.getWorldDirection(direction);direction.z=-direction.z
    reflected.up.copy(camera.up);reflected.up.z=-reflected.up.z;reflected.lookAt(direction.add(reflected.position));reflected.updateMatrixWorld()
    reflected.matrixWorldInverse.getInverse(reflected.matrixWorld)
    // Clip everything on the viewer's side of the silver surface.
    plane.setFromNormalAndCoplanarPoint(normal,point).applyMatrix4(reflected.matrixWorldInverse)
    clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant)
    const projection=reflected.projectionMatrix.elements
    q.set((Math.sign(clip.x)+projection[8])/projection[0],(Math.sign(clip.y)+projection[9])/projection[5],-1,(1+projection[10])/projection[14])
    clip.multiplyScalar(2/clip.dot(q));projection[2]=clip.x;projection[6]=clip.y;projection[10]=clip.z+1-.003;projection[14]=clip.w
    matrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(reflected.projectionMatrix).multiply(reflected.matrixWorldInverse)
    const previous=renderer.getRenderTarget(),shadow=renderer.shadowMap.autoUpdate,avatarVisible=avatar.visible,handVisible=hand.visible
    const visibility=faces.map(f=>f.visible)
    faces.forEach(f=>f.visible=false);avatar.visible=true;hand.visible=false;renderer.shadowMap.autoUpdate=false
    try{renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,reflected);updates++;lastView={eye:camera.position.toArray(),virtualEye:reflected.position.toArray(),actor:avatar.position.toArray(),direction:camera.getWorldDirection(new T.Vector3()).toArray()}}
    finally{renderer.setRenderTarget(previous);renderer.shadowMap.autoUpdate=shadow;avatar.visible=avatarVisible;hand.visible=handVisible;faces.forEach((f,i)=>f.visible=visibility[i])}
  }
  return {add,update,stats:()=>({updates,resolution:384,lastView}),dispose(){material.dispose();target.dispose()}}
}
module.exports={createReflections}
