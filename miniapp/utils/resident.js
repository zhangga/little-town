const { townSprite } = require('./assets')
const outfits = ['everyday', 'builder', 'gardener', 'explorer']
function art(src, index, columns) {
  return { src, scale: columns * 100, x: -(index % columns) * 100, y: -Math.floor(index / columns) * 100 }
}
function residentArt(outfit, pose) {
  return art('/images/resident/resident-atlas.png', Math.max(0, outfits.indexOf(outfit)) * 4 + (pose || 0), 4)
}
function homeArt(level) { return art('/images/resident/home-atlas.png', Math.max(0, Math.min(2, level - 1)), 2) }
function decorationArt(id) {
  if (id === 'flowers') return art('/images/resident/home-atlas.png', 3, 2)
  if (id === 'flag' || id === 'trees') return Object.assign({ src: '/images/town/voxel-atlas.png', scale: 400 }, townSprite(id === 'flag' ? '旗帜' : '树林'))
  return null
}
function presentResident(state) {
  const r = state.resident
  return Object.assign({}, state, {
    characterArt: residentArt(r.outfit_id), homeArt: homeArt(r.home_level),
    nextHomeArt: state.home.next_level ? homeArt(state.home.next_level) : null,
    gardenArt: decorationArt(r.decoration_id),
    xpPercent: r.xp_needed ? Math.min(100, Math.floor(r.xp_current / r.xp_needed * 100)) : 100,
    dailyPercent: Math.min(100, Math.floor(state.daily.completed / state.daily.goal * 100)),
    shop: state.shop.map(item => Object.assign({}, item, {
      art: item.kind === 'outfit' ? residentArt(item.id, 1) : decorationArt(item.id),
      affordable: state.wallet.coins >= item.price,
      missing: Math.max(0, item.price - state.wallet.coins)
    }))
  })
}
function saveWallet(wallet) {
  const user = wx.getStorageSync('userInfo')
  if (user) wx.setStorageSync('userInfo', Object.assign({}, user, wallet))
}
module.exports = { residentArt, homeArt, decorationArt, presentResident, saveWallet }
