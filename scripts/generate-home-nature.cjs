// Original vector artwork, rasterized locally for WeChat's image component.
// NODE_PATH=<bundled node_modules> node scripts/generate-home-nature.cjs
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const out = path.resolve(__dirname, '../miniapp/home/images')
const poly = (points, fill, stroke = '#6e684f') => `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`
const rect = (x,y,w,h,fill,r=3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`
const ellipse = (x,y,rx,ry,fill) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`
const line = (x,y,a,b,color='#82694f',width=2) => `<path d="M${x} ${y}L${a} ${b}" stroke="${color}" stroke-width="${width}" fill="none"/>`
function box(x,y,w,d,h,top='#e2bd89',front='#c59360',side='#aa774b') {
  return poly(`${x},${y-h} ${x+w},${y-h+w*.5} ${x+w-d},${y-h+(w+d)*.5} ${x-d},${y-h+d*.5}`,top)+
    poly(`${x-d},${y-h+d*.5} ${x+w-d},${y-h+(w+d)*.5} ${x+w-d},${y+(w+d)*.5} ${x-d},${y+d*.5}`,front)+
    poly(`${x+w-d},${y-h+(w+d)*.5} ${x+w},${y-h+w*.5} ${x+w},${y+w*.5} ${x+w-d},${y+(w+d)*.5}`,side)
}
function tree(x,y,s=1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">${rect(-3,-18,6,24,'#947451')}${ellipse(0,-32,18,24,'#699373')}${ellipse(-10,-26,12,17,'#86a781')}${ellipse(9,-35,12,17,'#a9bd8b')}</g>`
}
function landscape(kind) {
  let s = rect(0,0,640,360,kind==='sea'?'#bde0e5':kind==='mountain'?'#cddfe4':'#e0e9cd',0)
  s+=ellipse(512,64,28,28,'#fff2bf')
  if(kind==='sea') {
    s+=rect(0,170,640,190,'#7eb6ba',0)+`<path d="M0 260 Q160 218 310 286 T640 270 V360 H0Z" fill="#f4d8a5"/>`
    for(let i=0;i<5;i++) s+=`<path d="M${50+i*110} ${205+(i%2)*30}q30 -10 65 0" stroke="#e7f4e8" stroke-width="4" fill="none"/>`
    s+=poly('0,225 70,102 150,225','#6f9580','none')+poly('68,225 143,152 233,225','#9eb69b','none')
  } else if(kind==='mountain') {
    s+=poly('0,290 195,50 405,290','#819ca0','none')+poly('210,290 415,30 640,290','#a8b9af','none')
    s+=poly('136,124 195,50 260,125 224,110 199,132 174,102','#f8faf1','none')+poly('354,107 415,30 477,104 444,89 412,115 389,89','#fcfcf5','none')
    s+=`<path d="M0 273Q180 240 320 279T640 267V360H0Z" fill="#759a88"/>`+`<path d="M190 290Q330 260 480 312L555 360H100Z" fill="#b5d5cd"/>`
  } else {
    s+=`<path d="M0 190Q170 110 350 175T640 154V360H0Z" fill="#b8cba5"/>`
    for(let i=0;i<11;i++) s+=tree(i*68,240+(i%3)*22,2+(i%2)*.3)
    s+=`<path d="M310 250Q240 296 390 360H525Q330 285 340 250Z" fill="#f1dfb6"/>`
    for(let i=0;i<8;i++) s+=ellipse(40+i*76,310+(i%2)*27,3,3,'#fff4ca')
  }
  return s
}
async function save(name, body, w, h) {
  const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
  await sharp(Buffer.from(source)).png({palette:true}).toFile(path.join(out,name+'.png'))
}
async function main(){
  fs.mkdirSync(out,{recursive:true})
  for(const id of ['forest','sea','mountain']) await save(id,landscape(id),640,360)
  console.log('Created three local nature illustrations')
}
main().catch(error=>{console.error(error);process.exitCode=1})
