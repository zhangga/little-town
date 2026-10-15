// pages/learn/learn.js
const api = require('../../utils/api')
const { wordEmoji } = require('../../utils/assets')
const { showError } = require('../../utils/util')

// 干扰项池：当今日单词不足以凑够 4 个选项时，从这里补
const DISTRACTORS = [
  { word: 'banana', translation: '香蕉' },
  { word: 'bird', translation: '小鸟' },
  { word: 'cake', translation: '蛋糕' },
  { word: 'car', translation: '汽车' },
  { word: 'chair', translation: '椅子' },
  { word: 'clock', translation: '钟表' },
  { word: 'cow', translation: '奶牛' },
  { word: 'duck', translation: '鸭子' },
  { word: 'egg', translation: '鸡蛋' },
  { word: 'flower', translation: '花' },
  { word: 'hat', translation: '帽子' },
  { word: 'house', translation: '房子' },
  { word: 'milk', translation: '牛奶' },
  { word: 'moon', translation: '月亮' },
  { word: 'panda', translation: '熊猫' },
  { word: 'pig', translation: '猪' },
  { word: 'rain', translation: '雨' },
  { word: 'rice', translation: '米饭' },
  { word: 'ship', translation: '轮船' },
  { word: 'shoe', translation: '鞋子' },
  { word: 'star', translation: '星星' },
  { word: 'table', translation: '桌子' },
  { word: 'tree', translation: '树' },
  { word: 'water', translation: '水' }
]

function shuffle(list) {
  const arr = list.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

Page({
  data: {
    loading: true,
    failed: false,
    words: [],
    index: 0,
    question: null,
    picked: -1,
    answered: false,
    isCorrect: false,
    earned: { coins: 0, bricks: 0 },
    stats: { right: 0, wrong: 0 },
    finished: false,
    saving: false
  },

  onLoad() {
    if (!this.checkAuth()) return
    this.loadDaily()
  },

  onShow() {
    // 从其他页返回时，如果今天还没开始，重新拉取
    if (this.data.finished) {
      this.loadDaily()
    }
  },

  checkAuth() {
    if (!wx.getStorageSync('token')) {
      wx.redirectTo({ url: '/pages/login/login' })
      return false
    }
    return true
  },

  async loadDaily() {
    this.setData({ loading: true, failed: false, finished: false })
    try {
      const res = await api.get('/learn/daily-words')
      const words = (res && res.words) || []

      if (words.length === 0) {
        this.setData({ loading: false, words: [], index: 0, question: null, finished: true })
        return
      }

      this.setData({
        loading: false,
        words,
        index: 0,
        earned: { coins: 0, bricks: 0 },
        stats: { right: 0, wrong: 0 }
      })
      this.buildQuestion(0)
    } catch (err) {
      this.setData({ loading: false, failed: true })
      showError(err.message || '今天的学习内容加载失败')
    }
  },

  // 生成一道题：偶数题看图选词，奇数题看词选义
  buildQuestion(index) {
    const { words } = this.data
    const current = words[index]
    if (!current) return

    const isPicRound = index % 2 === 0

    // 干扰项：优先用今日其他单词，不够再从池子里补
    const others = words.filter((w) => w.id !== current.id)
    const pool = shuffle(others).slice(0, 3)

    if (isPicRound) {
      const fallback = shuffle(DISTRACTORS.filter(
        (d) => d.word !== current.word && !pool.some((p) => p.word === d.word)
      )).slice(0, 3 - pool.length)

      const options = shuffle(
        [
          { key: 'w' + current.id, label: current.word, correct: true }
        ].concat(
          pool.map((p) => ({ key: 'w' + p.id, label: p.word, correct: false })),
          fallback.map((f) => ({ key: 'd' + f.word, label: f.word, correct: false }))
        )
      )

      this.setData({
        question: {
          id: current.id,
          type: 'pic',
          is_review: current.is_review,
          promptEmoji: wordEmoji(current.word),
          promptWord: current.word,
          hint: current.is_review ? '这个词你学过，还认得吗？' : '看图片，选出正确的单词',
          options
        },
        picked: -1,
        answered: false,
        isCorrect: false
      })
    } else {
      const fallback = shuffle(DISTRACTORS.filter(
        (d) => d.translation !== current.translation && !pool.some((p) => p.translation === d.translation)
      )).slice(0, 3 - pool.length)

      const options = shuffle(
        [
          { key: 'w' + current.id, label: current.translation, correct: true }
        ].concat(
          pool.map((p) => ({ key: 'w' + p.id, label: p.translation, correct: false })),
          fallback.map((f) => ({ key: 'd' + f.word, label: f.translation, correct: false }))
        )
      )

      this.setData({
        question: {
          id: current.id,
          type: 'meaning',
          is_review: current.is_review,
          promptEmoji: '',
          promptWord: current.word,
          hint: current.is_review ? '这个词你学过，还认得吗？' : '选出正确的意思',
          options
        },
        picked: -1,
        answered: false,
        isCorrect: false
      })
    }
  },

  onPick(e) {
    if (this.data.answered) return
    const { index } = e.currentTarget.dataset
    const option = this.data.question.options[index]
    const isCorrect = !!option.correct

    this.setData({
      picked: index,
      answered: true,
      isCorrect,
      stats: {
        right: this.data.stats.right + (isCorrect ? 1 : 0),
        wrong: this.data.stats.wrong + (isCorrect ? 0 : 1)
      }
    })

    this.submit(this.data.question.id, isCorrect)
  },

  // 提交结果，记录奖励
  async submit(wordId, isCorrect) {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      const res = await api.post('/learn/submit-answer', {
        word_id: wordId,
        is_correct: isCorrect
      })

      const coins = (res && res.coins_earned) || 0
      const bricks = (res && res.bricks_earned) || 0

      this.setData({
        earned: {
          coins: this.data.earned.coins + coins,
          bricks: this.data.earned.bricks + bricks
        }
      })

      // 同步本地用户资源，让小镇页数字不滞后
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && typeof res.total_coins === 'number') {
        userInfo.coins = res.total_coins
        userInfo.bricks = res.total_bricks
        wx.setStorageSync('userInfo', userInfo)
      }
    } catch (err) {
      // 答错或网络失败都不打断学习流程，只提示
      console.warn('提交答案失败', err)
    } finally {
      this.setData({ saving: false })
    }
  },

  // 下一题
  onNext() {
    const next = this.data.index + 1
    if (next >= this.data.words.length) {
      this.setData({ finished: true, question: null })
      return
    }
    this.setData({ index: next })
    this.buildQuestion(next)
  },

  onPlayAudio() {
    const current = this.data.words[this.data.index]
    const url = current && current.audio_url
    if (url) {
      const inner = wx.createInnerAudioContext()
      inner.src = url
      inner.play()
      return
    }
    wx.showToast({ title: '发音马上就来', icon: 'none' })
  },

  onRetry() {
    this.loadDaily()
  },

  onBackToTown() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return {
      title: '我在小小镇学单词，今天又赚了砖块',
      path: '/pages/index/index'
    }
  }
})
