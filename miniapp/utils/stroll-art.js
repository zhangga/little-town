const directions = ['down', 'up', 'left', 'right']
const outfits = ['everyday', 'builder', 'gardener', 'explorer']
const villagers = ['grandpa', 'grandma', 'adult', 'child']

function strollArt(actor, direction) {
  const column = Math.max(0, directions.indexOf(direction))
  const pet = actor.type === 'pet'
  const villager = !pet && !!actor.villager
  const row = pet ? actor.petId === 'cat' ? 1 : 0 : Math.max(0, (villager ? villagers : outfits).indexOf(villager ? actor.villager : actor.outfit))
  return {
    src: pet ? '/images/resident/pet-directions.png' : villager ? '/images/resident/villager-directions.png' : '/images/resident/walk-directions.png',
    scale: 400, scaleY: pet ? 200 : 400, x: -column * 100, y: -row * 100
  }
}

module.exports = { strollArt }
