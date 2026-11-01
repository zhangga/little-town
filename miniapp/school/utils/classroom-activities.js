const { MODES, DEFAULT_MODE, makeActivityRound, makeClassroomRound, lessonsFor, lessonFor } = require('./curriculum')

const activityData = {
  modes: MODES.chinese.slice(1), miniLessons: lessonsFor('chinese'),
  classroom: false, classroomHistory: [], lastClassroom: null, summaryRows: [], scoredTotal: 0, writingOnly: true,
  selectedChoice: '', orderSlots: [], orderOptions: [], heardAudio: false, listeningFallback: false,
  helpOpen: false, usedHelp: false, assistedCount: 0,
  lecture: null, lectureStep: 0, lectureSlide: null, lectureFromQuestion: false,
  lectureAudioState: 'idle', lectureProgress: 0, lectureSlow: false
}
function activityPatch(subject, history = []) {
  return { modes: MODES[subject].slice(1), miniLessons: lessonsFor(subject), lastClassroom: history.find(item => item.subject === subject) || null }
}
function createActivityMethods() {
  return {
    onActivity(event) {
      const mode = event.currentTarget.dataset.mode, subject = this.data.subject
      const selected = MODES[subject].find(item => item.id === mode)
      if (!selected) return
      const round = makeActivityRound(subject, mode, this.data.level, Number(this.data.totals[subject]) || 0)
      this.startRound(subject, round, selected.name, '')
    },
    onStartDrill() {
      const subject = this.data.subject
      this.startRound(subject, makeClassroomRound(subject, this.data.level, Number(this.data.totals[subject]) || 0), this.data.info.name + ' · 课堂小练', '', false, { classroom: true })
    },
    onChoice(event) {
      if (this.data.answered || !this.data.question || this.data.question.kind !== 'choice') return
      const option = this.data.question.options.find(item => item.id === String(event.currentTarget.dataset.id))
      if (option) this.setData({ selectedChoice: option.id, answer: option.label, error: '' })
    },
    updateOrder() {
      const tokens = this.data.question.tokens
      const slots = this._orderIDs.map(id => tokens.find(token => token.id === id))
      this.setData({ orderSlots: slots, orderOptions: tokens.map(token => Object.assign({}, token, { used: this._orderIDs.includes(token.id) })), answer: slots.map(token => token.text).join(' '), error: '' })
    },
    onOrderPick(event) {
      if (this.data.answered || !this.data.question || this.data.question.kind !== 'order') return
      const id = String(event.currentTarget.dataset.id)
      if (!this.data.question.tokens.some(token => token.id === id) || this._orderIDs.includes(id)) return
      this._orderIDs.push(id); this.updateOrder()
    },
    onOrderUndo() { if (!this.data.answered && this.data.question && this.data.question.kind === 'order') { this._orderIDs.pop(); this.updateOrder() } },
    onOrderClear() { if (!this.data.answered && this.data.question && this.data.question.kind === 'order') { this._orderIDs = []; this.updateOrder() } },
    onUseListeningText() {
      const question = this.data.question
      if (!question || !question.listening || this.data.answered || (question.audio && this.data.audioState !== 'error')) return
      this._audio.stop(); this.setData({ listeningFallback: true, usedHelp: true, error: '' })
    },
    onHelp() {
      if (!this.data.question) return
      const opening = !this.data.helpOpen
      this.setData({ helpOpen: opening, usedHelp: this.data.usedHelp || opening })
    },
    onListenHelp() {
      if (!this.data.question) return
      this.setData({ usedHelp: true, helpOpen: true })
      this.openLecture(this.data.question.topicID, true)
    },
    finishRound() {
      const rows = []
      for (const result of this._roundResults) {
        let row = rows.find(item => item.mode === result.mode)
        if (!row) { row = { mode: result.mode, name: result.modeName, total: 0, correct: 0, writing: result.correct === null }; rows.push(row) }
        row.total++; if (result.correct) row.correct++
      }
      if (this.data.classroom && !this.data.reviewing && !this._classroomSaved) {
        this._classroomSaved = true
        try {
          const history = this._book.recordClassroom({ subject: this.data.subject, correct: this.data.correct, total: this.data.scoredTotal, assisted: this.data.assistedCount, rows })
          this.setData(Object.assign({ classroomHistory: history }, activityPatch(this.data.subject, history)))
        } catch (error) { this.setData({ notice: '这轮课堂小练的记录未保存。' + error.message }) }
      }
      this.changeView('done', { summaryRows: rows })
    },
    onLectures() { this.changeView('lectures') },
    onOpenLecture(event) { this.openLecture(event.currentTarget.dataset.id, false) },
    openLecture(id, fromQuestion) {
      const lesson = lessonFor(id)
      if (!lesson || lesson.subject !== this.data.subject) return
      this.changeView('lecture', { lecture: lesson, lectureStep: 0, lectureSlide: lesson.steps[0], lectureFromQuestion: fromQuestion,
        lectureAudioState: 'idle', lectureProgress: 0 })
    },
    onLecturePlay() {
      if (!this._teacher || this.data.view !== 'lecture' || !this.data.lectureSlide) return
      if (['playing', 'loading'].includes(this.data.lectureAudioState)) this._teacher.pause()
      else if (this.data.lectureAudioState === 'paused') this._teacher.resume()
      else { this._audio.stop(); this._teacher.play(this.data.lectureSlide, this.data.lectureSlow) }
    },
    onLectureReplay() {
      if (!this._teacher || this.data.view !== 'lecture') return
      this._audio.stop(); this._teacher.play(this.data.lectureSlide, this.data.lectureSlow)
    },
    onLectureSlow() {
      this.setData({ lectureSlow: !this.data.lectureSlow })
      if (this._teacher) this._teacher.setSlow(this.data.lectureSlow)
    },
    goLectureStep(index) {
      const lesson = this.data.lecture
      if (this.data.view !== 'lecture' || !lesson || !Number.isInteger(index) || index < 0 || index >= lesson.steps.length) return
      this._teacher.stop()
      const slide = lesson.steps[index]
      const version = ++this._lectureNavigationID
      this.setData({ lectureStep: index, lectureSlide: slide, lectureProgress: 0 }, () => {
        if (this._alive && this._visible && version === this._lectureNavigationID && this.data.view === 'lecture' && this.data.lecture === lesson && this.data.lectureStep === index) this._teacher.play(slide, this.data.lectureSlow)
      })
    },
    onLecturePrevious() { this.goLectureStep(this.data.lectureStep - 1) },
    onLectureNext() { this.goLectureStep(this.data.lectureStep + 1) },
    onLectureStep(event) { this.goLectureStep(Number(event.currentTarget.dataset.index)) },
    onLecturePractice() {
      if (this.data.view !== 'lecture' || !this.data.lecture) return
      if (this.data.lectureFromQuestion) { this.onBack(); return }
      this.onActivity({ currentTarget: { dataset: { mode: this.data.lecture.id || DEFAULT_MODE[this.data.subject] } } })
    }
  }
}

module.exports = { activityData, activityPatch, createActivityMethods }
