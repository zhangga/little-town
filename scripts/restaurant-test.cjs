const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const bento = require('../miniapp/kitchen/utils/bento')
const { createRestaurantPage } = require('../miniapp/kitchen/utils/restaurant-page')
const clone = bento.clone
const tap = data => ({ type: 'tap', currentTarget: { dataset: data || {} } })
const finger = (data, x, y) => Object.assign(tap(data), { type: 'touch', touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function stateFixture() {
  return { recipes: [], signature_ids: [], recent_services: [], residents: [
    { id: 'abu', name: '阿布', icon: '👦', preference: 'corn', visits: 0, last_dish_name: '', last_feedback: '', order: { id: 'abu-0', kind: 'wish', text: '想吃玉米便当', preferred_ingredient: 'corn', recipe_id: '' } },
    { id: 'taotao', name: '桃桃', icon: '👧', preference: 'strawberry', visits: 0, last_dish_name: '', last_feedback: '', order: { id: 'taotao-0', kind: 'wish', text: '想吃草莓', preferred_ingredient: 'strawberry', recipe_id: '' } },
    { id: 'lin', name: '林奶奶', icon: '👵', preference: 'broccoli', visits: 0, last_dish_name: '', last_feedback: '', order: { id: 'lin-0', kind: 'surprise', text: '你来决定', preferred_ingredient: 'broccoli', recipe_id: '' } }
  ] }
}
function recipe(id = 'recipe-1', dish = bento.addPortion(bento.freshDish(), 'rice')) { return { id, dish: clone(dish), served_count: 0, first_taster: '', last_feedback: '' } }
function mockServer(initial = stateFixture()) {
  const state = clone(initial), receipts = new Map()
  const server = {
    state, receipts, getFailure: false, loseNext: false, hook: null,
    async get() { if (server.getFailure) throw Error('离线了'); return clone(state) },
    async write(method, url, body) {
      if (server.hook) return server.hook(method, url, body)
      if (receipts.has(body.request_id)) return Object.assign(clone(state), clone(receipts.get(body.request_id)))
      const extra = {}
      if (url.endsWith('/recipes')) {
        let saved = state.recipes.find(item => item.id === body.recipe_id)
        if (!saved) { saved = recipe('recipe-' + (state.recipes.length + 1), body.dish); state.recipes.push(saved) }
        saved.dish = clone(body.dish)
        for (const service of state.recent_services) if (!service.recipe_id && bento.sameDish(service.dish, body.dish)) {
          service.recipe_id = saved.id; saved.served_count++; saved.first_taster = saved.first_taster || service.resident_name; saved.last_feedback = service.feedback
        }
        extra.saved_recipe_id = saved.id
      } else if (url.endsWith('/signatures')) {
        state.signature_ids = body.recipe_ids.slice()
        state.residents.forEach(person => { if (person.visits && state.signature_ids.length) { const dish = state.recipes.find(item => item.id === state.signature_ids[0]); person.order = { id: person.id + '-signature-' + person.visits, kind: 'signature', text: '还想吃' + dish.dish.name, preferred_ingredient: person.preference, recipe_id: dish.id } } })
      } else if (url.endsWith('/serve')) {
        const person = state.residents.find(item => item.id === body.resident_id)
        if (!person || person.order.id !== body.order_id) throw Object.assign(Error('订单已变化'), { statusCode: 400 })
        const result = { request_id: body.request_id, resident_id: person.id, resident_name: person.name, recipe_id: body.recipe_id || '', dish: clone(body.dish), feedback: '你还记得我喜欢玉米！小熊饭团真可爱。', preferred: true }
        person.visits++; person.last_dish_name = body.dish.name; person.last_feedback = result.feedback; person.order = { id: person.id + '-' + person.visits, kind: 'surprise', text: '尝尝新作品', recipe_id: '' }
        const saved = state.recipes.find(item => item.id === body.recipe_id)
        if (saved) { saved.served_count++; saved.first_taster = saved.first_taster || person.name; saved.last_feedback = result.feedback }
        state.recent_services.unshift(result); state.recent_services = state.recent_services.slice(0, 12); extra.service_result = result
      }
      receipts.set(body.request_id, clone(extra))
      if (server.loseNext) { server.loseNext = false; throw Error('响应丢失') }
      return Object.assign(clone(state), clone(extra))
    }
  }
  return server
}
async function harness(options = {}) {
  const storage = options.storage || new Map([['token', 'test-token'], ['apiBackend', 'test'], ['userInfo', { id: 1 }]])
  const server = options.server || mockServer(), calls = [], errors = [], messages = []
  const wx = {
    getStorageSync: key => clone(storage.get(key) || ''),
    setStorageSync: (key, value) => { if (wx.failStorage) throw Error('full'); storage.set(key, clone(value)) },
    redirectTo: value => { wx.redirect = value }, navigateBack: () => {}, switchTab: () => {}, stopPullDownRefresh: () => {},
    createSelectorQuery: () => { const query = { in: () => query, select: () => query, boundingClientRect: callback => { query.callback = callback; return query }, exec: () => query.callback({ left: 100, top: 200, width: 200, height: 200 }) }; return query }
  }
  const api = {
    get: async url => { calls.push({ method: 'get', url }); return server.get(url) },
    post: async (url, body) => { calls.push({ method: 'post', url, body: clone(body) }); return server.write('post', url, body) },
    put: async (url, body) => { calls.push({ method: 'put', url, body: clone(body) }); return server.write('put', url, body) }
  }
  const page = createRestaurantPage(api, wx, message => errors.push(message), message => messages.push(message))
  page.data = clone(page.data)
  page.setData = patch => { assert.equal(!!page._disposed, false, 'never setData after unload'); Object.assign(page.data, clone(patch)) }
  page.onLoad()
  if (options.load !== false) await page.onShow()
  return { page, storage, server, calls, errors, messages, wx }
}
function compose(page) {
  page.placeIngredient('rice', { x: 30, y: 32 })
  page.onPortionStyleChange(tap({ style: 'bear' }))
  page.placeIngredient('corn', { x: 70, y: 35 })
  page.placeIngredient('strawberry', { x: 50, y: 70 })
  page.onDecorationChange(tap({ id: 'flower' }))
  page.onNameInput({ detail: { value: '小熊春游便当' } })
}

test('free composition preserves saved positions, repeats ingredients and bounds new round placements', () => {
  const original = bento.freshDish()
  let dish = bento.addPortion(original, 'corn', { x: 100, y: -10 })
  assert.equal(original.portions.length, 0)
  dish = bento.addPortion(dish, 'corn'); assert.equal(dish.portions.length, 2)
  assert.deepEqual(dish.portions[0], { ingredient: 'corn', style: 'plain', x: 85, y: 15 })
  assert.equal(bento.shapePortion(dish, 0, 'bear').portions[0].style, 'plain')
  dish = bento.changeBox(dish, 'box_shape', 'round')
  assert.equal(bento.validateDish(dish), '')
  const edge = { ...dish, portions: [{ ingredient: 'rice', style: 'bear', x: 15, y: 50 }] }
  assert.deepEqual(bento.cleanDish(edge), edge, 'valid server coordinates must never shift')
  for (let i = 0; i < 40; i++) { dish = bento.addPortion(dish, 'egg', { x: i * 7, y: i * 3 }); assert.equal(bento.validateDish(dish), '') }
  assert.equal(dish.portions.length, 8)
})

test('complete create → serve → save → signature → repeat order → reopen flow', async () => {
  const h = await harness(), { page, server } = h
  compose(page); page.onResidentSelect(tap({ id: 'abu' }))
  const composed = clone(page.data.dish)
  await page.onServe()
  assert.equal(page.data.serviceResult.resident_name, '阿布')
  assert.deepEqual(page.data.serviceResult.dish, composed)
  assert.equal(page.data.selectedResident.visits, 1)
  await page.onSaveRecipe()
  const id = page.data.editingRecipeID
  assert.equal(page.data.recipes[0].first_taster, '阿布')
  assert.equal(page.data.recipes[0].served_count, 1)
  page.onOpenRecipeBook(); assert.equal(page.data.serviceResult, null)
  await page.onToggleSignature(tap({ id }))
  assert.equal(page.data.signatureSlots[0].recipe.id, id)
  assert.equal(page.data.selectedResident.order.kind, 'signature')
  page.onNewDish(); page.onLoadOrderRecipe()
  assert.deepEqual(page.data.dish, composed)
  await page.onServe()
  assert.equal(page.data.recipes[0].served_count, 2)
  assert.equal(page.data.selectedResident.visits, 2)
  page.onHide(); page.onUnload()
  const reopened = await harness({ server, storage: h.storage })
  assert.deepEqual(reopened.page.data.dish, composed)
  assert.deepEqual(reopened.page.data.state.signature_ids, [id])
  assert.equal(reopened.page.data.selectedResident.last_dish_name, composed.name)
})

test('tap and drag both place/move food; cancellation and outside drops do not add food', async () => {
  const { page } = await harness()
  page.onIngredientSelect(tap({ id: 'rice' }))
  await page.onBoardTap({ detail: { x: 160, y: 260 } })
  assert.deepEqual(page.data.dish.portions[0], { ingredient: 'rice', style: 'plain', x: 30, y: 30 })
  page.onIngredientTouchStart(finger({ id: 'corn' }, 10, 10))
  page.onPortionTouchMove(finger({}, 240, 330))
  await page.onPortionTouchEnd(finger({}, 240, 330))
  assert.equal(page.data.dish.portions[1].x, 70)
  page.onPortionTouchStart(finger({ index: 0 }, 160, 260))
  page.onPortionTouchMove(finger({}, 280, 360))
  await page.onPortionTouchEnd(finger({}, 280, 360))
  assert.equal(page.data.dish.portions[0].x, 85)
  page.onIngredientTouchStart(finger({ id: 'egg' }, 10, 10)); page.onPortionTouchMove(finger({}, 240, 330)); page.onTouchCancel()
  await page.onPortionTouchEnd(finger({}, 240, 330)); assert.equal(page.data.dish.portions.length, 2)
  page.onIngredientTouchStart(finger({ id: 'egg' }, 10, 10)); page.onPortionTouchMove(finger({}, 50, 50)); await page.onPortionTouchEnd(finger({}, 50, 50))
  assert.equal(page.data.dish.portions.length, 2)
})

test('late gesture measurement cannot change a newly loaded recipe or another account', async () => {
  const { page, storage } = await harness()
  const wait = deferred(); page.measureBoard = () => wait.promise
  page.onIngredientSelect(tap({ id: 'corn' }))
  const placing = page.onBoardTap({ detail: { x: 150, y: 250 } })
  page.onNewDish()
  wait.resolve({ left: 100, top: 200, width: 200, height: 200 }); await placing
  assert.equal(page.data.dish.portions.length, 0)
  const drop = deferred(); page.measureBoard = () => drop.promise
  page.onIngredientTouchStart(finger({ id: 'egg' }, 20, 20)); page.onPortionTouchMove(finger({}, 150, 250))
  const ending = page.onPortionTouchEnd(finger({}, 150, 250))
  storage.set('userInfo', { id: 2 }); await page.onShow()
  drop.resolve({ left: 100, top: 200, width: 200, height: 200 }); await ending
  assert.equal(page.data.dish.portions.length, 0)
})

test('ambiguous creation survives restart and confirms the same request once', async () => {
  const h = await harness(); compose(h.page)
  h.server.loseNext = true; h.server.getFailure = true
  await h.page.onSaveRecipe()
  assert.equal(h.server.state.recipes.length, 1)
  const pending = clone(h.page.data.pending)
  h.page.onNewDish(); assert.equal(h.page.data.dish.name, '小熊春游便当', 'pending operation locks draft edits')
  h.page.onUnload(); h.server.getFailure = false
  const restarted = await harness({ storage: h.storage, server: h.server })
  assert.equal(restarted.page.data.pending.body.request_id, pending.body.request_id)
  assert.equal(h.storage.get('bentoKitchen:test:1').pending.body.request_id, pending.body.request_id, 'restoring dish must not erase pending on disk')
  await restarted.page.onRetryPending()
  assert.equal(restarted.page.data.pending, null)
  assert.equal(h.server.state.recipes.length, 1)
  assert.equal(restarted.calls.find(call => call.method === 'post').body.request_id, pending.body.request_id)
})

test('lost serving response recovers its receipt from recent memories without serving twice', async () => {
  const { page, server, calls } = await harness(); compose(page); page.onResidentSelect(tap({ id: 'abu' }))
  server.loseNext = true; await page.onServe()
  assert.equal(page.data.pending, null)
  assert.equal(page.data.serviceResult.resident_name, '阿布')
  assert.equal(server.state.residents[0].visits, 1)
  assert.equal(calls.filter(call => call.method === 'post').length, 1)
})

test('rejected stale order clears pending and refreshes the actual order', async () => {
  const { page, server } = await harness(); compose(page); page.onResidentSelect(tap({ id: 'abu' }))
  server.state.residents[0].order.id = 'abu-new'
  await page.onServe()
  assert.equal(page.data.pending, null); assert.equal(page.data.busy, false)
  assert.equal(page.data.selectedResident.order.id, 'abu-new')
  assert.match(page.data.error, /订单/)
})

test('rapid serving taps share one in-flight mutation and cannot edit its snapshot', async () => {
  const { page, server, calls } = await harness(); compose(page); page.onResidentSelect(tap({ id: 'abu' }))
  const gate = deferred(); server.hook = () => gate.promise
  const sending = page.onServe(); page.onServe(); page.onNameInput({ detail: { value: '不该改名' } })
  assert.equal(calls.filter(call => call.method === 'post').length, 1)
  assert.equal(page.data.dish.name, '小熊春游便当')
  gate.resolve({ ...server.state, service_result: { request_id: 'test', resident_name: '阿布', dish: clone(page.data.dish), feedback: '谢谢' } }); await sending
  assert.equal(page.data.busy, false)
})

test('editing recipe copies cannot mutate saved preview; signature serve uses ordered recipe ID', async () => {
  const initial = stateFixture(), dish = bento.addPortion(bento.freshDish(), 'corn')
  initial.recipes = [recipe('a', dish), recipe('b', dish)]; initial.signature_ids = ['a']
  initial.residents[0].order = { id: 'abu-signature', kind: 'signature', recipe_id: 'a' }
  const { page, calls } = await harness({ server: mockServer(initial) })
  page.onResidentSelect(tap({ id: 'abu' })); page.onLoadRecipe(tap({ id: 'b' }))
  page.onDecorationChange(tap({ id: 'star' }))
  assert.equal(page.data.recipes[1].dish.decoration, 'none')
  await page.onServe(); assert.equal(calls.filter(call => call.method === 'post').length, 0)
  page.onDecorationChange(tap({ id: 'none' })); await page.onServe()
  assert.equal(calls.find(call => call.method === 'post').body.recipe_id, 'a')
})

test('full signature menu offers explicit replacement and retains all recipe cards', async () => {
  const initial = stateFixture(); initial.recipes = ['a', 'b', 'c', 'd'].map(id => recipe(id)); initial.signature_ids = ['a', 'b', 'c']
  const { page, calls } = await harness({ server: mockServer(initial) })
  await page.onToggleSignature(tap({ id: 'd' }))
  assert.equal(page.data.replacingRecipe.id, 'd'); assert.equal(calls.filter(call => call.method === 'put').length, 0)
  await page.onReplaceSignature(tap({ id: 'b' }))
  assert.deepEqual(page.data.state.signature_ids, ['a', 'd', 'c']); assert.equal(page.data.recipes.length, 4)
  await page.onToggleSignature(tap({ id: 'd' })); assert.deepEqual(page.data.state.signature_ids, ['a', 'c'])
})

test('storage-full retry keeps an ambiguous request locked and never sends another ID', async () => {
  const { page, server, wx, calls } = await harness(); compose(page)
  server.loseNext = true; server.getFailure = true; await page.onSaveRecipe()
  const id = page.data.pending.body.request_id
  wx.failStorage = true; await page.onRetryPending()
  assert.equal(page.data.pending.body.request_id, id)
  assert.equal(calls.filter(call => call.method === 'post').length, 1)
  assert.equal(page.data.busy, false)
})

test('pending updates require their write receipt even if GET composition already matches', async () => {
  const initial = stateFixture(); initial.recipes = [recipe('a')]
  const { page, server } = await harness({ server: mockServer(initial) })
  page.onLoadRecipe(tap({ id: 'a' })); server.loseNext = true
  await page.onSaveRecipe(); assert.ok(page.data.pending)
  await page.onRetryPending(); assert.equal(page.data.pending, null)
})

test('account changes discard stale reads/writes and keep drafts separate', async () => {
  const { page, storage, server } = await harness(); compose(page)
  const gate = deferred(); server.hook = () => gate.promise
  const saving = page.onSaveRecipe()
  storage.set('userInfo', { id: 2 }); await page.onShow()
  assert.equal(page.data.busy, false); assert.equal(page.data.pending, null)
  assert.equal(page.data.dish.portions.length, 0)
  gate.resolve({ ...stateFixture(), saved_recipe_id: 'wrong-account' }); await saving
  assert.equal(page.data.editingRecipeID, '')
  assert.equal(storage.get('bentoKitchen:test:1').pending.kind, 'save')
  const oldRead = deferred(), newRead = deferred(); let requests = 0
  server.get = () => ++requests === 1 ? oldRead.promise : newRead.promise
  const first = page.loadRestaurant()
  storage.set('userInfo', { id: 3 }); const second = page.onShow()
  oldRead.resolve({ ...stateFixture(), recipes: [recipe('old-user')] }); await first
  assert.ok(page._loadPromise, 'old request must not clear the current account load')
  newRead.resolve(stateFixture()); await second
  assert.equal(page.data.recipes.length, 0)
})

test('unloaded page ignores a late write while pending request remains recoverable', async () => {
  const { page, server, storage } = await harness(); compose(page)
  const gate = deferred(); server.hook = () => gate.promise
  const saving = page.onSaveRecipe(); page.onUnload()
  gate.resolve({ ...stateFixture(), saved_recipe_id: 'later' }); await saving
  assert.ok(storage.get('bentoKitchen:test:1').pending)
})

test('A → B → A cannot revive stale reads or clear a newer pending write', async () => {
  const { page, server, storage } = await harness()
  const oldRead = deferred(); let reads = 0
  server.get = () => ++reads === 1 ? oldRead.promise : Promise.resolve(stateFixture())
  const reading = page.loadRestaurant()
  storage.set('userInfo', { id: 2 }); await page.onShow()
  storage.set('userInfo', { id: 1 }); await page.onShow()
  oldRead.resolve({ ...stateFixture(), recipes: [recipe('stale')] }); await reading
  assert.equal(page.data.recipes.length, 0)
  compose(page)
  const oldWrite = deferred(), newWrite = deferred(); let writes = 0
  server.hook = () => ++writes === 1 ? oldWrite.promise : newWrite.promise
  const writing = page.onSaveRecipe()
  storage.set('userInfo', { id: 2 }); await page.onShow()
  storage.set('userInfo', { id: 1 }); await page.onShow()
  const retrying = page.onRetryPending(), pendingID = page.data.pending.body.request_id
  oldWrite.resolve({ ...stateFixture(), saved_recipe_id: 'old-response' }); await writing
  assert.equal(page.data.busy, true)
  assert.equal(page.data.pending.body.request_id, pendingID)
  newWrite.resolve({ ...stateFixture(), saved_recipe_id: 'confirmed' }); await retrying
  assert.equal(page.data.editingRecipeID, 'confirmed'); assert.equal(page.data.busy, false)
})

test('actual page bindings and kitchen registration connect all flow controls', () => {
  const root = path.join(__dirname, '..', 'miniapp'), config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.ok(config.subpackages.some(item => item.root === 'kitchen' && item.pages.includes('pages/restaurant/restaurant')))
  const def = createRestaurantPage({}, {}, () => {})
  for (const file of ['kitchen/pages/restaurant/restaurant.wxml', 'kitchen/templates/bento.wxml']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    for (const match of source.matchAll(/(?:bind|catch)(?:tap|input|touchstart|touchmove|touchend|touchcancel)="([^"]+)"/g)) assert.equal(typeof def[match[1]], 'function', 'missing UI handler ' + match[1])
    assert.doesNotMatch(source, /touchcancel="onPortionTouchEnd"/)
  }
  assert.match(fs.readFileSync(path.join(root, 'templates/building-interior.wxml'), 'utf8'), /bindtap="onOpenBentoKitchen"/)
})

module.exports = { harness, mockServer, stateFixture, compose, tap }
