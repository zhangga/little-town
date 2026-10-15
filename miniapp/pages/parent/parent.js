// pages/parent/parent.js
const api = require('../../utils/api')
const { showError, showSuccess } = require('../../utils/util')

// 生成一道两位数乘法题，作为家长验证
function makeGate() {
  const a = Math.floor(Math.random() * 8) + 11  // 11-18
  const b = Math.floor(Math.random() * 8) + 11  // 11-18
  return { a, b, answer: a * b }
}

Page({
  data: {
    // 家长验证
    verified: false,
    gate: null,
    gateInput: '',
    gateWrong: false,

    loading: true,
    failed: false,
    child: null,
    stats: null,
    recentDays: [],
    maxCount: 1,

    // 添加单词
    showAdd: false,
    newWord: '',
    newTranslation: '',
    adding: false
  },

  onLoad() {
    if (!wx.getStorageSync('token')) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    // 本次会话内已验证过就不再重复问
    if (wx.getStorageSync('parentVerified')) {
      this.setData({ verified: true })
      this.loadStats()
    } else {
      this.setData({ gate: makeGate() })
    }
  },

  // ---- 家长验证 ----

  onGateInput(e) {
    this.setData({ gateInput: e.detail.value, gateWrong: false })
  },

  onGateSubmit() {
    const { gate, gateInput } = this.data
    if (!gateInput) return

    if (Number(gateInput) === gate.answer) {
      wx.setStorageSync('parentVerified', true)
      this.setData({ verified: true, gateInput: '' })
      this.loadStats()
    } else {
      // 换一道题，避免反复试同一个数
      this.setData({ gateWrong: true, gateInput: '', gate: makeGate() })
    }
  },

  onGateRefresh() {
    this.setData({ gate: makeGate(), gateInput: '', gateWrong: false })
  },

  // ---- 数据 ----

  async loadStats() {
    this.setData({ loading: true, failed: false })
    try {
      const res = await api.get('/parent/stats')
      const recentDays = ((res && res.recent_days) || []).map((d) => ({
        date: d.date,
        count: d.count
      }))

      const maxCount = Math.max(
        1,
        recentDays.reduce((max, d) => Math.max(max, d.count), 0)
      )

      // 换算成百分比高度，柱状图在 WXML 里用行内样式
      const bars = recentDays.map((d) => ({
        date: d.date,
        count: d.count,
        height: Math.round((d.count / maxCount) * 100)
      }))

      this.setData({
        child: (res && res.user) || null,
        stats: (res && res.stats) || null,
        recentDays: bars,
        maxCount,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false, failed: true })
      showError(err.message || '学习数据加载失败')
    }
  },

  onPullDownRefresh() {
    if (!this.data.verified) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadStats().then(() => wx.stopPullDownRefresh())
  },

  // ---- 添加单词 ----

  onToggleAdd() {
    this.setData({
      showAdd: !this.data.showAdd,
      newWord: '',
      newTranslation: ''
    })
  },

  onWordInput(e) {
    this.setData({ newWord: e.detail.value })
  },

  onTranslationInput(e) {
    this.setData({ newTranslation: e.detail.value })
  },

  async onAddWord() {
    const { newWord, newTranslation, adding } = this.data
    if (adding) return

    if (!newWord.trim() || !newTranslation.trim()) {
      showError('单词和意思都要填')
      return
    }

    this.setData({ adding: true })
    try {
      await api.post('/parent/add-word', {
        word: newWord.trim(),
        translation: newTranslation.trim()
      })
      showSuccess('已加入孩子的学习计划')
      this.setData({
        showAdd: false,
        newWord: '',
        newTranslation: ''
      })
    } catch (err) {
      showError(err.message || '添加失败，再试一次')
    } finally {
      this.setData({ adding: false })
    }
  },

  onShareAppMessage() {
    return {
      title: '小小镇 · 家长报告',
      path: '/pages/index/index'
    }
  }
})
