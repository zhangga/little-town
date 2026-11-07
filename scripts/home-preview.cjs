// Compile actual WXML/WXSS into deterministic phone-sized layout previews.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const os = require('node:os')
const http = require('node:http')
const { spawnSync } = require('node:child_process')
const { fixture, roomHarness, mallHarness, tap, clone } = require('./home-room-test.cjs')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'output/home-preview')
const compilerDir = process.env.WECHAT_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec'
const escape = v => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const responsive = s => String(s).replace(/(-?[\d.]+)rpx/g,(_,v)=>'calc('+v+' * var(--rpx))')
function dependencies(file, kind, found = new Set()) {
  if(found.has(file))return found
  found.add(file)
  const pattern=kind==='wxml'?/<(?:import|include)\b[^>]*\bsrc=["']([^"']+)["']/g:/@import\s+["']([^"']+)["']/g
  for(const match of fs.readFileSync(path.join(root,file),'utf8').matchAll(pattern)) dependencies(path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1])),kind,found)
  return found
}
function compile(binary, files) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'home-preview-'))
  try {
    const result=spawnSync(path.join(compilerDir,binary),['-o',path.join(temp,'compiled'),...files],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024})
    if(result.error||result.status!==0)throw Error(binary+': '+(result.error||result.stderr||result.stdout))
    return fs.readFileSync(path.join(temp,'compiled'),'utf8')
  } finally { fs.rmSync(temp,{recursive:true,force:true}) }
}
function html(node) {
  if(node===null||node===undefined)return ''
  if(typeof node!=='object')return escape(node)
  const children=(node.children||[]).map(html).join('')
  if(!node.tag||node.tag==='virtual')return children
  const original=node.tag.replace(/^wx-/,''), tag={image:'img',button:'button',input:'input'}[original]||node.tag
  const attrs=Object.entries(node.attr||{}).filter(([k,v])=>v!==false&&v!==null&&v!==undefined&&(/^(class|style|id|src|disabled|value|mode|scroll-x|scroll-y)$/.test(k)||/^(aria-|data-)/.test(k))).map(([k,v])=>{
    if(k==='style')v=responsive(v)
    if(k==='src'&&(String(v).startsWith('/images/')||String(v).startsWith('/home/images/')))v='/miniapp'+v
    return k==='disabled'?k:k+'="'+escape(v)+'"'
  }).join(' ')
  return '<'+tag+' '+attrs+'>'+(['img','input'].includes(tag)?'':children+'</'+tag+'>')
}
function cssFor(page) {
  return ['miniapp/app.wxss',page+'.wxss'].map(file=>responsive(compile('wcsc',[...dependencies(file,'wxss')]).replace(/%%\?(-?[\d.]+rpx)\?%%/g,'$1').replace(/%%HERESUFFIX%%/g,'').replace(/\bwx-button\b/g,'button').replace(/\bwx-image\b/g,'img').replace(/\bwx-input\b/g,'input').replace(/\bwx-page\b/g,'body'))).join('\n')
}
function renderGroup(page, states) {
  const context={window:{},console};vm.createContext(context);vm.runInContext(compile('wcc',[...dependencies(page+'.wxml','wxml')]),context)
  const render=context.$gwx(page+'.wxml'),css=cssFor(page)
  for(const [name,data] of Object.entries(states)){
    const body=html(render(data,{}))
    fs.writeFileSync(path.join(output,name+'.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+name+'</title><style>:root{--rpx:calc(100vw / 750)}html,body{margin:0;width:100%;min-height:100%}*{box-sizing:border-box}wx-view,wx-scroll-view{display:block}wx-text{display:inline}wx-scroll-view[scroll-y]{overflow-y:auto}wx-scroll-view[scroll-x]{overflow-x:auto}img{display:inline-block;object-fit:contain}button{display:block;margin:0 auto;padding:0 14px;border:0;border-radius:5px;background:#f8f8f8;text-align:center;font:inherit;line-height:2.555;overflow:hidden;cursor:pointer}button:disabled{opacity:.5}'+css+'</style></head><body>'+body+'</body></html>')
  }
}
async function main(){
  fs.mkdirSync(output,{recursive:true})
  const state=fixture();state.furniture.forEach(i=>{i.owned=true})
  state.room.layout=[['lamp',0,0],['tv',2,0],['bed',5,1],['sofa',0,2],['plant',6,4],['bookshelf',0,4],['desk',3,4],['chair',1,5],['rug',3,2]].map(([id,x,y])=>({id,x,y,rotation:0}))
  const h=roomHarness(state),states={}
  const record=name=>{states[name]=clone(h.page.data)}
  record('01-room')
  h.page.onRoomEdit();h.page.onRoomChoose(tap({id:'sofa'}));record('02-placement')
  h.page.onRoomCancel();h.page.onRoomFurniture(tap({id:'tv'}));h.flush();record('03-television')
  h.page.onRoomTVClose()
  for(const tab of ['outfit','decoration','home']){h.page.setData({tab,items:h.page.data.state.shop.filter(i=>i.kind===tab)});record('04-'+tab)}
  for(const level of [3,4,5]){const home=roomHarness(fixture(level));home.page.setData({tab:'home'});states['04-home-level-'+level]=clone(home.page.data)}
  const empty=roomHarness();states['05-first-home']=clone(empty.page.data)
  renderGroup('miniapp/home/pages/room/room',Object.fromEntries(Object.entries(states).filter(([name])=>!name.startsWith('04-'))))
  renderGroup('miniapp/pages/resident/resident',Object.fromEntries(Object.entries(states).filter(([name])=>name.startsWith('04-'))))
  const mall=await mallHarness(),mallStates={'06-mall':clone(mall.page.data)}
  mall.page.onSelectFurniture(tap({id:'sofa'}));mallStates['07-furniture-detail']=clone(mall.page.data)
  await mall.page.onBuyFurniture();mallStates['08-purchased']=clone(mall.page.data)
  mall.page.onCloseFurniture();mall.page.setData({failed:true});mallStates['09-mall-error']=clone(mall.page.data)
  renderGroup('miniapp/home/pages/mall/mall',mallStates)
  const names=Object.keys(states).concat(Object.keys(mallStates))
  fs.writeFileSync(path.join(output,'index.html'),'<meta charset="utf-8"><h1>小镇商场与立体小家 · 真实模板布局预览</h1><p>本地示例数据，用于布局检查；交互由 Node 行为测试验证。</p>'+names.map(n=>'<p><a href="'+n+'.html">'+n+'</a></p>').join(''))
  console.log('Compiled '+names.length+' real-template scenes in '+output)
  if(process.argv.includes('--serve')){
    const port=Number(process.argv[process.argv.indexOf('--serve')+1])||9434
    http.createServer((req,res)=>{
      const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname))
      if(!(file.startsWith(output+path.sep)||file.startsWith(path.join(root,'miniapp/images')+path.sep)||file.startsWith(path.join(root,'miniapp/home/images')+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return}
      res.setHeader('Content-Type',file.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');fs.createReadStream(file).pipe(res)
    }).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/output/home-preview/index.html'))
  }
}
module.exports={compile,dependencies,cssFor,html,renderGroup}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
