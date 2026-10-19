const activities = {
  '商店': { label: '到店门口逛逛', note: '买好补给就能吃喝，继续逛小镇。' },
  '餐厅': { label: '到餐厅坐坐', note: '一份热饭，让肚子和心情都暖起来。' },
  '学校': { label: '去上一堂单词课', learn: true, note: '认识新单词，也能为小镇攒金币。' },
  '图书馆': { label: '去读单词、学知识', learn: true, note: '找一个安静的位置，学一点新知识。' },
  '公园': { label: '去公园散步', note: '到花丛边走走，和路过的邻居打个招呼。' },
  '电影院': { label: '去看今日海报', note: '到影院门口看看今天的海报。' },
  '体育馆': { label: '去球场活动', note: '去球场走走，伸伸胳膊，活动一下。' },
  '医院': { label: '到医院探望', note: '居民不舒服时，可以在这里请医生帮忙。' },
  '宠物医院': { label: '到宠物医院看看', note: '宠物不舒服时，可以在这里呼叫宠物医生。' },
  '消防站': { label: '去认识消防员', note: '小镇出现火情时，可以在这里拨打消防电话。' },
  '警察局': { label: '去和警员打招呼', note: '有人丢东西时，可以在这里请警员帮忙。' }
}

function presentBuilding(building, life) {
  if (!building) return null
  return Object.assign({}, building, {
    supplies: life ? life.supplies.filter(item => item.building === building.name && item.available) : [],
    serviceEvent: life && life.event && life.event.building === building.name ? life.event : null,
    activity: activities[building.name] || { label: '到这里逛逛', note: '出门走走，看看小镇里的生活。' },
    isShop: building.name === '商店' || building.name === '餐厅'
  })
}

let purchaseSequence = 0
function supplyRequestID() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2).padEnd(10, '0') + '-' + (++purchaseSequence).toString(36)
}

function createTownShop(clock = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) }) {
  return {
    startNeedsClock() {
      this.stopNeedsClock()
      if (this._disposed || !this.data.sceneActive || this.data.editingLayout || !this.data.life || !this.data.life.needs.enabled) return
      this._needsTimer = clock.setTimeout(async () => {
        this._needsTimer = null
        if (this._disposed || !this.data.sceneActive) return
        if (this.data.life && this.data.life.needs.enabled && !this.data.lifeBusy && !this.data.editingLayout) await this.loadTown()
        if (!this._disposed && this.data.sceneActive) this.startNeedsClock()
      }, 60000)
    },
    stopNeedsClock() { clock.clearTimeout(this._needsTimer); this._needsTimer = null },
    onGoSupplies() {
      if (this.data.editingLayout || this.data.lifeBusy) return
      const plot = this.data.plots.find(item => item.occupied && item.name === '商店') || this.data.plots.find(item => item.occupied && item.name === '餐厅')
      if (plot) this.setData({ selected: presentBuilding(plot, this.data.life) })
      else this.onGoBuild()
    },
    async onBuySupply(e) {
      if (this.data.lifeBusy || this.data.lifeFeedback || this.data.refreshing || !this.data.life || !this.data.selected) return
      const item = this.data.selected.supplies.find(item => item.id === e.currentTarget.dataset.id)
      if (!item || !item.available || !item.needed) return
      if (!item.affordable) { this.onGoLearn(); return }
      await this.performLifeAction('/town-life/supplies/purchase', { item_id: item.id, request_id: supplyRequestID() }, life => ({
        icon: item.icon, title: item.water && !item.food ? '咕嘟咕嘟，解渴啦' : '吃饱啦，继续逛小镇',
        outcome: (item.food ? '饱食度 ' + life.needs.food + ' / 100' : '') + (item.food && item.water ? ' · ' : '') + (item.water ? '水分 ' + life.needs.water + ' / 100' : '')
      }))
    },
    onBuildingActivity() {
      const building = this.data.selected
      if (!building || this.data.lifeBusy || this.data.refreshing) return
      if (building.activity.learn) { this.onGoLearn(); return }
      if (this._stroll) this._stroll.visitHost(building.name)
      this.setData({ selected: null, townAnchor: '' }, () => { if (!this._disposed) this.setData({ townAnchor: 'town-map' }) })
    }
  }
}

module.exports = { presentBuilding, createTownShop, supplyRequestID }
