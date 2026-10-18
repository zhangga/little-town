const directions = ['down', 'up', 'left', 'right']
const outfits = ['everyday', 'builder', 'gardener', 'explorer']

function strollArt(actor, direction) {
  const column = Math.max(0, directions.indexOf(direction))
  const pet = actor.type === 'pet'
  const row = pet ? actor.petId === 'cat' ? 1 : 0 : Math.max(0, outfits.indexOf(actor.outfit))
  return {
    src: pet ? '/images/resident/pet-directions.png' : '/images/resident/walk-directions.png',
    scale: 400, scaleY: pet ? 200 : 400, x: -column * 100, y: -row * 100
  }
}

module.exports = { strollArt }
