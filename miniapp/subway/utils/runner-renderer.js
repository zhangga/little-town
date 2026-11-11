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
  sky.addColorStop(0, '#48aaca'); sky.addColorStop(0.65, '#97d6df'); sky.addColorStop(1, '#ffe2aa')
  box(ctx, 0, 0, w, h, sky)
  oval(ctx, w * 0.77, h * 0.12, w * 0.065, w * 0.065, '#ffe69a')
  for (let i = 0; i < 9; i++) {
    const x = i * w / 8 - w * 0.035
    const bh = h * (0.055 + ((i * 7) % 5) * 0.018)
    box(ctx, x, h * 0.3 - bh, w * 0.085, bh, ['#4b91aa','#73b5bb','#5a9fac'][i % 3], 2)
    box(ctx, x + w * 0.015, h * 0.3 - bh + 8, w * 0.016, 5, '#e2e3bd')
  }
  box(ctx, 0, h * 0.3, w, h * 0.7, '#d4b8a1')
  polygon(ctx, [[w * 0.37, h * 0.29], [w * 0.63, h * 0.29], [w * 1.12, h], [-w * 0.12, h]], '#33465b')
  // Parallel rails, cross ties and platform stripes all share the projection.
  for (let lane = 0; lane < 3; lane++) {
    const far = project(w, h, lane, 150), near = project(w, h, lane, -3)
    polygon(ctx, [[far.x - 8, far.y], [far.x + 8, far.y], [near.x + w * 0.13, h], [near.x - w * 0.13, h]], lane === 1 ? '#647184' : '#56667b')
    for (let i = 0; i < 30; i++) {
      const z = i * 6 - run.distance % 6
      if (z < -2) continue
      const p = project(w, h, lane, z)
      box(ctx, p.x - w * 0.09 * p.scale, p.y, w * 0.18 * p.scale, Math.max(1, 5 * p.scale), '#35465c')
    }
    for (const offset of [-0.072, 0.072]) {
      ctx.beginPath(); ctx.moveTo(far.x + w * offset * far.scale, far.y); ctx.lineTo(near.x + w * offset * near.scale, near.y)
      ctx.strokeStyle = '#d0e4e7'; ctx.lineWidth = w * 0.009; ctx.stroke()
      ctx.strokeStyle = '#455c54'; ctx.lineWidth = w * 0.003; ctx.stroke()
    }
  }
  polygon(ctx, [[0,h],[0,h * 0.38],[w * 0.36,h * 0.29],[w * 0.23,h * 0.52]], '#e3ba8e')
  polygon(ctx, [[w,h],[w,h * 0.38],[w * 0.64,h * 0.29],[w * 0.77,h * 0.52]], '#dba78a')
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
  for (let i = 7; i >= 0; i--) {
    const z = i * 24 + 8 - run.distance % 24
    if (z < 2) continue
    for (const side of [-1, 1]) {
      const p = project(w,h,1+side*2.7,z), a = p.scale
      const bw = w*.3*a, bh = w*(.65 + (i%3)*.1)*a
      box(ctx,p.x-bw/2,p.y-bh,bw,bh,['#dc795d','#4a8fbc','#e4b55b','#7a9cba'][i%4],3*a)
      box(ctx,p.x-bw/2,p.y-bh,bw,8*a,'#244862')
      box(ctx,p.x+(side>0?bw*.25:-bw*.5),p.y-bh,bw*.25,bh,'#18365035')
      for(let row=0;row<4;row++)for(let col=0;col<2;col++) {
        box(ctx,p.x-bw*.31+col*bw*.4,p.y-bh+bh*.15+row*bh*.19,bw*.22,bh*.1,row%2?'#a8e9e6':'#ffdf98',2*a)
      }
      box(ctx,p.x-bw*.55,p.y-bh*.24,bw*1.1,bh*.16,i%2?'#246a77':'#ec6658',3*a)
      if(a>.25){ctx.fillStyle='#fff4d3';ctx.font='bold '+Math.round(12*a)+'px sans-serif';ctx.textAlign='center';ctx.fillText(i%2?'METRO':'TOWN',p.x,p.y-bh*.13)}
    }
  }
  // Overhead gantries glide past in the same projection as the rails.
  for(let i=3;i>=0;i--){const z=i*55+25-run.distance%55;if(z<5)continue;const a=project(w,h,-.7,z),b=project(w,h,2.7,z),top=a.y-w*.58*a.scale;ctx.strokeStyle='#35576e';ctx.lineWidth=Math.max(1,5*a.scale);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x,top);ctx.lineTo(b.x,top);ctx.lineTo(b.x,b.y);ctx.stroke()}
  box(ctx, w * 0.375, h * 0.175, w * 0.25, h * 0.067, '#173e5b', 4)
  ctx.fillStyle = '#fff0cc'; ctx.textAlign = 'center'; ctx.font = 'bold ' + Math.round(w * 0.025) + 'px sans-serif'
  ctx.fillText('星 光 环 线  01', w * 0.5, h * 0.205)
  ctx.font = Math.round(w * 0.019) + 'px sans-serif'; ctx.fillText('MY TOWN', w * 0.5, h * 0.226)
}

function train(ctx, w, h, item) {
  const front = project(w, h, item.lane, item.z), back = project(w, h, item.lane, item.z + 22)
  const fw = w * 0.23 * front.scale, bw = w * 0.23 * back.scale
  const paint = item.kind === 'truck' ? '#f3ac3d' : ['#ff7759','#35b9be','#5389df'][item.lane]
  const fh = w * 0.34 * front.scale, bh = w * 0.34 * back.scale
  polygon(ctx, [[back.x-bw/2,back.y-bh],[back.x+bw/2,back.y-bh],[front.x+fw/2,front.y-fh],[front.x-fw/2,front.y-fh]], '#c4e0e5', '#244c66')
  polygon(ctx, [[back.x-bw/2,back.y-bh],[front.x-fw/2,front.y-fh],[front.x-fw/2,front.y],[back.x-bw/2,back.y]], '#53829c')
  polygon(ctx, [[back.x+bw/2,back.y-bh],[front.x+fw/2,front.y-fh],[front.x+fw/2,front.y],[back.x+bw/2,back.y]], '#325770')
  box(ctx, front.x-fw/2, front.y-fh, fw, fh, '#25465c', 9 * front.scale)
  box(ctx, front.x-fw/2+3*front.scale, front.y-fh+3*front.scale, fw-6*front.scale, fh-7*front.scale, paint, 7 * front.scale)
  box(ctx, front.x-fw*0.38, front.y-fh*0.83, fw*0.76, fh*0.36, '#375f5d', 4 * front.scale)
  polygon(ctx, [[front.x-fw*.32,front.y-fh*.78],[front.x+fw*.25,front.y-fh*.78],[front.x-fw*.1,front.y-fh*.55],[front.x-fw*.32,front.y-fh*.55]], '#86b1a0')
  box(ctx, front.x-fw/2+3*front.scale, front.y-fh*.37, fw-6*front.scale, fh*.14, '#f9efc7')
  for (const sign of [-1,1]) oval(ctx, front.x+sign*fw*.31, front.y-fh*.14, fw*.075, fw*.05, '#f7c65d')
  box(ctx, front.x-fw*.25, front.y-fh*.05, fw*.5, fh*.06, '#36564e')
}

function obstacle(ctx, w, h, item, elapsed) {
  if (item.kind === 'train' || item.kind === 'truck') { train(ctx, w, h, item); return }
  const p = project(w, h, item.lane, item.z), size = w * 0.21 * p.scale
  ctx.save(); ctx.translate(p.x, p.y)
  if (item.kind === 'coin') {
    ctx.translate(0,-size*.45);const spin=.65+.35*Math.abs(Math.cos(elapsed*5+item.id))
    oval(ctx,0,0,size*.22*spin,size*.26,'#ab6a1c');oval(ctx,-size*.025,-size*.025,size*.19*spin,size*.235,'#ffd253')
    ctx.strokeStyle='#fff0a4';ctx.lineWidth=Math.max(1,size*.025);ctx.beginPath();ctx.ellipse(0,-size*.025,size*.13*spin,size*.18,0,0,Math.PI*2);ctx.stroke()
    box(ctx,-size*.025*spin,-size*.15,size*.05*spin,size*.24,'#fff0a4',1)
  } else if (item.kind === 'spring') {
    polygon(ctx,[[-size*.48,0],[size*.48,0],[size*.36,-size*.25],[-size*.36,-size*.25]],'#263f5c')
    for(let i=0;i<3;i++)polygon(ctx,[[-size*.35,-size*.03-i*size*.06],[size*.35,-size*.03-i*size*.06],[size*.35,-size*.06-i*size*.06],[-size*.35,-size*.06-i*size*.06]],'#53dbca')
    polygon(ctx,[[-size*.51,-size*.23],[size*.51,-size*.23],[size*.38,-size*.43],[-size*.38,-size*.43]],'#ffcb4e','#825f2c')
    polygon(ctx,[[0,-size*.4],[-size*.2,-size*.28],[size*.2,-size*.28]],'#fff5cb')
  } else if (item.kind === 'board') {
    ctx.translate(0,-size*.55+Math.sin(elapsed*4)*size*.04);ctx.rotate(-.45)
    box(ctx,-size*.17,-size*.5,size*.34,size,'#28dfb9',size*.2);box(ctx,-size*.12,-size*.3,size*.24,size*.55,'#244568',size*.1)
    for(const y of [-.29,.29])for(const x of [-.18,.18])oval(ctx,size*x,size*y,size*.06,size*.05,'#ffc453')
  } else if (item.kind === 'magnet') {
    ctx.translate(0,-size*.65);ctx.lineWidth=size*.18;ctx.strokeStyle='#ff694b';ctx.beginPath();ctx.arc(0,0,size*.23,0,Math.PI);ctx.stroke()
    box(ctx,-size*.32,-size*.3,size*.18,size*.3,'#ff694b');box(ctx,size*.14,-size*.3,size*.18,size*.3,'#ff694b');box(ctx,-size*.32,-size*.4,size*.18,size*.15,'#e5f5f3');box(ctx,size*.14,-size*.4,size*.18,size*.15,'#e5f5f3')
  } else if (item.kind === 'star') {
    ctx.translate(0, -size * 0.48 - (item.height || 0)*70*(w/375)*p.scale)
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

function person(ctx, stride, guard, color) {
  box(ctx,-13,-27,11,24+stride,guard?'#172e4b':'#23465e',4)
  box(ctx,2,-27,11,24-stride,guard?'#172e4b':'#23465e',4)
  box(ctx,-17,-5+stride,16,8,guard?'#10253c':'#fff0dc',3)
  box(ctx,2,-5-stride,16,8,guard?'#10253c':'#fff0dc',3)
  box(ctx,-22,-53-stride*.6,10,28,'#e9ae7c',5);box(ctx,12,-53+stride*.6,10,28,'#e9ae7c',5)
  box(ctx,-17,-61,34,39,guard?'#3e6c9c':color,9)
  box(ctx,9,-57,8,32,guard?'#264f79':'#d95339',4)
  if(guard){box(ctx,-17,-30,34,6,'#182d47');box(ctx,-4,-31,8,8,'#efbe55',2)}
  else{box(ctx,-12,-54,24,30,'#f1c65b',7);box(ctx,-9,-49,18,20,'#e7a844',5);box(ctx,-5,-43,10,4,'#ffebb2',2)}
  box(ctx,-13,-84,26,27,'#e9b384',9);box(ctx,-14,-87,28,13,'#25384a',7)
  box(ctx,-17,-94,34,17,guard?'#244c7a':'#3dd3c3',9);box(ctx,-17,-81,36,6,guard?'#173456':'#21889c',2)
  box(ctx,-7,-91,14,5,guard?'#ffce60':'#e7fff0',2)
}
function runner(ctx,w,h,run) {
  const p=project(w,h,run.lanePosition,0),s=w/375,jumping=jumpHeight(run)
  const caught=run.status==='caught'||run.status==='over'&&run.captureTime>0
  const t=caught?run.captureTime:0,carry=Math.max(0,Math.min(1,(t-.75)/.55)),exit=Math.max(0,(t-1.35)/.85)
  const x=p.x-exit*w*.8,y=p.y+exit*h*.08
  if(run.chase>0||caught){
    const close=caught?Math.min(1,t/.7):.35+.4*run.chase/8
    ctx.save();ctx.translate(x+35*s*(1-close),y+(110-95*close)*s);ctx.scale(s*(1.12-.1*close),s*(1.12-.1*close))
    oval(ctx,0,5,27,7,'#102c4a50');person(ctx,Math.sin((run.elapsed+t)*19)*6,true)
    if(carry>0){box(ctx,-25,-69,12,29,'#e9ae7c',6);box(ctx,14,-69,12,29,'#e9ae7c',6)}
    ctx.restore()
  }
  ctx.save();ctx.translate(x,y);ctx.scale(s,s)
  oval(ctx,0,4,22-jumping*4,6,'#17334c55')
  if(run.magnet>0){ctx.strokeStyle='#ffe59c80';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-25,42+Math.sin(run.elapsed*6)*6,60,0,0,Math.PI*2);ctx.stroke()}
  if(run.boardTime>0){
    const board={mint:'#35e3be',sunset:'#ff794d',aurora:'#60bfff'}[run.skin]||'#35e3be'
    for(let i=0;i<5;i++){ctx.strokeStyle=board+(i%2?'66':'bb');ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-15+i*7,4);ctx.lineTo(-16+i*7,25+(i%3)*7);ctx.stroke()}
    ctx.save();ctx.translate(0,-jumping*70);ctx.rotate(Math.sin(run.elapsed*4)*.08);box(ctx,-28,-4,56,10,board,5);box(ctx,-17,-6,34,3,'#fff0c5',2);oval(ctx,-18,7,5,4,'#203e5c');oval(ctx,18,7,5,4,'#203e5c');ctx.restore()
  }
  ctx.translate(0,-jumping*70-carry*77)
  if(carry){ctx.rotate(-Math.PI*.43*carry);ctx.translate(0,12*carry)}
  else if(run.action==='slide'){ctx.translate(0,-5);ctx.rotate(-.9);ctx.scale(1,.6)}
  else if(run.stun>0)ctx.rotate(Math.sin(run.elapsed*27)*.14)
  if(run.immune>0&&Math.floor(run.immune*12)%2)ctx.globalAlpha=.55
  person(ctx,run.status==='running'&&!jumping&&!run.boardTime?Math.sin(run.elapsed*19)*6:0,false,'#ff7852')
  if(run.stun>0){ctx.fillStyle='#ffe47b';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('✦  ✦  ✦',Math.sin(run.elapsed*10)*9,-108)}
  ctx.restore()
}

function drawRun(ctx, width, height, run) {
  ctx.clearRect(0, 0, width, height)
  ctx.lineWidth = 1
  scenery(ctx, width, height, run)
  const objects = run.objects.filter(item => item.z > 0).slice().sort((a,b) => b.z-a.z)
  for (const item of objects) obstacle(ctx, width, height, item, run.elapsed)
  runner(ctx, width, height, run)
  if(run.stun>0){ctx.fillStyle='rgba(255,93,57,.16)';ctx.fillRect(0,0,width,height)}
  if(run.pickupFlash>0){ctx.fillStyle='rgba(255,230,130,.07)';ctx.fillRect(0,0,width,height)}
  if(run.status==='caught'){
    ctx.fillStyle='rgba(12,29,48,'+(Math.max(0,run.captureTime-1.5)*.35)+')';ctx.fillRect(0,0,width,height)
    ctx.textAlign='center';ctx.fillStyle='#fff1d0';ctx.strokeStyle='#19374b';ctx.lineWidth=4;ctx.font='900 '+Math.round(width*.065)+'px sans-serif';ctx.strokeText('被巡逻员追上啦！',width/2,height*.2);ctx.fillText('被巡逻员追上啦！',width/2,height*.2)
  }
}

module.exports = { drawRun, project }
