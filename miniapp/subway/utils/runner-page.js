const { createRun, controlRun, stepRun, runView } = require('./runner')
const { drawRun } = require('./runner-renderer')
const { createEconomy } = require('./runner-economy')

function createRunnerPage(api, wxApi, options = {}) {
  const random = options.random || Math.random
  function identity() {
    const user = wxApi.getStorageSync('userInfo') || {}
    return (wxApi.getStorageSync('apiBackend') || 'local') + ':' + (user.id || 'current')
  }
  function point(event) {
    const touch = (event.changedTouches || [])[0] || (event.touches || [])[0]
    if (!touch) return null
    return { x: touch.clientX === undefined ? touch.x : touch.clientX, y: touch.clientY === undefined ? touch.y : touch.clientY }
  }
  return {
    data: {
      phase: 'loading', canvasReady: false, canvasError: '', error: '',
      score: 0, distance: 0, stars: 0, coins: 0, runTokens: 0, boards: 1, boardSeconds: 0, magnetSeconds: 0, chaseSeconds: 0, chaseLabel: '安全距离', pace: '城市站台',
      economy: null, economyBusy: false, economyError: '', pendingReward: false, pendingPurchase: null, awarded: null, shopOpen: false, shopMessage: '',
      hint: '左右换道 · 上跳下滑 · 列车要绕开', best: 0, newRecord: false, recordSaveFailed: false
    },
    onLoad(query = {}) {
      this._openShop = query.shop === '1'
      this._disposed = false
      this._visible = true
      this._run = createRun()
      return this.loadStation()
    },
    onReady() { this.initCanvas() },
    onShow() {
      this._visible = true
      if (this._owner !== identity() || this._token !== wxApi.getStorageSync('token')) return this.loadStation()
      // Returning to a paused game never resumes it automatically.
      this.drawFrame()
    },
    onHide() {
      this._visible = false
      this.onPause()
      this.checkpoint()
      this.saveRecord()
    },
    onUnload() {
      this.checkpoint()
      this.saveRecord()
      this.stopLoop()
      this._disposed = true
      this._visible = false
      this._canvasEpoch = (this._canvasEpoch || 0) + 1
      this._touch = null
      this._canvas = null
      this._ctx = null
    },
    onResize() { this.onPause(); this.initCanvas() },
    current(owner = this._owner, token = this._token) {
      return !this._disposed && owner === this._owner && owner === identity() && token === this._token && token === wxApi.getStorageSync('token')
    },
    loadStation() {
      if (this._disposed) return Promise.resolve()
      const owner = identity(), token = wxApi.getStorageSync('token')
      if (this._loadPromise && owner === this._owner && token === this._token) return this._loadPromise
      this.stopLoop()
      this._owner = owner; this._token = token; this._owned = false
      this._run = createRun()
      this._sessionID = null
      this._economy = createEconomy(api, wxApi, owner, () => this.current(owner, token))
      let best = 0
      try {
        const saved = wxApi.getStorageSync('subwayRecord:v1:' + owner)
        if (saved && Number.isSafeInteger(saved.best) && saved.best >= 0) best = saved.best
      } catch (_) {}
      this.setData(Object.assign(runView(this._run), { phase: token ? 'loading' : 'login', best, error: '', newRecord: false, recordSaveFailed: false, economy: null, economyBusy: false, economyError: '', pendingReward: false, pendingPurchase: null, awarded: null, shopOpen: false, shopMessage: '' }))
      this.drawFrame()
      if (!token) return Promise.resolve()
      const loading = Promise.resolve().then(() => api.get('/buildings/my-town')).then(async state => {
        if (!this.current(owner, token)) return
        if (!state || !Array.isArray(state.buildings)) throw new Error('站台信息没能加载，请再试一次')
        this._owned = state.buildings.some(item => item.name === '地铁站')
        if (this._owned) {
          const wallet = await this._economy.load()
          if (!this.current(owner, token)) return
          this.applyEconomy(wallet)
        }
        this.setData({ phase: this._owned ? 'ready' : 'locked', pendingReward: !!this._economy.pending().finish, shopOpen: this._openShop && this._owned })
        if (this._owned && this.data.pendingReward) await this.onSettle()
      }).catch(err => {
        if (this.current(owner, token)) this.setData({ phase: 'error', error: err.message || '地铁站暂时没连上，请再试一次' })
      }).finally(() => { if (this._loadPromise === loading) this._loadPromise = null })
      this._loadPromise = loading
      return loading
    },
    initCanvas() {
      if (this._disposed) return
      this.stopLoop()
      const epoch = this._canvasEpoch = (this._canvasEpoch || 0) + 1
      this.setData({ canvasReady: false, canvasError: '' })
      const fail = () => {
        if (!this._disposed && epoch === this._canvasEpoch) this.setData({ canvasReady: false, canvasError: '跑道还没准备好，点一下重新加载。' })
      }
      try {
        // Native canvas can cover ordinary views in WeChat. Keep it hidden on
        // menu screens and measure the stage, which still has its full size.
        wxApi.createSelectorQuery().in(this).select('#runner-canvas').fields({ node: true }).select('.run-stage').fields({ size: true }).exec(result => {
          if (this._disposed || epoch !== this._canvasEpoch) return
          try {
            const field = result && result[0], stage = result && result[1]
            if (!field || !field.node || !stage || !stage.width || !stage.height) { fail(); return }
            const canvas = field.node
            const info = wxApi.getWindowInfo ? wxApi.getWindowInfo() : wxApi.getSystemInfoSync()
            const ratio = Math.min(3, Math.max(1, info.pixelRatio || 1))
            canvas.width = Math.round(stage.width * ratio)
            canvas.height = Math.round(stage.height * ratio)
            this._ctx = canvas.getContext('2d')
            this._ctx.scale(ratio, ratio)
            this._canvas = canvas; this._width = stage.width; this._height = stage.height
            this.drawFrame()
            this.setData({ canvasReady: true, canvasError: '' })
          } catch (_) { fail() }
        })
      } catch (_) { fail() }
    },
    drawFrame() {
      if (this._ctx && this._run && !this._disposed) drawRun(this._ctx, this._width, this._height, this._run)
    },
    applyEconomy(state) {
      this.setData({ economy: state, best: Math.max(this.data.best, state.best || 0) })
      this.syncPurchase()
    },
    syncPurchase() {
      const pending = this._economy.pending().purchase
      this.setData({ pendingPurchase: pending && this.data.economy ? this.data.economy.items.find(item => item.id === pending.item_id) || null : null })
    },
    checkpoint() {
      try { if (this._economy && this._sessionID) this._economy.checkpoint(this._run, this._sessionID); return true }
      catch (_) { if (!this._disposed) this.setData({ economyError: '本局记录还没存好，请保持页面并重试结算' }); return false }
    },
    async onStart() {
      if (!this.current() || !this._visible || !this._owned || !this.data.canvasReady || this.data.economyBusy || !['ready', 'over'].includes(this.data.phase)) return
      if (this._economy.pending().finish) { this.setData({ pendingReward: true, economyError: '先结算上一程，再出发' }); return }
      const owner = this._owner, token = this._token
      this.setData({ economyBusy: true, economyError: '', awarded: null })
      try {
        const state = await this._economy.start()
        if (!this.current(owner, token)) return
        this._sessionID = state.run.run_id
        this.applyEconomy(state)
        this._run = createRun(); this._run.skin = state.equipped || 'mint'
        this._runBest = this.data.best
        controlRun(this._run, 'start')
        if (!this._visible) controlRun(this._run, 'pause')
        this.setData(Object.assign(runView(this._run), { newRecord: false, recordSaveFailed: false, pendingReward: false }))
        this.checkpoint(); this.startLoop()
      } catch (err) { if (this.current(owner, token)) this.setData({ economyError: err.message }) }
      finally { if (this.current(owner, token)) this.setData({ economyBusy: false }) }
    },
    async onSettle() {
      if (!this.current() || this.data.economyBusy) return
      const owner = this._owner, token = this._token
      if (!this.checkpoint()) { this.setData({ pendingReward: true }); return false }
      this.setData({ economyBusy: true, economyError: '' })
      try {
        const state = await this._economy.settle()
        if (!this.current(owner, token)) return
        this._sessionID = null; this.applyEconomy(state)
        this.setData({ pendingReward: false, awarded: state.run ? state.run.awarded : null })
        return true
      } catch (err) { if (this.current(owner, token)) this.setData({ pendingReward: true, economyError: err.message }) }
      finally { if (this.current(owner, token)) this.setData({ economyBusy: false }) }
    },
    onDiscardReward() {
      if (!this.current() || this.data.economyBusy) return
      wxApi.showModal({ title: '放弃本次结算？', content: '这程收集物将不兑换为星光币，已有余额不受影响。', success: res => {
        if (res.confirm && this.current()) { this._economy.discard(); this._sessionID = null; this.setData({ pendingReward: false, economyError: '' }) }
      } })
    },
    onOpenShop() { if (!this.current() || !this.data.economy) return; this.onPause(); this.setData({ shopOpen: true, shopMessage: '' }); this.syncPurchase() },
    onCloseShop() { this.setData({ shopOpen: false }) },
    onRetryPurchase() { if (this.data.pendingPurchase) return this.onShopItem({ currentTarget: { dataset: { id: this.data.pendingPurchase.id } } }) },
    async onShopItem(event) {
      if (!this.current() || this.data.economyBusy || !this.data.economy) return
      const item = this.data.economy.items.find(i => i.id === event.currentTarget.dataset.id)
      if (!item) return
      const owner = this._owner, token = this._token
      this.setData({ economyBusy: true, economyError: '', shopMessage: '' })
      try {
        const pending = this._economy.pending().purchase
        const state = item.owned && !pending ? await this._economy.equip(item.id) : await this._economy.purchase(item.id)
        if (!this.current(owner, token)) return
        this.applyEconomy(state); this._run.skin = state.equipped
        this.setData({ shopMessage: item.kind === 'exchange' ? '兑换成功，已存入小镇钱包' : '滑板已装备，下一程一起出发' })
      } catch (err) { if (this.current(owner, token)) this.setData({ economyError: err.message }) }
      finally { if (this.current(owner, token)) { this.setData({ economyBusy: false }); this.syncPurchase() } }
    },
    startLoop() {
      this.stopLoop()
      if (!this.current() || !this._visible || !this._canvas || !['running', 'caught'].includes(this._run.status)) return
      const version = this._loopVersion
      this._lastFrame = null
      this._lastHUD = 0
      this._lastCheckpoint = 0
      const frame = timestamp => {
        if (version !== this._loopVersion || !this.current() || !this._visible || !['running', 'caught'].includes(this._run.status)) return
        this._raf = null
        const now = Number.isFinite(timestamp) ? timestamp : Date.now()
        if (this._lastFrame !== null) stepRun(this._run, Math.max(0, (now - this._lastFrame) / 1000), random)
        this._lastFrame = now
        this.drawFrame()
        if (this._run.status === 'over' || now - this._lastHUD >= 100) {
          this.setData(runView(this._run)); this._lastHUD = now
          if (now - this._lastCheckpoint > 5000) { this.checkpoint(); this._lastCheckpoint = now }
        }
        if (this._run.status === 'over') {
          this.setData({ newRecord: this._run.score > this._runBest, pendingReward: true })
          this.saveRecord(); this.checkpoint(); this.onSettle()
        } else this._raf = this._canvas.requestAnimationFrame(frame)
      }
      this._raf = this._canvas.requestAnimationFrame(frame)
    },
    stopLoop() {
      this._loopVersion = (this._loopVersion || 0) + 1
      if (this._canvas && this._raf !== null && this._raf !== undefined) this._canvas.cancelAnimationFrame(this._raf)
      this._raf = null
      this._lastFrame = null
      this._touch = null
    },
    onPause() {
      this.stopLoop()
      if (this._run && ['running', 'caught'].includes(this._run.status)) {
        controlRun(this._run, 'pause')
        if (!this._disposed) this.setData(runView(this._run))
      }
    },
    onResume() {
      if (!this.current() || !this._visible || !this.data.canvasReady || !this._owned || this._run.status !== 'paused') return
      controlRun(this._run, 'resume')
      this.setData(runView(this._run))
      this.startLoop()
    },
    command(action) {
      if (!this.current() || !this._visible || !this._owned || this._run.status !== 'running') return
      controlRun(this._run, action)
    },
    onControl(event) { this.command(event.currentTarget.dataset.action) },
    onTouchStart(event) {
      this._touch = this.data.phase === 'running' ? point(event) : null
    },
    onTouchMove(event) {
      const start = this._touch, end = point(event)
      if (!start || !end) return
      const dx = end.x - start.x, dy = end.y - start.y
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
      this._touch = null // One move per gesture; a tap does not accidentally jump.
      this.command(Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'jump' : 'slide')
    },
    onTouchEnd(event) { this.onTouchMove(event); this._touch = null },
    onTouchCancel() { this._touch = null },
    saveRecord() {
      if (!this.current() || !this._run || !this._owned || !this._run.score) return
      const best = Math.max(this.data.best, this._run.score)
      this.setData({ best })
      try {
        wxApi.setStorageSync('subwayRecord:v1:' + this._owner, { best })
        this.setData({ recordSaveFailed: false })
      } catch (_) { this.setData({ recordSaveFailed: true }) }
    },
    onRetry() { return this.loadStation() },
    onRetryCanvas() { this.onPause(); this.initCanvas() },
    onGoBuild() { wxApi.switchTab({ url: '/pages/build/build' }) },
    onLogin() { wxApi.redirectTo({ url: '/pages/login/login' }) },
    onEndRun() {
      if (!this.current() || this.data.economyBusy) return
      this.stopLoop(); this._run.status = 'over'
      this.setData(Object.assign(runView(this._run), { pendingReward: true }))
      this.saveRecord(); return this.onSettle()
    },
    async onBack() {
      if (this.data.economyBusy) return
      const owner = this._owner, token = this._token
      this.onPause(); if (!this.checkpoint()) return; this.saveRecord()
      if (this._sessionID) await this.onSettle()
      if (!this.current(owner, token)) return
      wxApi.navigateBack({ fail: () => wxApi.switchTab({ url: '/pages/index/index' }) })
    }
  }
}

module.exports = { createRunnerPage }
