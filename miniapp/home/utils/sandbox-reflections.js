// Every placed mirror has a cheap environment reflection. At most two visible nearby
// mirrors get a live planar view; the render targets are reused when the player moves.
function mirrorFace(p) {
  const a = p.angle * Math.PI / 180, nx = Math.round(Math.sin(a)), nz = Math.round(Math.cos(a))
  return { x: p.x + .5 + nx * .505, y: p.y + .5, z: p.z + .5 + nz * .505, nx, nz, angle: a }
}
function createWorldReflections(T, scene, renderer) {
  const reflected = new T.PerspectiveCamera(), plane = new T.Plane(), clip = new T.Vector4(), q = new T.Vector4()
  const direction = new T.Vector3(), normal = new T.Vector3(), point = new T.Vector3(), frustum = new T.Frustum(), projection = new T.Matrix4()
  let clock = 1, updates = 0, lastViews = []
  const slots = [0, 1].map(() => {
    const target = new T.WebGLRenderTarget(384, 384, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBFormat })
    target.texture.generateMipmaps = false
    const matrix = new T.Matrix4()
    const material = new T.ShaderMaterial({
      uniforms: { reflection: { value: target.texture }, textureMatrix: { value: matrix } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 mirrorCoord; void main(){vec4 world=modelMatrix*vec4(position,1.);mirrorCoord=textureMatrix*world;gl_Position=projectionMatrix*viewMatrix*world;}',
      fragmentShader: 'uniform sampler2D reflection; varying vec4 mirrorCoord; void main(){gl_FragColor=vec4(mix(texture2DProj(reflection,mirrorCoord).rgb,vec3(.62,.74,.72),.025),1.);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}'
    })
    const mesh = new T.Mesh(new T.PlaneGeometry(.84, .84), material)
    mesh.visible = false; scene.add(mesh)
    return { target, matrix, material, mesh, id: '' }
  })
  function update(camera, mirrors, avatar, hidden, dt) {
    clock += dt
    camera.updateMatrixWorld(); camera.matrixWorldInverse.getInverse(camera.matrixWorld)
    frustum.setFromMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const visible = mirrors.map(p => ({ ...p, face: mirrorFace(p) })).filter(p => {
      const f = p.face; point.set(f.x, f.y, f.z)
      return (camera.position.x - f.x) * f.nx + (camera.position.z - f.z) * f.nz > .04 && camera.position.distanceTo(point) < 16 && frustum.intersectsSphere(new T.Sphere(point, .72))
    }).sort((a, b) => Math.hypot(a.face.x - camera.position.x, a.face.y - camera.position.y, a.face.z - camera.position.z) - Math.hypot(b.face.x - camera.position.x, b.face.y - camera.position.y, b.face.z - camera.position.z)).slice(0, 2)
    const changed = slots.some((slot, i) => slot.id !== (visible[i] ? [visible[i].x, visible[i].y, visible[i].z, visible[i].angle].join(',') : ''))
    if (!changed && clock < .15) return
    clock = 0; lastViews = []
    slots.forEach(slot => { slot.mesh.visible = false; slot.id = '' })
    const oldTarget = renderer.getRenderTarget(), shadow = renderer.shadowMap.autoUpdate, mapping = renderer.toneMapping, gamma = renderer.gammaOutput, avatarVisible = avatar.visible
    const visibility = hidden.map(object => object.visible)
    hidden.forEach(object => { object.visible = false }); avatar.visible = true
    renderer.shadowMap.autoUpdate = false; renderer.toneMapping = T.NoToneMapping; renderer.gammaOutput = false
    try {
      visible.forEach((p, i) => {
        const slot = slots[i], f = p.face
        slot.mesh.position.set(f.x, f.y, f.z); slot.mesh.rotation.y = f.angle
        normal.set(f.nx, 0, f.nz); point.set(f.x, f.y, f.z)
        reflected.copy(camera, false)
        const distance = normal.dot(camera.position.clone().sub(point))
        reflected.position.copy(camera.position).addScaledVector(normal, -2 * distance)
        camera.getWorldDirection(direction); direction.reflect(normal)
        reflected.up.copy(camera.up).reflect(normal); reflected.lookAt(direction.add(reflected.position)); reflected.updateMatrixWorld()
        reflected.matrixWorldInverse.getInverse(reflected.matrixWorld)
        plane.setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(reflected.matrixWorldInverse)
        clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
        const m = reflected.projectionMatrix.elements
        q.set((Math.sign(clip.x) + m[8]) / m[0], (Math.sign(clip.y) + m[9]) / m[5], -1, (1 + m[10]) / m[14])
        clip.multiplyScalar(2 / clip.dot(q)); m[2] = clip.x; m[6] = clip.y; m[10] = clip.z + 1 - .003; m[14] = clip.w
        slot.matrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(reflected.projectionMatrix).multiply(reflected.matrixWorldInverse)
        renderer.setRenderTarget(slot.target); renderer.clear(); renderer.render(scene, reflected)
        slot.id = [p.x, p.y, p.z, p.angle].join(','); updates++
        lastViews.push({ block: [p.x, p.y, p.z], angle: p.angle, eye: camera.position.toArray(), virtualEye: reflected.position.toArray(), actor: avatar.position.toArray() })
      })
    } finally {
      renderer.setRenderTarget(oldTarget); renderer.shadowMap.autoUpdate = shadow; renderer.toneMapping = mapping; renderer.gammaOutput = gamma; avatar.visible = avatarVisible
      hidden.forEach((object, i) => { object.visible = visibility[i] }); slots.forEach(slot => { slot.mesh.visible = !!slot.id })
    }
  }
  return { update, surfaces: slots.map(slot => slot.mesh), stats: () => ({ active: slots.filter(s => s.mesh.visible).length, updates, resolution: 384, lastViews }),
    dispose() { slots.forEach(slot => { scene.remove(slot.mesh); slot.mesh.geometry.dispose(); slot.material.dispose(); slot.target.dispose() }) }
  }
}
module.exports = { createWorldReflections, mirrorFace }
