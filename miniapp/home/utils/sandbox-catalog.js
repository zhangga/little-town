// Shared by the simulation, renderer and inventory. One block is one metre.
const blocks = {
  grass: { name: '草方块', color: 0x6e9e49, top: 0x7d9d50, side: 0x90714f, hardness: .45 },
  dirt: { name: '泥土', color: 0x997453, hardness: .35 },
  stone: { name: '石头', color: 0x92958a, hardness: .85 },
  bedrock: { name: '黑色基岩', color: 0x171c22, hardness: Infinity, unbreakable: true },
  log: { name: '原木', color: 0x8c623d, top: 0xc09a60, hardness: .7 },
  leaves: { name: '树叶', color: 0x638b45, wind: true, hardness: .2 },
  plank: { name: '橡木板', color: 0xc49a60, top: 0xd7b47b, hardness: .45 },
  stair: { name: '橡木楼梯', color: 0xb88a50, hardness: .45 },
  brick: { name: '石砖', color: 0xa6a491, hardness: .9 },
  glass: { name: '玻璃', color: 0xb7dce0, transparent: true, hardness: .25 },
  white_glass: { name: '白玻璃', color: 0xe8f0e7, transparent: true, hardness: .3 },
  mirror: { name: '银镜', color: 0xc9dbdd, hardness: .35 },
  water: { name: '缓流河水', color: 0x619e99, liquid: true, transparent: true, unbreakable: true, hardness: Infinity },
  sand: { name: '细沙', color: 0xdfc78e, hardness: .3 },
  coal: { name: '煤矿', color: 0x71756d, ore: 0x303b39, hardness: 1 },
  iron: { name: '铁矿', color: 0x96968a, ore: 0xd4a779, hardness: 1.1 },
  copper: { name: '铜矿', color: 0x8e9384, ore: 0xc98d5e, hardness: 1 },
  quartz: { name: '石英矿', color: 0x909991, ore: 0xe8efe3, hardness: .95 },
  silver: { name: '银矿', color: 0x838e91, ore: 0xd8e9ed, hardness: 1.2 },
  fluorite: { name: '萤石矿', color: 0x718d84, ore: 0x9ee5c8, glow: true, hardness: 1.1 },
  amethyst: { name: '紫晶矿', color: 0x87809a, ore: 0xd6a6f2, hardness: 1.15 },
  moonstone: { name: '月纹石', color: 0x9cb7b6, ore: 0xe6f6cf, hardness: 1.1 },
  echo: { name: '回声方块', color: 0x507c88, ore: 0x85e1d1, hardness: 1.3 },
  glow: { name: '萤光石', color: 0xcadf88, ore: 0xfcf6bc, glow: true, hardness: .65 },
  aether: { name: '星苔方块', color: 0x557b82, top: 0x86d3bf, hardness: .45 },
  violet: { name: '暮紫木', color: 0x997d9f, top: 0xd4afc7, hardness: .6 },
  crystal: { name: '晶叶方块', color: 0x8fb6cd, wind: true, hardness: .25 },
  door: { name: '木门', color: 0x9e713e, hardness: .65, door: true },
  frame: { name: '星门框', color: 0x374958, ore: 0xa3d3c0, hardness: 1.5 }
}
Object.setPrototypeOf(blocks, null)
const recipes = [
  { id: 'plank', name: '锯成木板', description: '1 原木 → 4 橡木板', cost: { log: 1 }, output: 'plank', count: 4 },
  { id: 'brick', name: '砌成石砖', description: '4 石头 → 4 石砖', cost: { stone: 4 }, output: 'brick', count: 4 },
  { id: 'glass', name: '烧制玻璃', description: '2 细沙 + 1 煤矿 → 2 玻璃', cost: { sand: 2, coal: 1 }, output: 'glass', count: 2 },
  { id: 'white_glass', name: '合成白玻璃', description: '2 玻璃 + 1 石英矿 → 1 白玻璃 · 映出天光', cost: { glass: 2, quartz: 1 }, output: 'white_glass', count: 1 },
  { id: 'mirror', name: '制作银镜', description: '1 玻璃 + 2 银矿 → 1 银镜 · 带回家自由摆放', cost: { glass: 1, silver: 2 }, output: 'mirror', count: 1 },
  { id: 'door', name: '制作木门', description: '4 橡木板 → 1 扇木门', cost: { plank: 4 }, output: 'door', count: 1 },
  { id: 'stair', name: '制作楼梯', description: '3 橡木板 → 4 橡木楼梯', cost: { plank: 3 }, output: 'stair', count: 4 },
  { id: 'frame', name: '合成星门框', description: '2 月纹石 + 1 紫晶矿 → 2 星门框', cost: { moonstone: 2, amethyst: 1 }, output: 'frame', count: 2 },
  { id: 'portal', name: '合成星门', description: '10 星门框 + 2 回声方块 + 1 萤光石', cost: { frame: 10, echo: 2, glow: 1 }, output: 'portal', count: 1 },
  { id: 'cottage', name: '林地小屋图纸', description: '32 橡木板 + 12 石头 + 4 玻璃 · 5×5 / 1 层', cost: { plank: 32, stone: 12, glass: 4 }, output: 'cottage', count: 1 },
  { id: 'tower', name: '双层木屋图纸', description: '64 橡木板 + 24 石头 + 8 玻璃 · 7×7 / 2 层', cost: { plank: 64, stone: 24, glass: 8 }, output: 'tower', count: 1 }
]
const special = {
  portal: { name: '星门', color: 0x81c8bd },
  cottage: { name: '小屋图纸', color: 0xc49a60 },
  tower: { name: '双层屋图纸', color: 0xb48c65 }
}
const species = {
  sheep: { name: '绵羊', color: 0xf3ead5, face: 0xa49a82, sound: '咩——小羊低头闻了闻你的手。' },
  pig: { name: '小猪', color: 0xe4a39b, face: 0xd68e89, sound: '哼哼，小猪摇着尾巴跑过来。' },
  rabbit: { name: '兔子', color: 0xc5b29a, face: 0xe5d8c1, sound: '小兔竖起耳朵，蹦了两下。' },
  chicken: { name: '母鸡', color: 0xeee5c9, face: 0xe6b660, sound: '咯咯哒！母鸡正在草地找种子。' },
  fox: { name: '狐狸', color: 0xc88650, face: 0xf4dbad, sound: '狐狸抖抖蓬松的大尾巴，好奇地看着你。' },
  deer: { name: '小鹿', color: 0xba9972, face: 0xe1c89e, sound: '小鹿慢慢靠近，轻轻碰了碰你。' },
  sprite: { name: '跳跳方灵', color: 0x8acbb1, face: 0xd6f5d4, sound: '方灵发出叮叮声，在你身边弹跳。' },
  stag: { name: '星角兽', color: 0xb8a6d3, face: 0xd5eedf, sound: '星角兽的晶角亮了起来，像一小片星空。' },
  moth: { name: '晶翼蝶', color: 0xb4dbe6, face: 0xe5d2e9, sound: '晶翼蝶扇动方块翅膀，落下点点星光。' }
}
function item(id) { return blocks[id] || special[id] }
function hex(color) { return '#' + color.toString(16).padStart(6, '0') }
module.exports = { blocks, recipes, special, species, item, hex }
