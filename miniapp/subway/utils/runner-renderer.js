const { jumpHeight } = require('./runner')

function polygon(ctx, points, fill, stroke) {
  ctx.beginPath()
  points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))
  ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke() }
}

function box(ctx, x, y, w, h, fill, radius = 0) {
  ctx.fillStyle = fill
  if (!radius) { ctx.fillRect(x, y, w, h); return }
  const r = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.fill()
}

function oval(ctx, x, y, rx, ry, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry)
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.restore()
}

function project(width, height, lane, z) {
  const scale = 1 / (1 + Math.max(-3, z) / 20)
  return { x: width * (0.5 + (lane - 1) * 0.275 * scale), y: height * (0.29 + 0.59 * scale), scale }
}

function scenery(ctx, w, h, run) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.5)
  sky.addColorStop(0, '#b6d8cd'); sky.addColorStop(1, '#f5e8bc')
  box(ctx, 0, 0, w, h, sky)
  oval(ctx, w * 0.77, h * 0.12, w * 0.065, w * 0.065, '#ffedb4')
  for (let i = 0; i < 9; i++) {
    const x = i * w / 8 - w * 0.035
    const bh = h * (0.055 + ((i * 7) % 5) * 0.018)
    box(ctx, x, h * 0.3 - bh, w * 0.085, bh, i % 2 ? '#9ebdb0' : '#acc7b5', 2)
    box(ctx, x + w * 0.015, h * 0.3 - bh + 8, w * 0.016, 5, '#e2e3bd')
  }
  box(ctx, 0, h * 0.3, w, h * 0.7, '#bcbda6')
  polygon(ctx, [[w * 0.37, h * 0.29], [w * 0.63, h * 0.29], [w * 1.12, h], [-w * 0.12, h]], '#8e9c8b')
  // Parallel rails, cross ties and platform stripes all share the projection.
  for (let lane = 0; lane < 3; lane++) {
    const far = project(w, h, lane, 150), near = project(w, h, lane, -3)
    polygon(ctx, [[far.x - 8, far.y], [far.x + 8, far.y], [near.x + w * 0.13, h], [near.x - w * 0.13, h]], lane === 1 ? '#9aab98' : '#96a490')
    for (let i = 0; i < 30; i++) {
      const z = i * 6 - run.distance % 6
      if (z < -2) continue
      const p = project(w, h, lane, z)
      box(ctx, p.x - w * 0.09 * p.scale, p.y, w * 0.18 * p.scale, Math.max(1, 5 * p.scale), '#66776a')
    }
    for (const offset of [-0.072, 0.072]) {
      ctx.beginPath(); ctx.moveTo(far.x + w * offset * far.scale, far.y); ctx.lineTo(near.x + w * offset * near.scale, near.y)
      ctx.strokeStyle = '#d7d8bf'; ctx.lineWidth = w * 0.009; ctx.stroke()
      ctx.strokeStyle = '#455c54'; ctx.lineWidth = w * 0.003; ctx.stroke()
    }
  }
  polygon(ctx, [[0,h],[0,h * 0.38],[w * 0.36,h * 0.29],[w * 0.23,h * 0.52]], '#ded3aa')
  polygon(ctx, [[w,h],[w,h * 0.38],[w * 0.64,h * 0.29],[w * 0.77,h * 0.52]], '#d1c8a5')
  for (let i = 0; i < 9; i++) {
    const z = i * 18 + 4 - run.distance % 18
    if (z < 0) continue
    for (const side of [-1, 1]) {
      const p = project(w, h, 1 + side * 1.83, z), s = p.scale
      box(ctx, p.x - 2 * s, p.y - 110 * s, 4 * s, 110 * s, '#4d7768')
      box(ctx, p.x - (side < 0 ? 0 : 26 * s), p.y - 110 * s, 26 * s, 6 * s, '#4d7768', 2)
      box(ctx, p.x - (side < 0 ? -10 * s : 22 * s), p.y - 103 * s, 12 * s, 6 * s, '#ffe8a9', 2)
    }
  }
  box(ctx, w * 0.375, h * 0.175, w * 0.25, h * 0.067, '#2d655d', 4)
  ctx.fillStyle = '#fff0cc'; ctx.textAlign = 'center'; ctx.font = 'bold ' + Math.round(w * 0.025) + 'px sans-serif'
  ctx.fillText('星 光 环 线  01', w * 0.5, h * 0.205)
  ctx.font = Math.round(w * 0.019) + 'px sans-serif'; ctx.fillText('LITTLE TOWN', w * 0.5, h * 0.226)
}

function train(ctx, w, h, item) {
  const front = project(w, h, item.lane, item.z), back = project(w, h, item.lane, item.z + 22)
  const fw = w * 0.22 * front.scale, bw = w * 0.22 * back.scale
  const fh = w * 0.34 * front.scale, bh = w * 0.34 * back.scale
  polygon(ctx, [[back.x-bw/2,back.y-bh],[back.x+bw/2,back.y-bh],[front.x+fw/2,front.y-fh],[front.x-fw/2,front.y-fh]], '#c1d8b9', '#325e54')
  polygon(ctx, [[back.x-bw/2,back.y-bh],[front.x-fw/2,front.y-fh],[front.x-fw/2,front.y],[back.x-bw/2,back.y]], '#6c9a80')
  polygon(ctx, [[back.x+bw/2,back.y-bh],[front.x+fw/2,front.y-fh],[front.x+fw/2,front.y],[back.x+bw/2,back.y]], '#427e6d')
  box(ctx, front.x-fw/2, front.y-fh, fw, fh, '#2f6458', 9 * front.scale)
  box(ctx, front.x-fw/2+3*front.scale, front.y-fh+3*front.scale, fw-6*front.scale, fh-7*front.scale, '#f6e9bf', 7 * front.scale)
  box(ctx, front.x-fw*0.38, front.y-fh*0.83, fw*0.76, fh*0.36, '#375f5d', 4 * front.scale)
  polygon(ctx, [[front.x-fw*.32,front.y-fh*.78],[front.x+fw*.25,front.y-fh*.78],[front.x-fw*.1,front.y-fh*.55],[front.x-fw*.32,front.y-fh*.55]], '#86b1a0')
  box(ctx, front.x-fw/2+3*front.scale, front.y-fh*.37, fw-6*front.scale, fh*.14, '#2d7c69')
  for (const sign of [-1,1]) oval(ctx, front.x+sign*fw*.31, front.y-fh*.14, fw*.075, fw*.05, '#f7c65d')
  box(ctx, front.x-fw*.25, front.y-fh*.05, fw*.5, fh*.06, '#36564e')
}

function obstacle(ctx, w, h, item, elapsed) {
  if (item.kind === 'train') { train(ctx, w, h, item); return }
  const p = project(w, h, item.lane, item.z), size = w * 0.21 * p.scale
  ctx.save(); ctx.translate(p.x, p.y)
  if (item.kind === 'star') {
    ctx.translate(0, -size * 0.48)
    ctx.scale(0.78 + 0.22 * Math.cos(elapsed * 4 + item.id), 1)
    const points = []
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2, r = size * (i % 2 ? 0.12 : 0.26)
      points.push([Math.cos(a)*r, Math.sin(a)*r])
    }
    ctx.lineWidth = Math.max(1, 2*p.scale); polygon(ctx, points, '#ffdc6e', '#b8822d')
  } else if (item.kind === 'barrier') {
    for (const side of [-1,1]) box(ctx, side*size*.35-size*.035, -size*.51, size*.07, size*.54, '#465f51')
    box(ctx, -size*.5, -size*.6, size, size*.36, '#f8e6bc', 2)
    for (let i = 0; i < 4; i++) polygon(ctx, [[-size*.5+i*size*.25,-size*.6],[-size*.35+i*size*.25,-size*.6],[-size*.46+i*size*.25,-size*.24],[-size*.6+i*size*.25,-size*.24]], '#d7794b')
  } else {
    for (const side of [-1,1]) box(ctx, side*size*.45-size*.035, -size*1.15, size*.07, size*1.15, '#3d645b')
    box(ctx, -size*.52, -size*1.2, size*1.04, size*.68, '#276e63', 2)
    box(ctx, -size*.52, -size*.57, size*1.04, size*.08, '#f5d276')
    polygon(ctx, [[-size*.055,-size*1.06],[size*.055,-size*1.06],[size*.055,-size*.88],[size*.18,-size*.88],[0,-size*.69],[-size*.18,-size*.88],[-size*.055,-size*.88]], '#fff0c4')
  }
  ctx.restore()
}

function runner(ctx, w, h, run) {
  const p = project(w, h, run.lanePosition, 0), scale = w / 375
  const jumping = jumpHeight(run), sliding = run.action === 'slide'
  const stride = run.status === 'running' && !jumping ? Math.sin(run.elapsed * 17) * 5 : 0
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(scale, scale)
  oval(ctx, 0, 3, 18 - jumping*5, 5, 'rgba(37,66,52,.25)')
  if (run.immune > 0 && Math.floor(run.immune * 12) % 2) ctx.globalAlpha = 0.45
  ctx.translate(0, -jumping * 70)
  if (sliding) { ctx.translate(0, -6); ctx.rotate(-0.75); ctx.scale(1, 0.65) }
  box(ctx, -13, -26, 11, 24+stride, '#335a55', 3)
  box(ctx, 2, -26, 11, 24-stride, '#335a55', 3)
  box(ctx, -16, -6+stride, 14, 7, '#fff1d2', 2)
  box(ctx, 2, -6-stride, 14, 7, '#fff1d2', 2)
  box(ctx, -19, -53-stride*.5, 9, 27, '#e6b487', 4)
  box(ctx, 10, -53+stride*.5, 9, 27, '#e6b487', 4)
  box(ctx, -15, -57, 30, 35, '#f0c367', 7)
  box(ctx, -12, -53, 24, 30, '#b86643', 6)
  box(ctx, -9, -49, 18, 20, '#e28d52', 5)
  box(ctx, -5, -42, 10, 4, '#f6d188', 1)
  box(ctx, -13, -79, 26, 25, '#e8b98c', 8)
  box(ctx, -14, -82, 28, 13, '#325d4e', 7)
  box(ctx, -16, -88, 32, 16, '#347d67', 9)
  box(ctx, -15, -76, 33, 5, '#245947', 2)
  box(ctx, -8, -85, 14, 3, '#75b79a', 2)
  ctx.restore()
}

function drawRun(ctx, width, height, run) {
  ctx.clearRect(0, 0, width, height)
  ctx.lineWidth = 1
  scenery(ctx, width, height, run)
  const objects = run.objects.filter(item => item.z > 0).slice().sort((a,b) => b.z-a.z)
  for (const item of objects) obstacle(ctx, width, height, item, run.elapsed)
  runner(ctx, width, height, run)
  if (run.feedbackTime > 1.45) {
    ctx.fillStyle = 'rgba(220,112,70,.12)'; ctx.fillRect(0,0,width,height)
  }
}

module.exports = { drawRun, project }
