const api = require('../../utils/api')
const { townSprite } = require('../../utils/assets')
const { townPlots } = require('../../utils/town')
const { showError } = require('../../utils/util')
const { presentResident, saveWallet } = require('../../utils/resident')
const { presentLife, townScene } = require('../../utils/town-life')

Page({
  data: {
    town: { coins: 0, bricks: 0, level: 1, total_buildings: 0 },
    buildings: [], plots: [], selected: null, loading: true, failed: false, growth: null, growthFailed: false,
    brickSprite: townSprite('砖块'), coinSprite: townSprite('金币'),
    treeSprite: townSprite('树林'), flagSprite: townSprite('旗帜'),
    life: null, lifeFailed: false, lifeBusy: false, refreshing: false,
    selectedPet: null, lifeFeedback: null, townAnchor: '', scene: townScene([], new Date().getHours()), sceneActive: true
  },

  onLoad() {
    if (!wx.getStorageSync('token')) wx.redirectTo({ url: '/pages/login/login' })
  },

  onShow() {
    this.setData({ sceneActive: true })
    if (wx.getStorageSync('token')) this.loadTown()
  },

  onHide() { this.setData({ sceneActive: false }) },
  onUnload() { this._disposed = true },

  onPullDownRefresh() {
    return this.loadTown().finally(() => wx.stopPullDownRefresh())
  },

  loadTown() {
    if (this.data.lifeBusy) return Promise.resolve()
    if (this._loadPromise) return this._loadPromise
    this.setData({ loading: !this.data.plots.length, failed: false, refreshing: true })
    this._loadPromise = this.fetchTown().finally(() => {
      this._loadPromise = null
      if (!this._disposed) this.setData({ refreshing: false })
    })
    return this._loadPromise
  },

  async fetchTown() {
    try {
      const [res, resident] = await Promise.all([
        api.get('/buildings/my-town'), api.get('/resident').catch(() => null)
      ])
      // 在角色/地图读完后读取生活余额，避免用更早的角色快照覆盖一次服务消费。
      const life = await api.get('/town-life').catch(() => null)
      if (this._disposed) return
      const growth = resident ? presentResident(resident) : null
      const recent = wx.getStorageSync('lastBuiltBuilding')
      const layout = townPlots(res.buildings || [], recent && recent.name, !!growth)
      const town = Object.assign({}, res.town_data || this.data.town, growth ? growth.wallet : {})
      this.setData(Object.assign({ town, growth, growthFailed: !growth, loading: false, lifeFailed: !life }, layout))
      if (life) this.applyLife(life)
      else {
        this.setData({ life: null, selectedPet: null, scene: townScene(layout.buildings.map(item => item.name), new Date().getHours()) })
        if (growth) saveWallet(growth.wallet)
      }
      if (recent && layout.buildings.some(item => item.isNew)) wx.removeStorageSync('lastBuiltBuilding')
    } catch (err) {
      if (this._disposed) return
      this.setData({ loading: false, failed: !this.data.plots.length })
      showError(err.message || '小镇数据加载失败')
    }
  },

  applyLife(raw) {
    if (this._disposed) return
    const life = presentLife(raw)
    const selectedPet = this.data.selectedPet && life.pets.find(pet => pet.id === this.data.selectedPet.id && !pet.owned)
    const growth = this.data.growth ? Object.assign({}, this.data.growth, { wallet: life.wallet }) : null
    this.setData({ life, lifeFailed: false, growth, selectedPet: selectedPet || null,
      town: Object.assign({}, this.data.town, life.wallet), scene: townScene(life.buildings, new Date().getHours()) })
    saveWallet(life.wallet)
  },

  onSelectPet(e) {
    if (this.data.lifeBusy || this.data.refreshing || !this.data.life) return
    const pet = this.data.life.pets.find(item => item.id === e.currentTarget.dataset.id)
    if (pet && !pet.owned) this.setData({ selectedPet: pet })
  },
  onClosePet() { if (!this.data.lifeBusy) this.setData({ selectedPet: null }) },
  onCloseFeedback() { this.setData({ lifeFeedback: null }) },
  onGoLife() {
    this.setData({ townAnchor: '' }, () => { if (!this._disposed) this.setData({ townAnchor: 'town-life-panel' }) })
  },

  async onBuyPet() {
    const pet = this.data.selectedPet
    if (!pet || this.data.lifeBusy || this.data.refreshing) return
    if (!pet.affordable) { this.onGoLearn(); return }
    await this.performLifeAction('/town-life/pets/purchase', { pet_id: pet.id }, {
      icon: pet.icon, title: pet.name + '搬来啦', outcome: '以后回到小镇，就有一位毛茸茸的小伙伴等你。'
    })
  },

  async onResolveLife() {
    const current = this.data.life && this.data.life.event
    if (!current || this.data.lifeBusy || this.data.refreshing) return
    if (!current.affordable) { this.onGoLearn(); return }
    await this.performLifeAction('/town-life/events/resolve', { event_id: current.id }, {
      icon: current.icon, title: current.cost ? '小镇的帮手来啦' : '又一件小镇里的开心事', outcome: current.outcome
    })
  },

  async performLifeAction(url, body, feedback) {
    this.setData({ lifeBusy: true })
    try {
      const state = await api.post(url, body)
      if (this._disposed) return
      this.applyLife(state)
      this.setData({ selectedPet: null, lifeFeedback: feedback })
    } catch (err) {
      if (this._disposed) return
      showError(err.message || '小镇生活暂时没连上')
      // 结果不明时只读回状态，不重复提交消费。
      try { this.applyLife(await api.get('/town-life')) }
      catch (_) { if (!this._disposed) this.setData({ lifeFailed: true, life: null, selectedPet: null }) }
    } finally {
      if (!this._disposed) this.setData({ lifeBusy: false })
    }
  },

  onPlotTap(e) {
    const plot = this.data.plots[e.currentTarget.dataset.index]
    if (!plot) return
    if (!plot.occupied) { this.onGoBuild(); return }
    this.setData({ selected: plot })
  },

  onCloseDetail() { this.setData({ selected: null }) },
  onNoop() {},
  onGoLearn() { wx.switchTab({ url: '/pages/learn/learn' }) },
  onGoBuild() { wx.switchTab({ url: '/pages/build/build' }) },
  onGoResident() { wx.navigateTo({ url: '/pages/resident/resident' }) },
  onDailyTask() { this.onGoLearn() },
  onShareAppMessage() {
    return { title: '学单词，建一座自己的方块小镇', path: '/pages/index/index' }
  }
})
