const bento = require('./bento')
const { supplyRequestID } = require('../../utils/town-shop')

function createRestaurantPage(api, wxApi, showError = () => {}, showSuccess = () => {}) {
  const eventID = event => event && event.currentTarget && event.currentTarget.dataset || {}
  const touch = event => {
    const point = (event.changedTouches && event.changedTouches[0]) || (event.touches && event.touches[0]) || event.detail || {}
    return { x: Number(point.clientX === undefined ? point.x : point.clientX), y: Number(point.clientY === undefined ? point.y : point.clientY) }
  }
  function identity() {
    const user = wxApi.getStorageSync('userInfo') || {}
    return user.id ? 'bentoKitchen:' + (wxApi.getStorageSync('apiBackend') || 'local') + ':' + user.id : ''
  }
  return {
    data: {
      loading: true, error: '', failed: false, busy: false, pending: null, state: null, tab: 'kitchen',
      dish: bento.freshDish(), ingredientOptions: bento.clone(bento.ingredients), boxShapes: bento.clone(bento.boxShapes), boxColors: bento.clone(bento.boxColors), decorations: bento.clone(bento.decorations),
      selectedIngredient: '', selectedPortionIndex: -1, selectedPortion: null, residents: [], selectedResident: null,
      recipes: [], signatureSlots: [1, 2, 3].map(slot => ({ slot, id: '', recipe: null })),
      nameSuggestions: bento.suggestions(bento.freshDish()), serviceResult: null, editingRecipeID: '', replacingRecipe: null,
      dragging: false, dragIcon: '', dragX: 0, dragY: 0
    },
    onLoad() {
      this._visible = true
      this._identity = identity()
      this._identityEpoch = (this._identityEpoch || 0) + 1
      if (!wxApi.getStorageSync('token')) { wxApi.redirectTo({ url: '/pages/login/login' }); return }
      this.restoreDraft()
    },
    onShow() {
      this._visible = true
      if (!wxApi.getStorageSync('token')) return
      if (this._identity !== identity()) {
        this.stopDrag()
        this._identity = identity(); this._selectedResidentID = ''
        this._identityEpoch = (this._identityEpoch || 0) + 1
        this._loadPromise = null
        this.setData({ loading: true, busy: false, dish: bento.freshDish(), pending: null, editingRecipeID: '', state: null, serviceResult: null, recipes: [], residents: [], signatureSlots: [1, 2, 3].map(slot => ({ slot, id: '', recipe: null })), selectedResident: null, selectedPortionIndex: -1, selectedPortion: null, selectedIngredient: '', ingredientOptions: bento.clone(bento.ingredients), replacingRecipe: null })
        this.restoreDraft()
      }
      return this.loadRestaurant()
    },
    onHide() { this._visible = false; this.stopDrag(); this.persistDraft() },
    onUnload() { this.persistDraft(); this._disposed = true; this._visible = false; this._drag = null },
    onPullDownRefresh() { return this.loadRestaurant().finally(() => wxApi.stopPullDownRefresh()) },
    onPageScroll() { this._boardRect = null },
    current() { return !this._disposed && (this._identity === undefined || this._identity === identity()) },
    sameSession(owner, epoch) { return this.current() && owner === this._identity && epoch === this._identityEpoch },
    canEdit() { return this.current() && this._visible !== false && !this.data.busy && !this.data.pending && !this.data.loading && !!this.data.state },
    restoreDraft() {
      if (!this._identity) return
      const saved = wxApi.getStorageSync(this._identity)
      if (!saved || saved.version !== 1) return
      this._restoring = true
      this._selectedResidentID = saved.resident_id || ''
      this.setDish(saved.dish, { editingRecipeID: typeof saved.recipe_id === 'string' ? saved.recipe_id : '' })
      const pending = saved.pending
      if (pending && ['save', 'serve', 'signatures'].includes(pending.kind) && pending.body && typeof pending.body.request_id === 'string') {
        const paths = { save: '/restaurant/recipes', serve: '/restaurant/serve', signatures: '/restaurant/signatures' }
        this.setData({ pending: Object.assign({}, pending, { path: paths[pending.kind], method: pending.kind === 'signatures' ? 'put' : 'post', message: '上次操作还在确认，便当和进度都为你留好了。' }) })
      }
      this._restoring = false
    },
    persistDraft(strict = false) {
      if (!this.current() || !this._identity || this._restoring) return
      try {
        wxApi.setStorageSync(this._identity, { version: 1, dish: bento.cleanDish(this.data.dish), recipe_id: this.data.editingRecipeID, resident_id: this._selectedResidentID || '', pending: this.data.pending })
      } catch (err) {
        if (strict) throw new Error('本机草稿暂时存不下，请清理一点空间再试')
      }
    },
    setDish(dish, extra = {}) {
      this._dishRevision = (this._dishRevision || 0) + 1
      const clean = bento.cleanDish(dish)
      const index = extra.selectedPortionIndex === undefined ? this.data.selectedPortionIndex : extra.selectedPortionIndex
      this.setData(Object.assign({ dish: clean, nameSuggestions: bento.suggestions(clean), selectedPortion: clean.portions[index] || null, selectedPortionIndex: clean.portions[index] ? index : -1, error: '' }, extra))
      this.persistDraft()
    },
    applyState(state) {
      if (!this.current()) return
      this.setData(Object.assign({ state, loading: false, failed: false, error: '' }, bento.presentState(state, this._selectedResidentID)))
      if (this.data.editingRecipeID && !this.data.recipes.some(recipe => recipe.id === this.data.editingRecipeID)) this.setData({ editingRecipeID: '' })
    },
    async loadRestaurant() {
      if (this._loadPromise) return this._loadPromise
      if (this.data.busy || !this.current()) return
      const owner = this._identity, epoch = this._identityEpoch
      this.setData({ loading: !this.data.state, failed: false, error: '' })
      const load = api.get('/restaurant').then(state => {
        if (!this.sameSession(owner, epoch)) return
        this.applyState(state)
        this.recoverPending(state)
      }).catch(err => {
        if (this.sameSession(owner, epoch)) this.setData({ loading: false, failed: !this.data.state, error: err.message || '餐厅暂时没连上，便当草稿还在。' })
      }).finally(() => { if (this._loadPromise === load) this._loadPromise = null })
      this._loadPromise = load
      return load
    },
    onRetry() { return this.loadRestaurant() },
    explain(message) { if (this.current()) { this.setData({ error: message }); showError(message) } },
    onTabChange(event) {
      const tab = eventID(event).tab
      if (['kitchen', 'menu'].includes(tab) && !this.data.busy) { this.stopDrag(); this.setData({ tab }); this._boardRect = null }
    },
    onResidentSelect(event) {
      if (!this.canEdit()) return
      const id = eventID(event).id
      if (!this.data.residents.some(item => item.id === id)) return
      this._selectedResidentID = id
      this.setData(Object.assign({ serviceResult: null, error: '' }, bento.presentState(this.data.state, id)))
      this.persistDraft()
    },
    onLoadOrderRecipe() {
      const resident = this.data.selectedResident
      if (resident && resident.order && resident.order.recipe_id) this.onLoadRecipe({ currentTarget: { dataset: { id: resident.order.recipe_id } } })
    },
    onIngredientSelect(event) {
      if (!this.canEdit() || Date.now() < (this._ignoreTapUntil || 0)) return
      const id = eventID(event).id
      if (!bento.ingredients.some(item => item.id === id)) return
      const selected = this.data.selectedIngredient === id ? '' : id
      this.setData({ selectedIngredient: selected, selectedPortionIndex: -1, selectedPortion: null, ingredientOptions: bento.ingredients.map(item => Object.assign({}, item, { selected: item.id === selected })), error: '' })
    },
    measureBoard() {
      return new Promise(resolve => {
        if (!wxApi.createSelectorQuery) { resolve(this._boardRect || null); return }
        let query = wxApi.createSelectorQuery()
        if (query.in) query = query.in(this)
        query.select('#bento-board').boundingClientRect(rect => { this._boardRect = rect || null; resolve(this._boardRect) }).exec()
      })
    },
    async onBoardTap(event) {
      if (!this.canEdit() || Date.now() < (this._ignoreTapUntil || 0)) return
      const point = touch(event), ingredient = this.data.selectedIngredient, index = this.data.selectedPortionIndex, owner = this._identity, epoch = this._identityEpoch, revision = this._dishRevision
      if (!ingredient && index < 0) return
      const rect = await this.measureBoard()
      if (!this.canEdit() || !this.sameSession(owner, epoch) || revision !== this._dishRevision || ingredient !== this.data.selectedIngredient || index !== this.data.selectedPortionIndex || !rect || !rect.width || !rect.height || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return
      const at = { x: (point.x - rect.left) / rect.width * 100, y: (point.y - rect.top) / rect.height * 100 }
      if (ingredient) this.placeIngredient(ingredient, at)
      else this.setDish(bento.movePortion(this.data.dish, index, at.x, at.y))
    },
    placeIngredient(id, at) {
      if (this.data.dish.portions.length >= 8) { this.explain('一盒最多放 8 份食物，选中已有食物可以换掉或拿走。'); return }
      const dish = bento.addPortion(this.data.dish, id, at)
      this.setDish(dish, { selectedPortionIndex: dish.portions.length - 1, selectedPortion: dish.portions[dish.portions.length - 1], selectedIngredient: '', ingredientOptions: bento.clone(bento.ingredients) })
    },
    onPortionTap(event) {
      if (!this.canEdit() || Date.now() < (this._ignoreTapUntil || 0)) return
      const index = Number(eventID(event).index), portion = this.data.dish.portions[index]
      if (portion) this.setData({ selectedPortionIndex: index, selectedPortion: portion, selectedIngredient: '', ingredientOptions: bento.clone(bento.ingredients), error: '' })
    },
    startDrag(event, ingredient, index) {
      if (!this.canEdit()) return
      const point = touch(event)
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
      this._drag = { ingredient, index, start: point, last: point, moved: false, owner: this._identity, epoch: this._identityEpoch, revision: this._dishRevision, rect: this.measureBoard() }
    },
    onIngredientTouchStart(event) {
      const id = eventID(event).id
      if (bento.ingredients.some(item => item.id === id)) this.startDrag(event, id, -1)
    },
    onPortionTouchStart(event) {
      const index = Number(eventID(event).index), portion = this.data.dish.portions[index]
      if (portion) this.startDrag(event, portion.ingredient, index)
    },
    onPortionTouchMove(event) {
      const drag = this._drag
      if (!drag || !this.canEdit()) return
      const point = touch(event)
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
      drag.last = point
      if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 6 && !drag.moved) return
      drag.moved = true
      this.setData({ dragging: true, dragIcon: bento.ingredients.find(item => item.id === drag.ingredient).icon, dragX: point.x, dragY: point.y })
    },
    async onPortionTouchEnd(event) {
      const drag = this._drag
      if (!drag) return
      this._drag = null
      this.setData({ dragging: false })
      if (!drag.moved) return
      this._ignoreTapUntil = Date.now() + 400
      const end = touch(event), point = Number.isFinite(end.x) && Number.isFinite(end.y) ? end : drag.last
      const rect = await drag.rect
      if (!this.canEdit() || !this.sameSession(drag.owner, drag.epoch) || drag.revision !== this._dishRevision || !rect || !rect.width || !rect.height) return
      if (drag.index < 0 && (point.x < rect.left || point.x > rect.left + rect.width || point.y < rect.top || point.y > rect.top + rect.height)) return
      const at = { x: (point.x - rect.left) / rect.width * 100, y: (point.y - rect.top) / rect.height * 100 }
      if (drag.index < 0) this.placeIngredient(drag.ingredient, at)
      else this.setDish(bento.movePortion(this.data.dish, drag.index, at.x, at.y), { selectedPortionIndex: drag.index })
    },
    stopDrag() { this._drag = null; if (!this._disposed) this.setData({ dragging: false }) },
    onTouchCancel() { this.stopDrag() },
    onRemovePortion() { if (this.canEdit()) this.setDish(bento.removePortion(this.data.dish, this.data.selectedPortionIndex), { selectedPortionIndex: -1, selectedPortion: null }) },
    onPortionStyleChange(event) { if (this.canEdit()) this.setDish(bento.shapePortion(this.data.dish, this.data.selectedPortionIndex, eventID(event).style)) },
    onBoxShapeChange(event) { if (this.canEdit()) { this.setDish(bento.changeBox(this.data.dish, 'box_shape', eventID(event).id)); this._boardRect = null } },
    onBoxColorChange(event) { if (this.canEdit()) this.setDish(bento.changeBox(this.data.dish, 'box_color', eventID(event).id)) },
    onDecorationChange(event) { if (this.canEdit()) this.setDish(bento.changeBox(this.data.dish, 'decoration', eventID(event).id)) },
    onNameInput(event) { if (this.canEdit()) this.setDish(Object.assign({}, this.data.dish, { name: event.detail.value })) },
    onNameSuggestion(event) { if (this.canEdit()) this.setDish(Object.assign({}, this.data.dish, { name: eventID(event).name })) },
    onNewDish() {
      if (!this.canEdit()) return
      this.setDish(bento.freshDish(), { editingRecipeID: '', selectedPortionIndex: -1, selectedPortion: null, selectedIngredient: '', ingredientOptions: bento.clone(bento.ingredients), serviceResult: null, tab: 'kitchen' })
    },
    onLoadRecipe(event) {
      if (!this.canEdit()) return
      const recipe = this.data.recipes.find(item => item.id === eventID(event).id)
      if (!recipe) return
      this.setDish(recipe.dish, { editingRecipeID: recipe.id, tab: 'kitchen', selectedPortionIndex: -1, selectedPortion: null, selectedIngredient: '', ingredientOptions: bento.clone(bento.ingredients), serviceResult: null })
    },
    onSaveRecipe() { return this.saveRecipe(this.data.editingRecipeID) },
    onSaveAsNew() { return this.saveRecipe('') },
    saveRecipe(recipeID) {
      if (!this.canEdit() || this._loadPromise) return
      const dish = bento.namedDish(this.data.dish), error = bento.validateDish(dish)
      if (error) { this.explain(error); return }
      if (!recipeID && this.data.recipes.length >= 24) { this.explain('食谱本已经有 24 道菜啦，可以打开一道菜保存修改。'); return }
      this.setDish(dish)
      return this.mutate({ kind: 'save', method: 'post', path: '/restaurant/recipes', body: { request_id: supplyRequestID(), recipe_id: recipeID || '', dish } })
    },
    onServe() {
      if (!this.canEdit() || this._loadPromise) return
      const resident = this.data.selectedResident, dish = bento.namedDish(this.data.dish)
      if (!resident) { this.explain('先选一位想招待的居民吧'); return }
      const error = bento.validateDish(dish)
      if (error) { this.explain(error); return }
      const source = this.data.recipes.find(item => item.id === this.data.editingRecipeID)
      let recipeID = source && bento.sameDish(source.dish, dish, false) ? source.id : ''
      if (resident.order.kind === 'signature') {
        const ordered = this.data.recipes.find(item => item.id === resident.order.recipe_id)
        if (!ordered || !bento.sameDish(ordered.dish, dish, false)) { this.explain('这位熟客想吃菜单上的招牌菜，先取出这道招牌菜的配方吧。'); return }
        recipeID = ordered.id
      }
      this.setDish(dish)
      return this.mutate({ kind: 'serve', method: 'post', path: '/restaurant/serve', body: { request_id: supplyRequestID(), resident_id: resident.id, order_id: resident.order.id, recipe_id: recipeID, dish } })
    },
    onToggleSignature(event) {
      if (!this.canEdit() || this._loadPromise) return
      const recipe = this.data.recipes.find(item => item.id === eventID(event).id)
      if (!recipe) return
      const ids = this.data.state.signature_ids || []
      if (ids.includes(recipe.id)) return this.saveSignatures(ids.filter(id => id !== recipe.id))
      if (ids.length < 3) return this.saveSignatures(ids.concat(recipe.id))
      this.setData({ replacingRecipe: recipe })
    },
    onReplaceSignature(event) {
      if (!this.canEdit() || !this.data.replacingRecipe) return
      const ids = this.data.state.signature_ids || [], id = eventID(event).id
      if (!ids.includes(id)) return
      return this.saveSignatures(ids.map(value => value === id ? this.data.replacingRecipe.id : value))
    },
    onCancelReplace() { if (!this.data.busy) this.setData({ replacingRecipe: null }) },
    saveSignatures(ids) { return this.mutate({ kind: 'signatures', method: 'put', path: '/restaurant/signatures', body: { request_id: supplyRequestID(), recipe_ids: ids } }) },
    onDismissResult() { this.setData({ serviceResult: null }) },
    onOpenRecipeBook() { if (!this.data.busy) this.setData({ serviceResult: null, tab: 'menu' }) },
    async mutate(operation) {
      if (!this.current() || this.data.busy || this._loadPromise) return
      const owner = this._identity, epoch = this._identityEpoch
      const previousPending = this.data.pending
      this.stopDrag()
      this.setData({ busy: true, pending: Object.assign({}, operation, { message: '正在为你记下这次小镇回忆…' }), error: '' })
      try {
        this.persistDraft(true)
      } catch (err) {
        this.setData({ busy: false, pending: previousPending }); this.explain(err.message); return
      }
      try {
        const state = await api[operation.method](operation.path, operation.body)
        if (!this.sameSession(owner, epoch)) return
        this.applyState(state)
        this.finishOperation(operation, state)
      } catch (err) {
        if (!this.sameSession(owner, epoch)) return
        const rejected = err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 408 && err.statusCode !== 429
        if (rejected) this.setData({ pending: null })
        else this.setData({ pending: Object.assign({}, operation, { message: '上次操作还在确认，继续确认会使用同一份记录。' }) })
        let recovered = false
        try {
          const state = await api.get('/restaurant')
          if (!this.sameSession(owner, epoch)) return
          this.applyState(state)
          recovered = !rejected && this.recoverPending(state)
        } catch (_) {}
        if (!this.sameSession(owner, epoch)) return
        if (!recovered) this.explain(err.message || '暂时没能确认结果，你的便当草稿还在。')
        this.persistDraft()
      } finally { if (this.sameSession(owner, epoch)) this.setData({ busy: false }) }
    },
    recoverPending(state) {
      const pending = this.data.pending
      if (!pending) return false
      if (pending.kind === 'serve') {
        const result = (state.recent_services || []).find(item => item.request_id === pending.body.request_id)
        if (result) { this.finishOperation(pending, Object.assign({}, state, { service_result: result })); return true }
      }
      // A matching recipe is not a receipt: saving also adopts recent tasting memories.
      // Confirm every save with its original request ID, including updates.
      if (pending.kind === 'signatures' && JSON.stringify(state.signature_ids) === JSON.stringify(pending.body.recipe_ids)) { this.finishOperation(pending, state); return true }
      return false
    },
    finishOperation(operation, state) {
      const extra = { pending: null, error: '', replacingRecipe: null }
      if (operation.kind === 'save') {
        if (!state.saved_recipe_id) throw new Error('食谱保存记录还在确认，请继续确认')
        extra.editingRecipeID = state.saved_recipe_id
        // Serving can happen before saving. Keep the actual served dish on the thank-you card.
        if (this.data.serviceResult) extra.serviceResult = Object.assign({}, this.data.serviceResult, { recipe_id: state.saved_recipe_id })
      }
      if (operation.kind === 'serve') {
        if (!state.service_result) throw new Error('招待记录还在确认，请继续确认')
        extra.serviceResult = state.service_result
      }
      this.setData(extra)
      this.persistDraft()
      if (this._visible !== false && operation.kind !== 'serve') showSuccess(operation.kind === 'save' ? '食谱记好啦，去菜单里设为招牌菜吧' : '招牌菜单更新好了')
    },
    onRetryPending() { const pending = this.data.pending; if (pending && !this.data.busy) return this.mutate(pending) },
    onBack() { if (!this.data.busy) wxApi.navigateBack({ fail: () => wxApi.switchTab({ url: '/pages/index/index' }) }) }
  }
}

module.exports = { createRestaurantPage }
