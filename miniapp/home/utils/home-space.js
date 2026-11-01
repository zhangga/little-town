// World coordinates are metres across the oak floor: x = right, y = back → front.
const SIZE = 7
const ENTRY = { x: 3.5, y: 6.5 }
const RADIUS = 0.18
const radians = angle => angle * Math.PI / 180
const round = value => Math.round(value * 1000) / 1000
const degrees = value => ((value % 360) + 360) % 360

function normalize(p, catalog) {
  if (Number.isFinite(p.angle)) return { id: p.id, x: p.x, y: p.y, rotation: 0, angle: degrees(p.angle) }
  const item = catalog.find(i => i.id === p.id) || { width: 1, depth: 1 }
  const w = p.rotation ? item.depth : item.width, d = p.rotation ? item.width : item.depth
  return { id: p.id, x: p.x + w / 2, y: p.y + d / 2, rotation: 0, angle: p.rotation ? 90 : 0 }
}
function rectangle(p, catalog) {
  const item = catalog.find(i => i.id === p.id)
  if (!item) return null
  const q = normalize(p, catalog), a = radians(q.angle)
  return { x: q.x, y: q.y, w: item.width, d: item.depth, c: Math.cos(a), s: Math.sin(a) }
}
function corners(r) {
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => ({ x: r.x + x*r.w/2*r.c - y*r.d/2*r.s, y: r.y + x*r.w/2*r.s + y*r.d/2*r.c }))
}
function overlap(a, b) {
  const ac = corners(a), bc = corners(b)
  return [[a.c,a.s],[-a.s,a.c],[b.c,b.s],[-b.s,b.c]].every(([x,y]) => {
    const pa = ac.map(p=>p.x*x+p.y*y), pb = bc.map(p=>p.x*x+p.y*y)
    return Math.min(...pa) < Math.max(...pb)-1e-7 && Math.min(...pb) < Math.max(...pa)-1e-7
  })
}
function canPlace(layout, catalog, p) {
  const item = catalog.find(i => i.id === p.id)
  if (!item || !item.owned || ![p.x,p.y,p.angle].every(Number.isFinite) || p.angle < 0 || p.angle >= 360) return false
  const rect = rectangle(p, catalog)
  if (corners(rect).some(c=>c.x < -1e-7 || c.y < -1e-7 || c.x > SIZE+1e-7 || c.y > SIZE+1e-7)) return false
  if (overlap(rect, { ...ENTRY, w: 1, d: 1, c: 1, s: 0 })) return false
  return item.id === 'rug' || !layout.some(q=>q.id!==p.id && q.id!=='rug' && overlap(rect, rectangle(q,catalog)))
}
function canWalk(p, layout, catalog) {
  if (!p || ![p.x,p.y].every(Number.isFinite) || p.x<RADIUS || p.y<RADIUS || p.x>SIZE-RADIUS || p.y>SIZE-RADIUS) return false
  return !layout.some(q=>{
    if(q.id==='rug')return false
    const r=rectangle(q,catalog), dx=p.x-r.x, dy=p.y-r.y
    const x=Math.abs(dx*r.c+dy*r.s), y=Math.abs(-dx*r.s+dy*r.c)
    return Math.hypot(Math.max(x-r.w/2,0),Math.max(y-r.d/2,0)) < RADIUS-1e-7
  })
}
function clearSegment(a,b,layout,catalog) {
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/0.09))
  for(let i=1;i<=steps;i++)if(!canWalk({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps},layout,catalog))return false
  return true
}
function pathTo(start,target,layout,catalog) {
  if(!canWalk(start,layout,catalog)||!canWalk(target,layout,catalog))return null
  if(clearSegment(start,target,layout,catalog))return [{x:target.x,y:target.y}]
  const step=.25, key=p=>p.x+','+p.y
  const nodes=[]
  for(let x=1;x<28;x++)for(let y=1;y<28;y++)nodes.push({x:x*step,y:y*step})
  const near=nodes.filter(p=>canWalk(p,layout,catalog)&&Math.hypot(p.x-start.x,p.y-start.y)<.55&&clearSegment(start,p,layout,catalog)).sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y))[0]
  if(!near)return null
  const queue=[near], parents=new Map([[key(near),null]]), positions=new Map([[key(near),near]])
  for(let i=0;i<queue.length;i++){
    const p=queue[i]
    if(Math.hypot(p.x-target.x,p.y-target.y)<.4&&clearSegment(p,target,layout,catalog)){
      const result=[{x:target.x,y:target.y}];let k=key(p)
      while(k){result.unshift(positions.get(k));k=parents.get(k)}
      return result
    }
    for(const [dx,dy] of [[0,-step],[-step,0],[step,0],[0,step]]){
      const q={x:p.x+dx,y:p.y+dy}, k=key(q)
      if(!parents.has(k)&&clearSegment(p,q,layout,catalog)){
        parents.set(k,key(p));positions.set(k,q);queue.push(q)
      }
    }
  }
  return null
}
function approach(start,placed,layout,catalog) {
  const r=rectangle(placed,catalog), targets=[]
  if(placed.id==='rug')targets.push({x:r.x,y:r.y})
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8, x=Math.cos(a)*(r.w/2+.36), y=Math.sin(a)*(r.d/2+.36)
    targets.push({x:r.x+x*r.c-y*r.s,y:r.y+x*r.s+y*r.c})
  }
  const paths=targets.map(p=>pathTo(start,p,layout,catalog)).filter(Boolean)
  const length=path=>path.reduce((n,p,i)=>{const prev=i?path[i-1]:start;return n+Math.hypot(p.x-prev.x,p.y-prev.y)},0)
  return paths.sort((a,b)=>length(a)-length(b))[0]||null
}
function move(start,dx,dy,layout,catalog) {
  const next={x:start.x,y:start.y}, steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.08))
  for(let i=0;i<steps;i++){
    const x={x:next.x+dx/steps,y:next.y};if(canWalk(x,layout,catalog))next.x=x.x
    const y={x:next.x,y:next.y+dy/steps};if(canWalk(y,layout,catalog))next.y=y.y
  }
  return next
}
module.exports={SIZE,ENTRY,RADIUS,round,degrees,normalize,rectangle,corners,overlap,canPlace,canWalk,clearSegment,pathTo,approach,move}
