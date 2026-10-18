const api = require('../../utils/api')
const { showError, showSuccess } = require('../../utils/util')
const { presentResident, residentArt, saveWallet } = require('../../utils/resident')

Page({
  data: { loading: true, failed: false, busy: false, state: null, tab: 'outfit', items: [], selected: null, editingName: false, nameDraft: '', waving: false },
  onLoad() {
    if (!wx.getStorageSync('token')) wx.redirectTo({ url: '/pages/login/login' })
  },
  onShow() { if (wx.getStorageSync('token')) this.loadResident() },
  onHide() {
    clearTimeout(this._waveTimer)
    // tab 页会缓存，离开时收起临时编辑和预览，返回后读取最新状态。
    this.setData({ selected: null, editingName: false })
    if (this.data.state) this.resetPose()
  },
  onUnload() { this._disposed = true; clearTimeout(this._waveTimer) },
  onPullDownRefresh() { return this.loadResident().finally(() => wx.stopPullDownRefresh()) },
  applyState(response) {
    if (this._disposed) return
    const state = presentResident(response)
    clearTimeout(this._waveTimer)
    this.setData({ state, items: state.shop.filter(item => item.kind === this.data.tab), loading: false, failed: false, waving: false })
    saveWallet(state.wallet)
  },
  loadResident() {
    if (this._loadPromise) return this._loadPromise
    if (this.data.busy) return Promise.resolve()
    this.setData({ loading: !this.data.state, failed: false })
    this._loadPromise = api.get('/resident').then(res => this.applyState(res)).catch(err => {
      if (!this._disposed) { this.setData({ loading: false, failed: !this.data.state }); showError(err.message || '小屋暂时没连上') }
    }).finally(() => { this._loadPromise = null })
    return this._loadPromise
  },
  onTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!['outfit', 'decoration', 'home'].includes(tab) || !this.data.state) return
    this.setData({ tab, items: this.data.state.shop.filter(item => item.kind === tab) })
  },
  onWave() {
    if (!this.data.state || this.data.waving) return
    this.setData({ waving: true, 'state.characterArt': residentArt(this.data.state.resident.outfit_id, 1) })
    this._waveTimer = setTimeout(() => this.resetPose(), 1400)
  },
  resetPose() {
    if (!this._disposed) this.setData({ waving: false, 'state.characterArt': residentArt(this.data.state.resident.outfit_id) })
  },
  onEditName() { if (!this.data.busy) this.setData({ editingName: true, nameDraft: this.data.state.resident.name }) },
  onNameInput(e) { this.setData({ nameDraft: e.detail.value }) },
  onCancelName() { if (!this.data.busy) this.setData({ editingName: false }) },
  onSaveName() {
    const name = this.data.nameDraft.trim()
    if (!name || Array.from(name).length > 12 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) { showError('请输入 1～12 个字的名字'); return }
    return this.mutate('put', '/resident', { name }, '名字保存好了')
  },
  onSelect(e) {
    if (this.data.busy) return
    const item = this.data.state.shop.find(item => item.id === e.currentTarget.dataset.id)
    if (item) this.setData({ selected: Object.assign({ type: 'item' }, item) })
  },
  onPreviewHome() {
    if (this.data.busy || !this.data.state.home.next_level) return
    const { home, nextHomeArt, wallet } = this.data.state
    this.setData({ selected: { type: 'home', name: '升级到 ' + home.next_level + ' 级小屋', description: '更宽敞的家，装得下新的学习故事。', art: nextHomeArt, price: home.upgrade_cost, affordable: home.can_upgrade, missing: Math.max(0, home.upgrade_cost - wallet.bricks), expectedLevel: home.level } })
  },
  onClose() { if (!this.data.busy) this.setData({ selected: null }) },
  onNoop() {},
  onConfirm() {
    const item = this.data.selected
    if (!item || this.data.busy || item.equipped) return
    if (!item.owned && !item.affordable) { this.onGoLearn(); return }
    if (item.type === 'home') return this.mutate('post', '/resident/home/upgrade', { expected_level: item.expectedLevel }, '小屋焕新啦')
    return this.mutate('post', item.owned ? '/resident/equip' : '/resident/purchase', { item_id: item.id }, item.kind === 'outfit' ? '新装扮穿好啦' : '庭院布置好了')
  },
  async mutate(method, path, body, message) {
    if (this.data.busy || this._loadPromise) return
    this.setData({ busy: true })
    try {
      const res = await api[method](path, body)
      if (this._disposed) return
      this.applyState(res)
      this.setData({ selected: null, editingName: false })
      showSuccess(message)
    } catch (err) {
      if (this._disposed) return
      // 超时也可能已经保存；先取回服务端状态，避免展示旧余额。
      try { this.applyState(await api.get('/resident')) } catch (_) {}
      if (!this._disposed) { this.setData({ selected: null }); showError(err.message || '暂时没能保存，请重试') }
    } finally { if (!this._disposed) this.setData({ busy: false }) }
  },
  onGoLearn() { if (!this.data.busy) { this.setData({ selected: null }); wx.switchTab({ url: '/pages/learn/learn' }) } }
})
