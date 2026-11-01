const { SUBJECTS, EXAMPLES, subjectInfo, parseMaterial } = require('./content')
const { createNotebook } = require('./notebook')
const { createHandwriting } = require('./handwriting')
const { createPronunciation } = require('../../utils/pronunciation')
const { createLessonPlayer } = require('./lesson-player')
const { DEFAULT_MODE, normalizeQuestion, checkQuestion } = require('./curriculum')
const { activityData, activityPatch, createActivityMethods } = require('./classroom-activities')
const { rewardData, rewardPatch, createRewardMethods } = require('./classroom-rewards')

function createClassroomPage(wxApi, dependencies = {}) {
  const audioFactory = dependencies.createAudio || createPronunciation
  const padFactory = dependencies.createPad || createHandwriting
  const teacherFactory = dependencies.createTeacher || createLessonPlayer
  return Object.assign({
    data: Object.assign({}, activityData, rewardData, {
      subjects: SUBJECTS, subject: 'chinese', info: subjectInfo('chinese'), view: 'home',
      level: '20', totals: { chinese: 0, math: 0, english: 0 }, lessons: [], lessonCount: 0,
      lessonTitle: '', lessonPhoto: '', question: null, index: 0, total: 0, answer: '',
      answered: false, isCorrect: false, correct: 0, mistakeCount: 0, feedback: '', reviewing: false,
      guide: true, hasInk: false, strokeCount: 0, canvasReady: false, canvasError: '', audioState: 'idle',
      error: '', notice: '', saving: false, choosing: false, draftTitle: '', draftText: '', draftPhoto: '',
      draftSubject: 'chinese', example: EXAMPLES.chinese, draftCount: 0
    }),
    onLoad(options = {}) {
      this._alive = true; this._visible = true; this._viewVersion = 0; this._lectureNavigationID = 0
      if (!wxApi.getStorageSync('token')) { wxApi.redirectTo({ url: '/pages/login/login' }); return }
      const user = wxApi.getStorageSync('userInfo') || {}
      if (!user.id) { wxApi.redirectTo({ url: '/pages/login/login' }); return }
      this._book = createNotebook(wxApi, (wxApi.getStorageSync('apiBackend') || 'local') + ':' + user.id)
      this._audio = audioFactory(wxApi, patch => { if (this._alive) this.setData(patch) })
      this._teacher = teacherFactory(wxApi, patch => { if (this._alive) this.setData(patch) })
      this._pad = padFactory(this, wxApi, patch => { if (this._alive) this.setData(patch) })
      const subject = subjectInfo(options.subject).id
      this.setData(Object.assign({ subject, info: subjectInfo(subject) }, activityPatch(subject)))
      this.loadNotebook()
      this.initRewards((wxApi.getStorageSync('apiBackend') || 'local') + ':' + user.id)
    },
    onShow() {
      this._visible = true
      if (this._rewards) this._rewards.refresh()
      if (this._pad && this.data.view === 'practice' && this.data.question && this.data.question.kind === 'writing') this.initPad()
    },
    onHide() {
      this._visible = false; this._viewVersion++; this._lectureNavigationID++
      if (this._audio) this._audio.stop()
      if (this._teacher) this._teacher.stop()
      if (this._pad) this._pad.suspend()
    },
    onUnload() {
      this._alive = false; this._viewVersion++; this._lectureNavigationID++
      if (this._audio) this._audio.stop()
      if (this._teacher) this._teacher.stop()
      if (this._pad) this._pad.destroy()
      if (this._rewards) this._rewards.stop()
    },
    onResize() { if (this.data.view === 'practice' && this.data.question && this.data.question.kind === 'writing') this.initPad() },
    loadNotebook() {
      if (!this._book) return
      try {
        const state = this._book.read()
        this.setData(Object.assign({ totals: state.totals, lessonCount: state.lessons.length, classroomHistory: state.classroomHistory,
          lessons: state.lessons.map(lesson => Object.assign({}, lesson, { subjectName: subjectInfo(lesson.subject).name, count: lesson.items.length })) }, activityPatch(this.data.subject, state.classroomHistory)))
      } catch (error) { this.setData({ notice: error.message }) }
    },
    changeView(view, patch = {}, done) {
      this._viewVersion++
      this._lectureNavigationID++
      if (this._audio) this._audio.stop()
      if (this._teacher) this._teacher.stop()
      if (this._pad) this._pad.suspend()
      this.setData(Object.assign({ view, error: '' }, patch), () => {
        if (this._alive && done) done()
        if (wxApi.pageScrollTo && this._visible) wxApi.pageScrollTo({ scrollTop: 0, duration: 0 })
      })
    },
    onSubject(event) {
      if (this.data.saving || this.data.choosing) return
      const subject = subjectInfo(event.currentTarget.dataset.subject).id
      if (this.data.view === 'editor') {
        if (subject === this.data.draftSubject) return
        this.setData({ draftSubject: subject, example: EXAMPLES[subject], draftCount: 0, error: '' })
        this.updateDraftCount()
        return
      }
      if (subject === this.data.subject && this.data.view === 'home') return
      this.changeView('home', Object.assign({ subject, info: subjectInfo(subject) }, activityPatch(subject, this.data.classroomHistory), rewardPatch(this.data.rewardStatuses, subject)))
    },
    onLevel(event) { this.setData({ level: ['20', '100', 'times'].includes(event.currentTarget.dataset.level) ? event.currentTarget.dataset.level : '20' }) },
    onStart() {
      this.onActivity({ currentTarget: { dataset: { mode: DEFAULT_MODE[this.data.subject] } } })
    },
    startRound(subject, items, title, photo, reviewing = false, options = {}) {
      if (!this._book || !items.length) return
      const prepared = items.map(item => normalizeQuestion(subject, item))
      if (!this.prepareRewardRound(subject, prepared, reviewing, options.rewardKind || 'learning')) return
      this._round = prepared
      const round = this._round
      this._mistakes = []; this._roundResults = []; this._classroomSaved = false
      const scoredTotal = round.filter(item => item.kind !== 'writing').length
      this.changeView('practice', Object.assign({ subject, info: subjectInfo(subject), lessonTitle: title, lessonPhoto: photo || '',
        index: 0, total: items.length, correct: 0, mistakeCount: 0, reviewing, question: null, answered: false, hasInk: false, canvasReady: false,
        classroom: !!options.classroom, assistedCount: 0, summaryRows: [], scoredTotal, writingOnly: scoredTotal === 0 }, activityPatch(subject, this.data.classroomHistory)), () => {
        if (this._round === round && this.data.view === 'practice') this.loadQuestion()
      })
    },
    loadQuestion() {
      const question = this._round[this.data.index]
      if (this._audio) this._audio.stop()
      if (this._teacher) this._teacher.stop()
      if (this._pad) this._pad.reset(question.text || '')
      this._orderIDs = []
      this.setData({ question, answer: '', answered: false, isCorrect: false, feedback: '', error: '', canvasError: '',
        selectedChoice: '', orderSlots: [], orderOptions: question.tokens || [], heardAudio: false, listeningFallback: false, helpOpen: false, usedHelp: false }, () => {
        if (question.kind === 'writing') this.initPad()
      })
    },
    initPad() {
      const version = this._viewVersion
      const init = () => {
        if (this._alive && this._visible && version === this._viewVersion && this.data.view === 'practice' && this.data.question && this.data.question.kind === 'writing') this._pad.init()
      }
      if (wxApi.nextTick) wxApi.nextTick(init)
      else init()
    },
    onRetryCanvas() { this.initPad() },
    onWriteStart(event) { if (!this.data.answered && this._pad) this._pad.start(event) },
    onWriteMove(event) { if (!this.data.answered && this._pad) this._pad.move(event) },
    onWriteEnd() { if (this._pad) this._pad.end() },
    onUndo() { if (!this.data.answered) this._pad.undo() },
    onClear() { if (!this.data.answered) this._pad.clear() },
    onGuide() { this.setData({ guide: !this.data.guide }); this._pad.toggleGuide(this.data.guide) },
    onAnswer(event) { if (!this.data.answered) this.setData({ answer: event.detail.value, error: '' }) },
    recordPractice() {
      try { this.setData({ totals: this._book.record(this.data.subject) }) }
      catch (error) { this.setData({ notice: '这次练习次数未保存。' + error.message }) }
    },
    onCheck() {
      if (this.data.view !== 'practice' || this.data.answered || !this.data.question) return
      const question = this.data.question
      if (question.kind === 'writing') {
        if (!this.data.hasInk) { this.setData({ error: '先在田字格里写一写，再点“我写好了”。' }); return }
        this._pad.end()
        this.setData({ answered: true, feedback: '写好了！对照范字，看看有没有漏笔。' })
      } else {
        if (question.listening && !this.data.heardAudio && !this.data.listeningFallback) { this.setData({ error: '先完整听一遍发音，再检查答案。' }); return }
        if (question.kind === 'order' && this._orderIDs.length < question.tokens.length) { this.setData({ error: '把所有词语排好，再检查句子。' }); return }
        const result = checkQuestion(this.data.subject, this.data.answer, question)
        if (result.empty) { this.setData({ error: question.kind === 'choice' ? '先选一个答案，再检查。' : this.data.subject === 'math' ? '先输入一个数字，再检查答案。' : '先输入英文，再检查拼写。' }); return }
        if (!result.correct) this._mistakes.push(this.data.question)
        const expected = question.solution
        this.setData({ answered: true, isCorrect: result.correct, correct: this.data.correct + (result.correct ? 1 : 0),
          mistakeCount: this._mistakes.length, feedback: result.correct ? '答对啦，继续加油！' : '再记一记：' + expected })
      }
      this._roundResults.push({ mode: question.mode, modeName: question.modeName, correct: question.kind === 'writing' ? null : this.data.isCorrect, assisted: this.data.usedHelp })
      this.setData({ assistedCount: this.data.assistedCount + (this.data.usedHelp ? 1 : 0) })
      this.recordPractice()
      if (this._rewards && !this.data.reviewing) this._rewards.answer(this._rewardRound, this.data.index, question.kind === 'writing' || this.data.isCorrect)
    },
    onNext() {
      if (!this.data.answered || this.data.view !== 'practice') return
      if (this.data.index + 1 >= this.data.total) { this.finishRound(); return }
      const index = this.data.index + 1, round = this._round
      // setData 的渲染回调是异步的，先锁住“下一题”，避免连点跳过未答题目。
      this.setData({ index, answered: false, question: null }, () => {
        if (this._alive && this.data.view === 'practice' && this._round === round && this.data.index === index) this.loadQuestion()
      })
    },
    onReviewMistakes() {
      if (this.data.view !== 'done' || !this._mistakes || !this._mistakes.length) return
      this.startRound(this.data.subject, this._mistakes.slice(), this.data.lessonTitle, this.data.lessonPhoto, true)
    },
    onAgain() {
      if (this.data.view === 'done') this.startRound(this.data.subject, this._round, this.data.lessonTitle, this.data.lessonPhoto, false,
        { classroom: this.data.classroom, rewardKind: this.data.roundRewardKind })
    },
    onPlayAudio(event) {
      if (!this._audio || !this.data.question || !this.data.question.audio) return
      if (this._teacher) this._teacher.stop()
      this._audio.play(this.data.question, !!(event.currentTarget.dataset.slow))
    },
    onEnglishCourse() { wxApi.switchTab({ url: '/pages/learn/learn' }) },
    onMaterials() { this.loadNotebook(); this.changeView('materials') },
    onBack() {
      if (this.data.saving || this.data.choosing) return
      if (this.data.view === 'lecture') {
        const target = this.data.lectureFromQuestion ? 'practice' : 'lectures'
        this.changeView(target, {}, () => { if (target === 'practice' && this.data.question && this.data.question.kind === 'writing') this.initPad() })
        return
      }
      this.changeView(this.data.view === 'editor' ? 'materials' : 'home')
    },
    onAddMaterial() {
      this.changeView('editor', { draftTitle: '', draftText: '', draftPhoto: '', draftSubject: this.data.subject,
        example: EXAMPLES[this.data.subject], draftCount: 0 })
    },
    onDraftTitle(event) { this.setData({ draftTitle: event.detail.value }) },
    onDraftText(event) { this.setData({ draftText: event.detail.value, error: '' }); this.updateDraftCount() },
    updateDraftCount() {
      let count = 0
      try { count = parseMaterial(this.data.draftSubject, this.data.draftText).length } catch (_) {}
      this.setData({ draftCount: count })
    },
    onChoosePhoto() {
      if (this.data.saving || this.data.choosing) return
      this.setData({ choosing: true, error: '' })
      const success = result => {
        if (!this._alive) return
        const photo = result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath || result.tempFilePaths && result.tempFilePaths[0]
        this.setData(photo ? { draftPhoto: photo, choosing: false } : { choosing: false, error: '没有拿到照片，请再选一次。' })
      }
      const fail = error => {
        if (this._alive) this.setData({ choosing: false, error: /cancel/i.test(error && error.errMsg || '') ? '' : '照片没选成功，请检查相机或相册权限后重试。' })
      }
      try {
        if (wxApi.chooseMedia) wxApi.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'], success, fail })
        else wxApi.chooseImage({ count: 1, sourceType: ['album', 'camera'], sizeType: ['compressed'], success, fail })
      } catch (_) { fail({}) }
    },
    onRemovePhoto() { if (!this.data.saving) this.setData({ draftPhoto: '' }) },
    onPreviewPhoto(event) {
      const photo = event.currentTarget.dataset.photo
      if (photo) wxApi.previewImage({ current: photo, urls: [photo], fail: () => { if (this._alive) this.setData({ error: '照片暂时打不开，可以继续用文字练习。' }) } })
    },
    async onSaveMaterial() {
      if (this.data.saving || this.data.choosing || !this._book) return
      this.setData({ saving: true, error: '' })
      try {
        await this._book.saveLesson({ subject: this.data.draftSubject, title: this.data.draftTitle, text: this.data.draftText, photo: this.data.draftPhoto })
        if (!this._alive) return
        this.loadNotebook()
        this.changeView('materials', { saving: false, draftPhoto: '', draftText: '', draftTitle: '' })
        wxApi.showToast({ title: '教材存好啦', icon: 'success' })
      } catch (error) { if (this._alive) this.setData({ saving: false, error: error.message }) }
    },
    onStudyMaterial(event) {
      const lesson = this.data.lessons.find(item => item.id === event.currentTarget.dataset.id)
      if (lesson) this.startRound(lesson.subject, lesson.items, lesson.title, lesson.photo)
    },
    onDeleteMaterial(event) {
      const lesson = this.data.lessons.find(item => item.id === event.currentTarget.dataset.id)
      if (!lesson) return
      wxApi.showModal({ title: '删除这份教材？', content: '“' + lesson.title + '”和附上的照片将从本机教材本移除。', confirmText: '删除',
        success: result => {
          if (!result.confirm || !this._alive) return
          try { this._book.removeLesson(lesson.id); this.loadNotebook() }
          catch (error) { this.setData({ error: error.message }) }
        } })
    }
  }, createActivityMethods(), createRewardMethods(wxApi, dependencies))
}

module.exports = { createClassroomPage }
