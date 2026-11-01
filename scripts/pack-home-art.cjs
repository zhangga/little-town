// Pack the original image_gen source sprites; retain the source alpha and game style.
// NODE_PATH=<bundled node_modules> node scripts/pack-home-art.cjs
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'output/imagegen')
const out = path.join(root, 'miniapp/home/images')
const ids = ['chair','sofa','tv','lamp','plant','bed','wardrobe','rug','desk','bookshelf','table','fridge']
async function spriteBounds(buffer) {
  // The generated atlas has a few neighbor fragments at cell boundaries.
  // Crop to the principal connected object, preserving its original pixels.
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  const visited=new Uint8Array(info.width*info.height);let largest=[]
  for(let start=0;start<visited.length;start++){
    if(visited[start]||data[start*4+3]<24)continue
    const component=[start];visited[start]=1
    for(let cursor=0;cursor<component.length;cursor++){
      const i=component[cursor],x=i%info.width,y=Math.floor(i/info.width)
      for(const [nx,ny]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
        if(nx<0||ny<0||nx>=info.width||ny>=info.height)continue
        const next=ny*info.width+nx
        if(!visited[next]&&data[next*4+3]>=24){visited[next]=1;component.push(next)}
      }
    }
    if(component.length>largest.length)largest=component
  }
  if(!largest.length)throw Error('Empty furniture cell')
  let left=info.width,top=info.height,right=0,bottom=0
  for(const i of largest){const x=i%info.width,y=Math.floor(i/info.width);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
  return {left,top,width:right-left+1,height:bottom-top+1}
}
async function main() {
  fs.mkdirSync(out,{recursive:true})
  const atlas = path.join(source,'home-furniture-source.png')
  const meta = await sharp(atlas).metadata()
  for (let i=0;i<ids.length;i++) {
    const col=i%4,row=Math.floor(i/4),left=Math.round(col*meta.width/4),top=Math.round(row*meta.height/3)
    const width=Math.round((col+1)*meta.width/4)-left,height=Math.round((row+1)*meta.height/3)-top
    const cropped=await sharp(atlas).extract({left,top,width,height}).toBuffer()
    const tile=await sharp(cropped).extract(await spriteBounds(cropped)).resize(150,150,{fit:'inside'}).toBuffer()
    const tileMeta=await sharp(tile).metadata()
    await sharp({create:{width:180,height:180,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:tile,left:Math.round((180-tileMeta.width)/2),top:159-tileMeta.height}]).png({palette:true,colours:128,effort:10}).toFile(path.join(out,ids[i]+'.png'))
  }
  await sharp(path.join(source,'home-room-source.png')).resize(700,560,{fit:'fill'}).png({palette:true,colours:192,effort:10}).toFile(path.join(out,'room.png'))
  // Match the 14% clear gutters of the existing town atlas sprites.
  const mall = await sharp(path.join(source,'home-mall-source.png')).trim({threshold:10}).resize(296,296,{fit:'inside'}).toBuffer()
  const m=await sharp(mall).metadata()
  const packed=await sharp({create:{width:400,height:400,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:mall,left:Math.round((400-m.width)/2),top:Math.round((400-m.height)/2)}]).png({palette:true,colours:128,effort:10}).toBuffer()
  fs.writeFileSync(path.join(out,'mall.png'),packed)
  fs.mkdirSync(path.join(root,'output/home-preview'),{recursive:true})
  fs.writeFileSync(path.join(root,'output/home-preview/mall-tile.rgba'),await sharp(packed).resize(256,256).ensureAlpha().raw().toBuffer())
  if(!process.argv.includes('--furniture-only'))process.stdout.write(execFileSync('python3',[path.join(root,'scripts/pack-town-mall.py')]))
  console.log('Packed 12 furniture sprites, the room shell and the matching mall')
}
main().catch(error=>{console.error(error);process.exitCode=1})
