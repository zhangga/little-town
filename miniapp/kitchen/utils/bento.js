// Canonical recipe data lives here; the page adds no display-only fields to a saved dish.
const ingredients = [
  { id: 'rice', name: '米饭', icon: '🍚', english: 'rice' },
  { id: 'egg', name: '鸡蛋', icon: '🥚', english: 'egg' },
  { id: 'broccoli', name: '西兰花', icon: '🥦', english: 'broccoli' },
  { id: 'corn', name: '玉米', icon: '🌽', english: 'corn' },
  { id: 'carrot', name: '胡萝卜', icon: '🥕', english: 'carrot' },
  { id: 'strawberry', name: '草莓', icon: '🍓', english: 'strawberry' }
]
const boxShapes = [{ id: 'square', name: '方方盒' }, { id: 'round', name: '圆圆盒' }]
const boxColors = [{ id: 'peach', name: '蜜桃粉' }, { id: 'mint', name: '薄荷绿' }, { id: 'sunshine', name: '暖阳黄' }]
const decorations = [{ id: 'none', name: '原味', icon: '○' }, { id: 'sesame', name: '芝麻', icon: '⁙' }, { id: 'flower', name: '小花', icon: '🌼' }, { id: 'star', name: '星星', icon: '⭐' }]
const clone = value => JSON.parse(JSON.stringify(value))
const includes = (items, id) => items.some(item => item.id === id)
function freshDish() { return { name: '我的缤纷便当', box_shape: 'square', box_color: 'peach', decoration: 'none', portions: [] } }
function position(shape, x, y) {
  x = Math.max(15, Math.min(85, Number.isFinite(Number(x)) ? Number(x) : 50))
  y = Math.max(15, Math.min(85, Number.isFinite(Number(y)) ? Number(y) : 50))
  const length = Math.hypot(x - 50, y - 50)
  // Leave a small rounding margin so server-side radius checks also hold.
  if (shape === 'round' && length > 34.9) { x = 50 + (x - 50) * 34.9 / length; y = 50 + (y - 50) * 34.9 / length }
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }
}
function validStyle(ingredient, style) { return style === 'plain' || (ingredient === 'rice' && style === 'bear') || (ingredient === 'egg' && style === 'star') }
function cleanDish(value) {
  const dish = freshDish()
  if (!value || typeof value !== 'object') return dish
  if (typeof value.name === 'string') dish.name = Array.from(value.name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')).slice(0, 16).join('')
  if (includes(boxShapes, value.box_shape)) dish.box_shape = value.box_shape
  if (includes(boxColors, value.box_color)) dish.box_color = value.box_color
  if (includes(decorations, value.decoration)) dish.decoration = value.decoration
  dish.portions = (Array.isArray(value.portions) ? value.portions : []).filter(item => item && includes(ingredients, item.ingredient)).slice(0, 8).map(item => {
    const inside = Number.isFinite(item.x) && Number.isFinite(item.y) && item.x >= 15 && item.x <= 85 && item.y >= 15 && item.y <= 85 && (dish.box_shape !== 'round' || Math.hypot(item.x - 50, item.y - 50) <= 35)
    return Object.assign({ ingredient: item.ingredient, style: validStyle(item.ingredient, item.style) ? item.style : 'plain' }, inside ? { x: item.x, y: item.y } : position(dish.box_shape, item.x, item.y))
  })
  return dish
}
function namedDish(dish) { const next = cleanDish(dish); next.name = next.name.trim() || suggestions(next)[0]; return next }
function addPortion(dish, ingredient, at) {
  const next = cleanDish(dish)
  if (!includes(ingredients, ingredient) || next.portions.length >= 8) return next
  const spots = [[30, 30], [70, 30], [30, 70], [70, 70], [50, 50], [50, 20], [20, 50], [80, 50]]
  const spot = spots[next.portions.length]
  next.portions.push(Object.assign({ ingredient, style: 'plain' }, position(next.box_shape, at ? at.x : spot[0], at ? at.y : spot[1])))
  return next
}
function movePortion(dish, index, x, y) {
  const next = cleanDish(dish)
  if (next.portions[index]) Object.assign(next.portions[index], position(next.box_shape, x, y))
  return next
}
function removePortion(dish, index) { const next = cleanDish(dish); if (next.portions[index]) next.portions.splice(index, 1); return next }
function shapePortion(dish, index, style) {
  const next = cleanDish(dish), portion = next.portions[index]
  if (portion && validStyle(portion.ingredient, style)) portion.style = style
  return next
}
function changeBox(dish, key, id) {
  const next = cleanDish(dish)
  const values = { box_shape: boxShapes, box_color: boxColors, decoration: decorations }
  if (values[key] && includes(values[key], id)) next[key] = id
  return cleanDish(next)
}
function suggestions(dish) {
  const portions = dish.portions || []
  const names = []
  if (portions.some(item => item.style === 'bear')) names.push('小熊春游便当')
  if (portions.some(item => item.style === 'star') || dish.decoration === 'star') names.push('星星许愿便当')
  if (portions.some(item => item.ingredient === 'strawberry')) names.push('草莓花园便当')
  if (portions.some(item => item.ingredient === 'corn')) names.push('金灿灿玉米便当')
  if (portions.some(item => item.ingredient === 'broccoli')) names.push('小森林便当')
  return [...new Set(names.concat(['彩虹野餐便当', '今天的好心情']))].slice(0, 3)
}
function sameDish(left, right, includeName = true) {
  const a = cleanDish(left), b = cleanDish(right)
  if (!includeName) { a.name = ''; b.name = '' }
  return JSON.stringify(a) === JSON.stringify(b)
}
function validateDish(dish) {
  if (!dish || !Array.isArray(dish.portions) || !dish.portions.length) return '先往便当盒里放一点喜欢的食物吧'
  if (dish.portions.length > 8) return '一盒最多放 8 份食物，可以换一换搭配'
  if (typeof dish.name !== 'string' || !dish.name.trim() || Array.from(dish.name.trim()).length > 16 || /[\u0000-\u001f\u007f-\u009f]/.test(dish.name)) return '给便当起一个 1～16 个字的名字吧'
  if (!includes(boxShapes, dish.box_shape) || !includes(boxColors, dish.box_color) || !includes(decorations, dish.decoration)) return '重新选一个便当盒和装饰吧'
  for (const item of dish.portions) {
    if (!includes(ingredients, item.ingredient) || !validStyle(item.ingredient, item.style) || !Number.isFinite(item.x) || !Number.isFinite(item.y) || item.x < 15 || item.x > 85 || item.y < 15 || item.y > 85 || (dish.box_shape === 'round' && Math.hypot(item.x - 50, item.y - 50) > 35)) return '把食物放回便当盒里，再试一次吧'
  }
  return ''
}
function presentState(state, selectedID) {
  const signatureIDs = state.signature_ids || []
  const recipes = (state.recipes || []).map(recipe => Object.assign({}, recipe, { dish: cleanDish(recipe.dish), signature: signatureIDs.indexOf(recipe.id) >= 0 }))
  const residents = (state.residents || []).map(resident => Object.assign({}, resident, { selected: resident.id === selectedID }))
  return { recipes, residents, selectedResident: residents.find(item => item.id === selectedID) || null,
    signatureSlots: [0, 1, 2].map(index => { const recipe = recipes.find(item => item.id === signatureIDs[index]) || null; return { slot: index + 1, id: recipe ? recipe.id : '', recipe } }) }
}

module.exports = { ingredients, boxShapes, boxColors, decorations, clone, freshDish, cleanDish, namedDish, position, addPortion, movePortion, removePortion, shapePortion, changeBox, suggestions, sameDish, validateDish, presentState }
