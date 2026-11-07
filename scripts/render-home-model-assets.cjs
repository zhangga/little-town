const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),sharp=require('sharp')
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 try{
  const p=await browser.newPage();await p.goto(process.env.HOME_PREVIEW_URL||'http://127.0.0.1:9435/output/home-preview/space.html');await p.waitForFunction(()=>window.renderHomeModel)
  for(const id of (process.argv.includes('--homes')?[]:['kitchen','bathtub','vanity','toilet','piano','arcade','aquarium','fireplace','pool','treadmill','pooltable','sectional'])){
   const data=await p.evaluate(id=>window.renderHomeModel('furniture',id),id)
   await sharp(Buffer.from(data.split(',')[1],'base64')).resize(180,180).png({palette:true,colours:160,effort:10}).toFile(path.resolve('miniapp/home/images/'+id+'.png'))
  }
  for(const level of [4,5]){const data=await p.evaluate(level=>window.renderHomeModel('home',level),level);await sharp(Buffer.from(data.split(',')[1],'base64')).resize(400,400).png({palette:true,colours:160,effort:10}).toFile(path.resolve('miniapp/images/resident/home-villa-'+level+'.png'))}
  console.log('Rendered '+(process.argv.includes('--homes')?'2 villa illustrations':'12 furniture thumbnails and 2 villa illustrations')+' from the actual 3D models.')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
