const { withTapSounds } = require('../../utils/sound-page')
const api = require('../../utils/api')
const { showError } = require('../../utils/util')
const { enrichWord, normalize, makePlan, makeQuestion, makePairs } = require('../../utils/learning')
const { createPronunciation } = require('../../utils/pronunciation')
const { makeRewardHeader, makeDailyRewardQuota } = require('../../utils/learning-rewards')

Page(withTapSounds({
  data: {
    loading: true, failed: false, phase: 'ready', words: [], index: 0,
    question: null, picked: -1, answered: false, isCorrect: false,
    earned: { coins: 0, bricks: 0 }, stats: { right: 0, wrong: 0 },
    bonus: { granted: false, bricks: 0 }, saving: false, saveError: false,
    lastReward: { coins: 0, bricks: 0 }, capped: false, unsaved: 0, earnedXP: 0, lastXP: 0,
    mode: 'mixed', listening: true, audioCount: 0, newCount: 0,
    audioState: 'idle', heardAudio: false, flipped: false,
    spellReady: false, reviewCount: 0, reviewIndex: 0, recovered: 0,
    pairs: { left: [], right: [] }, pairLeft: -1, pairRight: -1,
    pairCount: 0, matchWrong: false, matchMessage: '', matchDone: false,
    pairBatch: 0, pairBatches: 0, finished: false, autoAdvancePaused: false,
    freePractice: false, dailyGoal: 5, goalDone: false,
    dailyBrickCap: null, bricksToday: null, bricksPerCorrect: null, dailyRewardQuota: makeDailyRewardQuota({}),
    practiceRewards: null, practiceSettling: false, practiceSettled: false,
    practiceSettlementError: false, practiceError: '', rewardHeader: makeRewardHeader({})
  },

  onLoad() {
    this._alive = true
    this._visible = true
    this._loadID = 0
    this._advanceGeneration = 0
    this._audio = createPronunciation(wx, (patch) => {
      if (this._alive) this.setData(patch)
    })
    if (this.checkAuth()) this.loadDaily()
  },
  onShow() {
    this._visible = true
    // tab 页会缓存；完成后再次进入应准备下一轮，正在答的题保持原样。
    const pendingPractice = this.data.freePractice && this.data.finished && !this.data.practiceSettled
    if (this._alive && !this.data.loading && !pendingPractice && (this.data.phase === 'done' || this.data.failed)) this.loadDaily()
  },
  onHide() {
    this._visible = false
    this.clearAutoAdvance()
    if (this.data.answered) this.setData({ autoAdvancePaused: true })
    if (this._audio) this._audio.stop()
  },
  onUnload() {
    this._alive = false
    this._loadID++
    this.clearAutoAdvance()
    clearTimeout(this._matchTimer)
    if (this._audio) this._audio.stop()
  },
  checkAuth() {
    if (wx.getStorageSync('token')) return true
    wx.redirectTo({ url: '/pages/login/login' })
    return false
  },
  scrollToTop() {
    if (this._visible && wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  setRewardState(patch) {
    const state = Object.assign({}, this.data, patch)
    this.setData(Object.assign({}, patch, { rewardHeader: makeRewardHeader(state), dailyRewardQuota: makeDailyRewardQuota(state) }))
  },

  clearAutoAdvance() {
    clearTimeout(this._advanceTimer)
    this._advanceTimer = null
    // 即使旧计时回调已经进入队列，也不能影响下一道已答完的题。
    this._advanceGeneration++
  },
  canAutoAdvance() {
    return this._alive && this._visible && this.data.answered &&
      !this.data.saving && !this.data.saveError && !this.data.autoAdvancePaused &&
      ['practice', 'review'].includes(this.data.phase)
  },
  scheduleAutoAdvance() {
    this.clearAutoAdvance()
    if (!this.canAutoAdvance()) return
    const generation = this._advanceGeneration
    let audioWait = 0
    const advance = () => {
      if (generation !== this._advanceGeneration || !this.canAutoAdvance()) return
      // 给正常读音留足时间；播放事件丢失时也不会让用户卡在这一题。
      if (['loading', 'playing'].includes(this.data.audioState) && audioWait < 6000) {
        audioWait += 250
        this._advanceTimer = setTimeout(advance, 250)
        return
      }
      this.onNext()
    }
    this._advanceTimer = setTimeout(advance, this.data.isCorrect ? 1600 : 3500)
  },
  onToggleAutoAdvance() {
    if (!this.data.answered || this.data.saving || this.data.saveError) return
    this.setData({ autoAdvancePaused: !this.data.autoAdvancePaused })
    if (this.data.autoAdvancePaused) this.clearAutoAdvance()
    else this.scheduleAutoAdvance()
  },

  async loadDaily() {
    if (!this.checkAuth()) return
    const loadID = ++this._loadID
    this.clearAutoAdvance()
    this._audio.stop()
    clearTimeout(this._matchTimer)
    this.setData({ loading: true, failed: false })
    try {
      const res = await api.get('/learn/daily-words', { practice_after: this._practiceAfter || 0 })
      if (!this._alive || loadID !== this._loadID) return
      const words = ((res && res.words) || []).map(enrichWord)
      const freePractice = res.session_kind === 'practice'
      this._practiceToken = res.practice_token || ''
      this._practiceUnsaved = new Set()
      this._practiceAfter = freePractice ? (Number(res.practice_next_id) || 0) : 0
      this._mistakes = []
      this.setRewardState({
        loading: false, phase: words.length ? 'ready' : 'done', words, index: 0,
        freePractice, dailyGoal: Number(res.daily_goal) || 5, goalDone: !!res.bonus_claimed,
        dailyBrickCap: res.daily_brick_cap == null ? null : res.daily_brick_cap,
        bricksToday: res.bricks_today == null ? null : res.bricks_today,
        bricksPerCorrect: res.bricks_per_correct == null ? null : res.bricks_per_correct,
        question: null, finished: !words.length, answered: false,
        audioCount: words.filter((word) => word.audio).length,
        newCount: words.filter((word) => !word.is_review).length,
        earned: { coins: 0, bricks: 0 }, stats: { right: 0, wrong: 0 },
        bonus: { granted: false, bricks: 0 }, capped: false, earnedXP: 0, lastXP: 0,
        saving: false, saveError: false, unsaved: 0, reviewCount: 0, recovered: 0,
        autoAdvancePaused: false, practiceRewards: res.practice_rewards || null,
        practiceSettling: false, practiceSettled: false, practiceSettlementError: false, practiceError: ''
      })
      this.scrollToTop()
    } catch (err) {
      if (!this._alive || loadID !== this._loadID) return
      this.setData({ loading: false, failed: true })
      showError(err.message || '今天的学习内容加载失败')
    }
  },

  onMode(e) {
    if (this.data.phase !== 'ready') return
    const mode = e.currentTarget.dataset.mode
    if (!['mixed', 'listen', 'spell'].includes(mode)) return
    if (mode === 'listen' && (!this.data.audioCount || !this.data.listening)) return
    this.setData({ mode })
  },
  onToggleListening(e) {
    const listening = !!e.detail.value
    this.setData({ listening, mode: !listening && this.data.mode === 'listen' ? 'mixed' : this.data.mode })
  },
  onStart() {
    if (this.data.phase !== 'ready' || !this.data.words.length) return
    if (this.data.freePractice && !this._practiceToken) {
      showError('复习服务暂不可用，请稍后重新进入')
      return
    }
    this._plan = makePlan(this.data.words, this.data.mode, this.data.listening)
    this._mistakes = []
    this.showStep(0)
  },
  showStep(index) {
    this.clearAutoAdvance()
    this._audio.stop()
    const question = this._plan[index]
    const card = !question.word.is_review && this.data.mode === 'mixed'
    this.setRewardState({
      index, question, phase: card ? 'card' : 'practice', flipped: false,
      picked: -1, answered: false, isCorrect: false, spellReady: false,
      heardAudio: false, saveError: false, lastReward: { coins: 0, bricks: 0 }, lastXP: 0,
      autoAdvancePaused: false
    })
    this.scrollToTop()
    // 新词第一次见面就听读音；翻卡不重播，重听和慢速仍由按钮控制。
    if (card && this._alive && this._visible && this.data.listening && question.word.audio) {
      this._audio.play(question.word, false)
    }
  },
  onFlip() {
    if (this.data.phase === 'card') this.setData({ flipped: true })
  },
  onCardContinue() {
    if (this.data.phase !== 'card' || !this.data.flipped) return
    this._audio.stop()
    this.setData({ phase: 'practice', heardAudio: false })
    this.scrollToTop()
  },

  onPick(e) {
    if (!['practice', 'review'].includes(this.data.phase) || this.data.answered || this.data.saving) return
    if (this.data.question.type === 'listen' && !this.data.heardAudio) return
    const index = Number(e.currentTarget.dataset.index)
    const option = this.data.question.options[index]
    if (!option) return
    this.setData({ picked: index })
    return this.answer(!!option.correct)
  },
  onTile(e) {
    if (this.data.answered || this.data.question.type !== 'spell') return
    const index = Number(e.currentTarget.dataset.index)
    const tiles = this.data.question.tiles.map((tile) => Object.assign({}, tile))
    const slots = this.data.question.slots.map((slot) => Object.assign({}, slot))
    const tile = tiles[index]
    const empty = slots.find((slot) => !slot.fixed && slot.tile < 0)
    if (!tile || tile.used || !empty) return
    tile.used = true
    empty.letter = tile.letter
    empty.tile = index
    this.updateSpelling(slots, tiles)
  },
  onRemoveLetter(e) {
    if (this.data.answered || this.data.question.type !== 'spell') return
    const index = Number(e.currentTarget.dataset.index)
    const tiles = this.data.question.tiles.map((tile) => Object.assign({}, tile))
    const slots = this.data.question.slots.map((slot) => Object.assign({}, slot))
    const slot = slots[index]
    if (!slot || slot.fixed || slot.tile < 0) return
    tiles[slot.tile].used = false
    slot.letter = ''
    slot.tile = -1
    this.updateSpelling(slots, tiles)
  },
  onClearSpelling() {
    if (this.data.answered || this.data.question.type !== 'spell') return
    const slots = this.data.question.slots.map((slot) => Object.assign({}, slot, {
      letter: slot.fixed ? slot.letter : '', tile: -1
    }))
    const tiles = this.data.question.tiles.map((tile) => Object.assign({}, tile, { used: false }))
    this.updateSpelling(slots, tiles)
  },
  updateSpelling(slots, tiles) {
    this.setData({
      'question.slots': slots, 'question.tiles': tiles,
      spellReady: slots.every((slot) => slot.fixed || slot.tile >= 0)
    })
  },
  onCheckSpelling() {
    if (!this.data.spellReady || this.data.answered) return
    const value = this.data.question.slots.map((slot) => slot.letter).join('')
    return this.answer(normalize(value) === normalize(this.data.question.word.word))
  },

  async answer(isCorrect) {
    if (this.data.answered || this.data.saving) return
    this.clearAutoAdvance()
    this._audio.stop()
    this.setData({ answered: true, isCorrect })
    const word = this.data.question.word
    if (this.data.listening && word.audio && this._visible) this._audio.play(word, false)
    // 巩固练习不再次发奖，也不再次推进同一个词的复习等级。
    if (this.data.phase === 'review') {
      if (isCorrect) this.setData({ recovered: this.data.recovered + 1 })
      this.scheduleAutoAdvance()
      return
    }
    if (!isCorrect) this._mistakes.push(word)
    this.setRewardState({
      stats: {
        right: this.data.stats.right + (isCorrect ? 1 : 0),
        wrong: this.data.stats.wrong + (isCorrect ? 0 : 1)
      }, saving: true
    })
    const loadID = this._loadID
    // 自由复习只保存本轮进度；整轮完成后结算，不改变间隔复习和成长。
    if (this.data.freePractice) {
      this._practiceUnsaved.add(word.id)
      try {
        await api.post('/learn/practice/answer', { practice_token: this._practiceToken, word_id: word.id })
        if (!this._alive || loadID !== this._loadID) return
        this._practiceUnsaved.delete(word.id)
        this.setRewardState({ unsaved: this._practiceUnsaved.size })
      } catch (err) {
        if (this._alive && loadID === this._loadID) this.setRewardState({ saveError: true, unsaved: this._practiceUnsaved.size })
      } finally {
        if (this._alive && loadID === this._loadID) {
          this.setRewardState({ saving: false })
          this.scheduleAutoAdvance()
        }
      }
      return
    }
    try {
      const res = await api.post('/learn/submit-answer', { word_id: word.id, is_correct: isCorrect })
      if (!this._alive) return
      const coins = Number(res.coins_earned) || 0
      const bricks = Number(res.bricks_earned) || 0
      const xp = Math.max(0, Number(res.xp_earned) || 0)
      const patch = {
        earnedXP: this.data.earnedXP + xp, lastXP: xp,
        earned: { coins: this.data.earned.coins + coins, bricks: this.data.earned.bricks + bricks },
        lastReward: { coins, bricks }, capped: !!res.capped
      }
      if (typeof res.bricks_today === 'number') patch.bricksToday = res.bricks_today
      if (typeof res.daily_cap === 'number') patch.dailyBrickCap = res.daily_cap
      if (res.bonus_granted) {
        patch.bonus = { granted: true, bricks: res.bonus_bricks || 0 }
        patch.goalDone = true
      }
      this.setRewardState(patch)
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && typeof res.total_coins === 'number') {
        userInfo.coins = res.total_coins
        userInfo.bricks = res.total_bricks
        wx.setStorageSync('userInfo', userInfo)
      }
    } catch (err) {
      // 超时可能已到账，保留提示，由下次进入小镇同步服务端余额。
      if (this._alive) this.setRewardState({ saveError: true, unsaved: this.data.unsaved + 1 })
    } finally {
      if (this._alive) {
        this.setRewardState({ saving: false })
        this.scheduleAutoAdvance()
      }
    }
  },
  onNext() {
    if (!this.data.answered || this.data.saving) return
    this.clearAutoAdvance()
    if (this.data.phase === 'review') {
      const next = this.data.reviewIndex + 1
      if (next < this._mistakes.length) this.showReview(next)
      else this.startMatching()
      return
    }
    if (this.data.phase !== 'practice') return
    const next = this.data.index + 1
    if (next < this._plan.length) this.showStep(next)
    else if (this._mistakes.length) this.showReview(0)
    else this.startMatching()
  },
  showReview(index) {
    this.clearAutoAdvance()
    this._audio.stop()
    const word = this._mistakes[index]
    this.setRewardState({
      phase: 'review', reviewIndex: index, reviewCount: this._mistakes.length,
      question: makeQuestion(word, this.data.words, 'spell', this.data.listening),
      picked: -1, answered: false, isCorrect: false, spellReady: false,
      heardAudio: false, saveError: false, autoAdvancePaused: false, lastXP: 0
    })
    this.scrollToTop()
  },

  startMatching() {
    this.clearAutoAdvance()
    this._audio.stop()
    this._pairBatch = 0
    this.showPairBatch()
  },
  showPairBatch() {
    const batch = this._pairBatch
    const words = this.data.words.slice(batch * 5, batch * 5 + 5)
    if (!words.length) return this.finish()
    this.setData({
      phase: 'match', question: null, pairs: makePairs(words),
      pairLeft: -1, pairRight: -1, pairCount: 0, matchWrong: false,
      matchMessage: '点一个英文，再找到它的中文朋友', matchDone: false,
      pairBatch: batch + 1, pairBatches: Math.ceil(this.data.words.length / 5)
    })
    this.scrollToTop()
  },
  onMatchPick(e) {
    if (this.data.phase !== 'match' || this.data.matchWrong || this.data.matchDone) return
    const side = e.currentTarget.dataset.side
    const index = Number(e.currentTarget.dataset.index)
    if (!['left', 'right'].includes(side)) return
    const item = this.data.pairs[side][index]
    if (!item || item.matched) return
    this.setData({ [side === 'left' ? 'pairLeft' : 'pairRight']: index })
    const { pairLeft, pairRight, pairs } = this.data
    if (pairLeft < 0 || pairRight < 0) return
    if (pairs.left[pairLeft].pair !== pairs.right[pairRight].pair) {
      this.setData({ matchWrong: true, matchMessage: '这两个不是一对，再试试' })
      this._matchTimer = setTimeout(() => {
        if (this._alive) this.setData({ pairLeft: -1, pairRight: -1, matchWrong: false })
      }, 650)
      return
    }
    const count = this.data.pairCount + 1
    this.setData({
      ['pairs.left[' + pairLeft + '].matched']: true,
      ['pairs.right[' + pairRight + '].matched']: true,
      pairLeft: -1, pairRight: -1, pairCount: count,
      matchDone: count === pairs.left.length,
      matchMessage: count === pairs.left.length ? '都找到朋友了！' : '配对成功，继续找下一对'
    })
  },
  onMatchNext() {
    if (this.data.phase !== 'match' || !this.data.matchDone) return
    this._pairBatch++
    this.showPairBatch()
  },
  finish() {
    if (this.data.finished) return
    this.clearAutoAdvance()
    this._audio.stop()
    this.setData({ phase: 'done', finished: true, question: null })
    this.scrollToTop()
    if (this.data.freePractice) return this.settlePractice()
    this.maybeRequestSubscribe()
  },

  async settlePractice(retry = false) {
    if (!this.data.freePractice || !this.data.finished || this.data.practiceSettling || this.data.practiceSettled) return
    const loadID = this._loadID
    const token = this._practiceToken
    this.setRewardState({ practiceSettling: true, practiceSettlementError: false, practiceError: '' })
    try {
      if (this._practiceUnsaved.size && !retry) throw new Error('有复习进度尚未保存，请重新确认奖励')
      // 手动重试使用同一票据；后端按单词去重，结果不明也不会重复计数。
      for (const wordID of this._practiceUnsaved) {
        await api.post('/learn/practice/answer', { practice_token: token, word_id: wordID })
        if (!this._alive || loadID !== this._loadID) return
        this._practiceUnsaved.delete(wordID)
      }
      const res = await api.post('/learn/practice/complete', { practice_token: token })
      if (!this._alive || loadID !== this._loadID) return
      this.setRewardState({
        earned: { bricks: Number(res.round_bricks) || 0, coins: Number(res.round_coins) || 0 },
        practiceRewards: res.practice_rewards, practiceSettled: true, capped: !!res.capped,
        practiceSettlementError: false, unsaved: 0
      })
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && typeof res.total_coins === 'number' && typeof res.total_bricks === 'number') {
        userInfo.coins = res.total_coins
        userInfo.bricks = res.total_bricks
        wx.setStorageSync('userInfo', userInfo)
      }
    } catch (err) {
      if (this._alive && loadID === this._loadID) this.setRewardState({ practiceSettlementError: true, practiceError: err.message || '奖励结果还没确认，请重试' })
    } finally {
      if (this._alive && loadID === this._loadID) this.setRewardState({ practiceSettling: false })
    }
  },
  onRetryPracticeReward() { return this.settlePractice(true) },

  onPlayAudio(e) {
    if (!this.data.question) return
    if (this.data.answered) {
      this.clearAutoAdvance()
      this.setData({ autoAdvancePaused: true })
    }
    const slow = !!(e && e.currentTarget.dataset.slow)
    this._audio.play(this.data.question.word, slow)
  },
  onSkipListening() {
    if (!this.data.question || this.data.question.type !== 'listen' || this.data.answered) return
    this._audio.stop()
    this.setData({
      question: makeQuestion(this.data.question.word, this.data.words, 'meaning', false),
      heardAudio: false, picked: -1
    })
  },

  async maybeRequestSubscribe() {
    try {
      const info = await api.subscription.info()
      if (!this._alive || !this._visible || !info || !info.configured || !info.should_request || !info.template_id) return
      if (!wx.requestSubscribeMessage) return
      wx.requestSubscribeMessage({
        tmplIds: [info.template_id],
        success: async (res) => {
          const accepted = res[info.template_id] === 'accept'
          try { await api.subscription.grant(accepted) } catch (err) { console.warn('记录订阅结果失败', err) }
          if (accepted) wx.showToast({ title: '明天会提醒你复习', icon: 'none', duration: 2000 })
        },
        fail: () => { api.subscription.grant(false).catch(() => {}) }
      })
    } catch (err) {
      console.warn('获取订阅状态失败', err)
    }
  },
  onRetry() { if (!this.data.loading && !this.data.practiceSettling) return this.loadDaily() },
  onGoProfile() { wx.switchTab({ url: '/pages/profile/profile' }) },
  onBackToTown() { wx.switchTab({ url: '/pages/index/index' }) },
  onShareAppMessage() {
    return { title: '听一听、拼一拼，我在小小镇学单词', path: '/pages/index/index' }
  }
}))
