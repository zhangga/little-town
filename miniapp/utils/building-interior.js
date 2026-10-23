const { activityDetails, createActivitySession, advanceActivity } = require('./building-activities')
const { supplyRequestID } = require('./town-shop')

const interiors = {
  '电影院': { theme: 'cinema', kicker: '小镇光影俱乐部', host: '放映员小光', welcome: '挑一部喜欢的电影，灯暗下来，故事就开始了。', room: '今晚，去故事里旅行', sign: 'NOW SHOWING', props: [{ icon: '🎟️', label: '售票处' }, { icon: '🍿', label: '爆米花台' }, { icon: '🎞️', label: '放映室' }] },
  '餐厅': { theme: 'restaurant', kicker: '围上围裙，今天你当主厨', host: '厨师阿米', welcome: '食材都备好啦！来做一份热腾腾的小镇料理。', room: '有烟火气的小厨房', sign: 'TOWN KITCHEN', props: [{ icon: '🥕', label: '新鲜菜篮' }, { icon: '🍲', label: '料理台' }, { icon: '🪑', label: '窗边餐桌' }] },
  '商店': { theme: 'shop', kicker: '街角杂货铺 · 今日营业中', host: '店主栗栗', welcome: '买点吃喝，也来帮我照着清单挑东西吧。', room: '装满日常的小货架', sign: 'CORNER SHOP', props: [{ icon: '🥖', label: '面包架' }, { icon: '🧃', label: '饮品柜' }, { icon: '🧺', label: '购物篮' }] },
  '学校': { theme: 'school', kicker: '小镇课堂 · 欢迎新同学', host: '老师阿禾', welcome: '黑板上有新问题，带着好奇心来试一试。', room: '今天，也发现一点新知识', sign: 'HELLO, CLASS!', props: [{ icon: '🎒', label: '书包柜' }, { icon: '📝', label: '小课桌' }, { icon: '🔔', label: '上课铃' }] },
  '图书馆': { theme: 'library', kicker: '窗边的故事屋', host: '馆员知知', welcome: '书页里藏着森林和大海，你想先去哪里？', room: '翻开书，就是另一片天地', sign: 'ONCE UPON A TIME', props: [{ icon: '📚', label: '故事书架' }, { icon: '🪴', label: '阳光窗台' }, { icon: '🛋️', label: '阅读角' }] },
  '公园': { theme: 'park', kicker: '慢慢走，发现身边的小生命', host: '园丁小叶', welcome: '给口渴的小花浇浇水，再去树梢找找小鸟。', room: '把好心情种在这里', sign: 'A LITTLE GREEN', props: [{ icon: '🌷', label: '花圃' }, { icon: '⛲', label: '小喷泉' }, { icon: '🌳', label: '观鸟树' }] },
  '体育馆': { theme: 'stadium', kicker: '小镇运动俱乐部', host: '教练阿跃', welcome: '热身完毕！看准目标，来一场友好的练习。', room: '每一球，都值得欢呼', sign: 'LET’S PLAY', props: [{ icon: '🏀', label: '篮球场' }, { icon: '🥅', label: '足球场' }, { icon: '🏅', label: '荣誉墙' }] },
  '医院': { theme: 'hospital', kicker: '温柔照顾每一位小镇居民', host: '医生安安', welcome: '跟着小镇医生认识检查工具，照顾玩偶朋友。', room: '安心的小镇诊室', sign: 'TAKE GOOD CARE', props: [{ icon: '🩺', label: '检查台' }, { icon: '🧸', label: '玩偶角' }, { icon: '🪴', label: '候诊区' }] },
  '宠物医院': { theme: 'vet', kicker: '毛茸茸伙伴的安心小屋', host: '宠物医生绒绒', welcome: '带上你的伙伴，一起检查身体、梳理毛发吧。', room: '每一只小爪子都被照顾', sign: 'HAPPY PAWS', props: [{ icon: '🐾', label: '小爪印' }, { icon: '🧴', label: '护理台' }, { icon: '🧺', label: '软软小窝' }] },
  '消防站': { theme: 'fire', kicker: '小小体验员 · 安全训练日', host: '消防员小焰', welcome: '在模拟训练场认识装备，陪消防员完成任务。', room: '准备好了，平安出发', sign: 'READY TO HELP', props: [{ icon: '🚒', label: '消防车库' }, { icon: '🧯', label: '装备墙' }, { icon: '🪖', label: '头盔柜' }] },
  '警察局': { theme: 'police', kicker: '小镇邻里服务站', host: '警员蓝蓝', welcome: '一起找回失物，也学着看懂路口的信号。', room: '街坊的小事，我们一起帮', sign: 'HERE TO HELP', props: [{ icon: '🎒', label: '失物架' }, { icon: '🚦', label: '交通角' }, { icon: '📋', label: '服务台' }] }
}

function presentInterior(building, life) {
  const interior = interiors[building.name] || interiors['公园']
  const visits = ((life && life.activity_visits) || []).filter(item => item.building === building.name)
  const activities = ((life && life.activities) || []).filter(item => item.building === building.name).map(item => {
    const detail = activityDetails(item.id)
    return Object.assign({}, item, detail || {}, {
      name: item.name, supported: !!detail,
      affordable: !!life && life.wallet.coins >= item.price,
      missing: life ? Math.max(0, item.price - life.wallet.coins) : item.price,
      receipt: visits.find(visit => visit.activity_id === item.id) || null
    })
  })
  return { interior, activities, visits }
}

function createBuildingInterior(api, wxApi, showError, clock = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) }) {
  function storageKey() {
    const user = wxApi.getStorageSync('userInfo') || {}
    return 'buildingAdmission:' + (wxApi.getStorageSync('apiBackend') || 'local') + ':' + (user.id || 'current')
  }
  function readPending() { return wxApi.getStorageSync(storageKey()) || {} }
  function savePending(value) { wxApi.setStorageSync(storageKey(), value) }
  return {
    openBuilding(plot) {
      if (this.data.lifeBusy || this.data.refreshing || this.data.lifeFeedback) return
      this.stopActivityClock()
      const { presentBuilding } = require('./town-shop')
      const pending = readPending()
      this.setData({ selected: presentBuilding(plot, this.data.life), activitySession: null, pendingActivity: pending.building === plot.name ? pending.activity_id : '' })
    },
    async onStartBuildingActivity(e) {
      if (this._disposed || !this.data.sceneActive || this.data.lifeBusy || this.data.refreshing || this.data.lifeFeedback || this.data.activitySession || !this.data.life || !this.data.selected) return
      const activity = this.data.selected.activities.find(item => item.id === e.currentTarget.dataset.id)
      if (!activity || !activity.supported || !activity.available) return
      let pending = readPending()
      if (activity.receipt) {
        if (pending.request_id === activity.receipt.request_id) savePending({})
        this.setData({ pendingActivity: '' })
        this.enterBuildingActivity(activity.id, activity.receipt)
        return
      }
      const retrying = pending.activity_id === activity.id && pending.building === activity.building
      if (!retrying && !activity.affordable) { this.onGoLearn(); return }
      if (!retrying) {
        pending = { activity_id: activity.id, building: activity.building, request_id: supplyRequestID() }
        // 先记住请求再扣款；断网或重启后重试同一请求，不再买一张票。
        savePending(pending)
      }
      this.setData({ lifeBusy: true, pendingActivity: activity.id })
      try {
        const state = await api.post('/town-life/activities/start', { activity_id: activity.id, request_id: pending.request_id })
        if (this._disposed) return
        this.applyLife(state)
        const receipt = state.activity_receipt || (state.activity_visits || []).find(item => item.request_id === pending.request_id)
        if (!receipt) throw new Error('入场记录还在确认，请稍后再试')
        savePending({})
        this.setData({ pendingActivity: '' })
        this.enterBuildingActivity(activity.id, receipt)
      } catch (err) {
        if (this._disposed) return
        // 请求可能已经成功：只读回执，绝不自动再发一次消费。
        let recovered = false
        try {
          const state = await api.get('/town-life')
          if (this._disposed) return
          this.applyLife(state)
          const receipt = (state.activity_visits || []).find(item => item.request_id === pending.request_id && item.activity_id === activity.id)
          if (receipt) {
            savePending({})
            this.setData({ pendingActivity: '' })
            this.enterBuildingActivity(activity.id, receipt)
            recovered = true
          }
        } catch (_) {
          if (!this._disposed) this.setData({ lifeFailed: true, life: null })
        }
        if (!recovered && !this._disposed) showError(err.message || '入场还没确认，稍后可以继续确认')
      } finally {
        if (!this._disposed) this.setData({ lifeBusy: false })
      }
    },
    enterBuildingActivity(id, receipt) {
      const session = createActivitySession(id, receipt)
      if (!session || !this.data.selected || receipt.building !== this.data.selected.name) return
      this.stopActivityClock()
      this.setData({ activitySession: session })
      this.startActivityClock()
    },
    startActivityClock() {
      this.stopActivityClock()
      const session = this.data.activitySession
      if (this._disposed || !this.data.sceneActive || !session || session.kind !== 'movie' || session.paused || session.complete) return
      this._activityTimer = clock.setTimeout(() => {
        this._activityTimer = null
        if (this._disposed || !this.data.sceneActive) return
        this.setData({ activitySession: advanceActivity(this.data.activitySession, { kind: 'tick' }) })
        this.startActivityClock()
      }, 3600)
    },
    stopActivityClock() { clock.clearTimeout(this._activityTimer); this._activityTimer = null },
    onActivityChoice(e) {
      if (this.data.lifeBusy || !this.data.sceneActive || !this.data.activitySession) return
      // 原生视图尚未刷新的连续点击仍携带上一题的步数，不能答掉下一题。
      if (Number(e.currentTarget.dataset.step) !== this.data.activitySession.step) return
      this.setData({ activitySession: advanceActivity(this.data.activitySession, { kind: 'choose', id: e.currentTarget.dataset.id }) })
    },
    onActivityNext() {
      if (!this.data.sceneActive || !this.data.activitySession) return
      this.setData({ activitySession: advanceActivity(this.data.activitySession, { kind: 'next' }) })
      this.startActivityClock()
    },
    onActivityPause() {
      if (!this.data.activitySession) return
      this.setData({ activitySession: advanceActivity(this.data.activitySession, { kind: 'toggle_pause' }) })
      this.startActivityClock()
    },
    onActivityReplay() {
      const session = this.data.activitySession
      if (session && !this.data.lifeBusy) this.enterBuildingActivity(session.id, session.receipt)
    },
    onActivityLobby() {
      if (this.data.lifeBusy) return
      this.stopActivityClock()
      this.setData({ activitySession: null })
    }
  }
}

module.exports = { presentInterior, createBuildingInterior }
