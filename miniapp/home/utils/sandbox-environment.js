// Shared materials keep wind and water continuous across chunk and dimension boundaries.
function createEnvironment(T, renderer) {
  const time = { value: 0 }, linear = hex => new T.Color(hex).convertSRGBToLinear()
  // The scoped WeChat build still uses gammaOutput, despite exporting sRGBEncoding.
  if ('outputEncoding' in renderer) renderer.outputEncoding = T.sRGBEncoding
  else { renderer.gammaOutput = true; renderer.gammaFactor = 2.2 }
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .98
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap
  const materials = {
    solid: new T.MeshStandardMaterial({ vertexColors: T.VertexColors, roughness: .86 }),
    leaves: new T.MeshStandardMaterial({ vertexColors: T.VertexColors, roughness: .82 }),
    ore: new T.MeshStandardMaterial({ vertexColors: T.VertexColors, roughness: .32, metalness: .28 }),
    glow: new T.MeshStandardMaterial({ vertexColors: T.VertexColors, roughness: .36, emissive: linear(0x4e7b68), emissiveIntensity: .28 }),
    glass: new T.MeshPhysicalMaterial({ vertexColors: T.VertexColors, roughness: .08, metalness: .06, transparent: true, opacity: .26, depthWrite: false, reflectivity: 1, side: T.DoubleSide }),
    white_glass: new T.MeshPhysicalMaterial({ vertexColors: T.VertexColors, roughness: .14, metalness: .16, transparent: true, opacity: .72, depthWrite: false, reflectivity: 1, clearcoat: 1, clearcoatRoughness: .08, side: T.DoubleSide }),
    mirror: new T.MeshStandardMaterial({ color: linear(0xdde8e7), roughness: .035, metalness: 1 }),
    water: new T.MeshPhongMaterial({ color: linear(0x75b7af), specular: linear(0xdaf7ed), shininess: 120, transparent: true, opacity: .63, depthWrite: false, reflectivity: .65, side: T.DoubleSide })
  }
  const wind = `
    transformed.x += sin(position.x*.8 + position.z*.55 + worldTime*1.25) * .045
      + sin(position.y*4.1 + worldTime*2.2) * .018;
    transformed.z += sin(position.z*.9 + position.y*.6 + worldTime*.95) * .028;
  `
  function addWind(shader) {
    shader.uniforms.worldTime = time
    shader.vertexShader = 'uniform float worldTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + wind)
  }
  materials.leaves.onBeforeCompile = addWind
  const leafDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking })
  leafDepth.onBeforeCompile = addWind
  materials.water.onBeforeCompile = shader => {
    shader.uniforms.worldTime = time
    shader.vertexShader = 'uniform float worldTime; varying vec3 flowPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      flowPosition = position;
      transformed.y += step(.5, fract(position.y)) * (sin(position.z*1.9-worldTime*.45)*.012 + sin(position.x*2.4+position.z*.7-worldTime*.3)*.008);
    `)
    shader.fragmentShader = 'uniform float worldTime; varying vec3 flowPosition;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec3 ripple = vec3(sin(flowPosition.z*3.8-worldTime*.65)*.045, 0., cos(flowPosition.x*4.5+flowPosition.z*1.7-worldTime*.4)*.035);
        normal = normalize(normal + mat3(viewMatrix) * ripple);
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float drift = flowPosition.z - worldTime*.16;
        float ribbon = pow(max(0.,sin(flowPosition.x*7.+sin(drift*1.5)*1.3)),24.);
        float glint = pow(max(0.,sin(drift*8.+flowPosition.x*2.)),16.);
        diffuseColor.rgb += vec3(.07,.095,.08) * ribbon * (.35+.65*glint);
      `)
  }
  const probe = new T.CubeCamera(.1, 75, 128, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBFormat })
  probe.renderTarget.texture.generateMipmaps = false
  for (const id of ['glass', 'white_glass', 'mirror', 'water']) { materials[id].envMap = probe.renderTarget.texture; materials[id].needsUpdate = true }
  let probeClock = 10, captures = 0, capturedDimension = '', capturedRevision = -1
  const lastProbe = new T.Vector3(1000, 1000, 1000)
  function capture(scene, camera, world, ready, hidden) {
    if (!ready || probeClock < 2.5) return
    if (world.dimension === capturedDimension && world.terrainRevision === capturedRevision && lastProbe.distanceTo(camera.position) < 7) return
    const visibility = hidden.map(object => object.visible), shadow = renderer.shadowMap.autoUpdate, mapping = renderer.toneMapping, gamma = renderer.gammaOutput
    hidden.forEach(object => { object.visible = false })
    renderer.shadowMap.autoUpdate = false; renderer.toneMapping = T.NoToneMapping; renderer.gammaOutput = false
    probe.position.copy(camera.position)
    try { probe.update(renderer, scene); captures++; lastProbe.copy(camera.position); capturedDimension = world.dimension; capturedRevision = world.terrainRevision; probeClock = 0 }
    finally { renderer.shadowMap.autoUpdate = shadow; renderer.toneMapping = mapping; renderer.gammaOutput = gamma; hidden.forEach((object, i) => { object.visible = visibility[i] }) }
  }
  return {
    materials, leafDepth, capture,
    update(dt) { time.value += dt; probeClock += dt },
    stats: () => ({ time: time.value, flowSpeed: .16, captures, probeResolution: 128, shadows: renderer.shadowMap.enabled }),
    dispose() { Object.values(materials).forEach(m => m.dispose()); leafDepth.dispose(); probe.renderTarget.dispose() }
  }
}
module.exports = { createEnvironment }
