const { MODES, BATCH_SIZE, audioFor, courseFor, courseWords, makeCourseRound, courseLibrary } = require('./photo-course')

const photoCourseData = {
  photoCourses: courseLibrary(), courseProgress: {}, photoCourse: null, courseModes: MODES,
  courseMode: 'meaning', courseBatch: 0, courseBatches: [], courseCard: null, courseCards: [],
  courseCardIndex: 0, courseCardForms: [], courseCardVisible: false, courseRound: null,
  courseMediaReady: false, courseMediaLoading: false, courseMediaError: ''
}
function cardPatch(cards, index = 0) {
  const card = cards[index]
  return { courseCardIndex: index, courseCard: card, courseCardVisible: false,
    courseCardForms: card ? [card.word].concat(card.aliases).map(word => ({ word, audio: audioFor(word), audioPackage: '' })) : [] }
}
function createPhotoCourseMethods(dependencies = {}) {
  const loadMedia = dependencies.loadCoursebook || ((success, fail) =>
    require('../../coursebook/ready.js', () => require('../../coursebook-voice/ready.js', success, fail), fail))
  return {
    refreshCourseProgress(progress = {}) { this.setData({ courseProgress: progress, photoCourses: courseLibrary(progress) }) },
    ensureCourseMedia() {
      if (this.data.courseMediaReady || this.data.courseMediaLoading) return
      this.setData({ courseMediaLoading: true, courseMediaError: '' })
      let settled = false
      const finish = ready => {
        if (settled) return
        settled = true; clearTimeout(this._courseMediaTimer)
        if (this._alive) this.setData({ courseMediaLoading: false, courseMediaReady: ready,
          courseMediaError: ready ? '' : '照片和读音暂时没载入。可以先认词、练拼写，或重新加载。' })
      }
      this._courseMediaTimer = setTimeout(() => finish(false), 15000)
      try { loadMedia(() => finish(true), () => finish(false)) } catch (_) { finish(false) }
    },
    stopPhotoCourse() { clearTimeout(this._courseMediaTimer) },
    onPhotoCourses() {
      this._courseReturnView = this.data.view === 'materials' ? 'materials' : 'home'
      if (this.data.subject !== 'english') this.onSubject({ currentTarget: { dataset: { subject: 'english' } } })
      this.loadNotebook()
      this.changeView('courses', { courseRound: null })
      this.ensureCourseMedia()
    },
    onOpenPhotoCourse(event) { this.openPhotoCourse(event.currentTarget.dataset.id) },
    openPhotoCourse(id, batch = 0) {
      const course = courseFor(id), cards = courseWords(course, batch)
      if (!course || !cards.length) return
      this.loadNotebook()
      const batches = Array.from({ length: Math.ceil(course.count / BATCH_SIZE) }, (_, index) => ({ index,
        label: '第 ' + (index + 1) + ' 组', count: courseWords(course, index).length }))
      this.changeView('course', Object.assign({ photoCourse: course, courseBatch: batch, courseBatches: batches, courseCards: cards, courseRound: null }, cardPatch(cards)))
      this.ensureCourseMedia()
    },
    onCourseBatch(event) {
      if (!this.data.photoCourse) return
      this.openPhotoCourse(this.data.photoCourse.id, Number(event.currentTarget.dataset.batch))
    },
    onCourseCard(event) {
      const index = this.data.courseCardIndex + Number(event.currentTarget.dataset.step)
      if (!Number.isInteger(index) || index < 0 || index >= this.data.courseCards.length) return
      this._audio.stop()
      this.setData(cardPatch(this.data.courseCards, index))
    },
    onCourseFlip() { this.setData({ courseCardVisible: !this.data.courseCardVisible }) },
    onCourseAudio(event) {
      if (this.data.view !== 'course' || !this.data.courseMediaReady) return
      const form = this.data.courseCardForms[Number(event.currentTarget.dataset.form) || 0]
      if (form) { this._teacher.stop(); this._audio.play(form, !!event.currentTarget.dataset.slow) }
    },
    onCourseMode(event) {
      const mode = event.currentTarget.dataset.mode
      if (MODES.some(item => item.id === mode)) this.setData({ courseMode: mode })
    },
    onStartPhotoCourse() {
      const course = this.data.photoCourse, mode = this.data.courseMode, batch = this.data.courseBatch
      if (this.data.view !== 'course' || !course || this.data.subject !== 'english') return
      if (mode === 'listening' && !this.data.courseMediaReady) {
        this.setData({ error: '听音练习需要先加载读音。可以先选择认词或拼写。' }); this.ensureCourseMedia(); return
      }
      const round = makeCourseRound(course.id, mode, batch).map(item => this.data.courseMediaReady ? item : Object.assign({}, item, { audio: '' }))
      this.startRound('english', round, course.label + ' · ' + course.name + ' · 第 ' + (batch + 1) + ' 组', this.data.courseMediaReady ? course.photo : '', false,
        { courseRound: { id: course.id, batch, mode, hasNext: batch + 1 < this.data.courseBatches.length } })
    },
    onNextCourseBatch() {
      const round = this.data.courseRound
      if (this.data.view === 'done' && round && round.hasNext) this.openPhotoCourse(round.id, round.batch + 1)
    },
    recordCoursePractice(question) {
      if (!question.courseID || !question.courseWordID) return
      try { this.refreshCourseProgress(this._book.recordCourseAnswer(question.courseID, question.courseWordID)) }
      catch (error) { this.setData({ notice: '这张词卡的进度未保存。' + error.message }) }
    }
  }
}

module.exports = { photoCourseData, createPhotoCourseMethods }
