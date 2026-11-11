const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const vm = require('node:vm')
const { COURSES, MODES, courseFor, courseWords, makeCourseRound, courseLibrary, audioFor } = require('../miniapp/school/utils/photo-course')
const { checkAnswer } = require('../miniapp/school/utils/content')
const { normalizeQuestion, checkQuestion } = require('../miniapp/school/utils/curriculum')
const { createNotebook } = require('../miniapp/school/utils/notebook')
const { harness, tap, input } = require('./school-harness.cjs')

function open(h, id = 'unit-1', batch = 0, mode = 'meaning') {
  h.page.onPhotoCourses()
  h.page.openPhotoCourse(id, batch)
  h.page.onCourseMode(tap({ mode }))
}
function answer(h, correct = true) {
  const p = h.page, q = p.data.question
  if (q.kind === 'choice') {
    if (q.listening) h.audioState({ heardAudio: true, audioState: 'idle' })
    p.onChoice(tap({ id: q.options.find(option => (option.label === q.answer) === correct).id }))
  } else p.onAnswer(input(correct ? q.word : 'not this word'))
  p.onCheck()
  assert.equal(p.data.answered, true)
  assert.equal(p.data.isCorrect, correct)
  p.onNext()
}

test('ten source photos provide 182 traceable cards, including all nine units and the story vocabulary', () => {
  assert.deepEqual(COURSES.map(c => c.count), [18, 15, 21, 21, 20, 16, 19, 20, 18, 14])
  assert.deepEqual(COURSES.map(c => c.photoNumber).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const cards = COURSES.flatMap(c => c.words)
  assert.equal(new Set(cards.map(w => w.courseWordID)).size, 182)
  assert.equal(courseFor('missing'), null)
  assert.deepEqual(courseWords(null), [])
  assert.equal(courseFor('unit-3').words.find(w => w.word === 'cook').translation, '厨师')
  assert.equal(courseFor('unit-7').words.find(w => w.word === 'cook').translation, '煮饭')
  assert.match(courseFor('unit-6').note, /cloudy/)
  assert.match(courseFor('unit-8').note, /Ferris wheel/)
  assert.match(courseFor('kangaroo-story').note, /只整理/)
})

test('each mode covers the whole selected unit exactly once across five-card groups, without ambiguous options', () => {
  for (const course of COURSES) {
    for (const mode of MODES) {
      const ids = []
      for (let batch = 0; batch < Math.ceil(course.count / 5); batch++) {
        const round = makeCourseRound(course.id, mode.id, batch, () => 0.37)
        assert.equal(round.length, Math.min(5, course.count - batch * 5))
        for (const item of round) {
          ids.push(item.courseWordID)
          const q = normalizeQuestion('english', item)
          assert.equal(q.audio, item.audio, 'the photo course keeps its packaged audio even for existing words')
          assert.equal(q.audioPackage, '')
          assert.equal(checkQuestion('english', q.kind === 'choice' ? q.answer : q.word, q).correct, true)
          if (q.kind === 'choice') {
            assert.equal(q.options.length, 4)
            assert.equal(new Set(q.options.map(o => o.label)).size, 4)
            assert.equal(q.options.filter(o => o.label === q.answer).length, 1)
            assert.equal(q.display, q.listening ? '' : q.word)
            const forms = [q.word].concat(q.aliases).map(form => form.toLowerCase())
            for (const other of course.words.filter(w => [w.word].concat(w.aliases).some(form => forms.includes(form.toLowerCase())))) {
              if (other.translation !== q.answer) assert.ok(!q.options.some(o => o.label === other.translation))
            }
          }
        }
      }
      assert.equal(new Set(ids).size, course.count)
      assert.equal(makeCourseRound(course.id, mode.id, Math.ceil(course.count / 5)).length, 0)
    }
  }
  assert.deepEqual(makeCourseRound('unit-1', 'unknown'), [])
  assert.deepEqual(makeCourseRound('unit-1', 'meaning', -1), [])
  assert.deepEqual(makeCourseRound('unit-1', 'meaning', 0.5), [])
})

test('spelling accepts every recorded variant, including full phrases, plurals and British/American floors', () => {
  for (const item of COURSES.flatMap(c => c.words)) {
    for (const form of [item.word].concat(item.aliases)) assert.equal(checkAnswer('english', '  ' + form.toUpperCase().replace(/ /g, '   ') + ' ', item).correct, true, form)
    assert.equal(checkAnswer('english', '', item).empty, true)
    assert.equal(checkAnswer('english', 'something unrelated', item).correct, false)
  }
  const shower = courseFor('unit-1').words.find(w => w.word === 'have a shower')
  assert.ok(checkAnswer('english', 'take a shower', shower).correct)
  assert.equal(checkAnswer('english', 'take', shower).correct, false)
})

test('opening and reading the built-in book spends no reward, progress or custom-material slots', () => {
  let starts = 0
  const h = harness({ subject: 'english', createRewards: () => ({ begin() { starts++; return {} }, refresh() {}, stop() {} }) })
  open(h)
  const p = h.page
  assert.equal(p.data.view, 'course'); assert.equal(p.data.courseMediaReady, true)
  p.onCourseFlip(); assert.equal(p.data.courseCardVisible, true)
  p.onCourseAudio(tap({ form: 0, slow: true })); assert.deepEqual(h.audioCalls.at(-1), ['field', true])
  p.onCourseCard(tap({ step: 1 })); assert.equal(p.data.courseCard.word, 'forest'); assert.equal(p.data.courseCardVisible, false)
  p.onCourseBatch(tap({ batch: 3 })); assert.equal(p.data.courseCards.length, 3)
  assert.equal(starts, 0); assert.equal(p.data.totals.english, 0); assert.equal(p.data.lessonCount, 0)
  assert.ok(p.data.photoCourses.every(c => c.practiced === 0))
  p.onBack(); assert.equal(p.data.view, 'courses'); p.onBack(); assert.equal(p.data.view, 'home')
  p.onUnload()
})

test('answering a group uses English rewards, persists practiced words and keeps mistakes tied to their course', () => {
  const sessions = [], awards = []
  const h = harness({ subject: 'english', createRewards: () => ({
    begin(subject, questions, kind) { const round = { subject, questions, kind }; sessions.push(round); return round },
    answer(round, index, correct) { awards.push({ round, index, correct }) }, complete() {}, refresh() {}, stop() {}
  }) })
  const p = h.page
  open(h); p.onStartPhotoCourse()
  assert.equal(sessions.length, 1); assert.equal(sessions[0].subject, 'english'); assert.equal(sessions[0].kind, 'learning')
  assert.ok(p.data.lessonPhoto.endsWith('/unit-1.jpg'))
  answer(h, false)
  for (let i = 1; i < 5; i++) answer(h)
  assert.equal(p.data.view, 'done'); assert.equal(p.data.correct, 4)
  assert.equal(awards.length, 5); assert.equal(p.data.photoCourses[0].practiced, 5)
  p.onReviewMistakes(); assert.equal(p.data.total, 1); assert.equal(p.data.courseRound.id, 'unit-1')
  answer(h); assert.equal(awards.length, 5, 'mistake review must not issue fresh rewards')
  p.onAgain(); assert.equal(p.data.courseRound.id, 'unit-1')
  answer(h); p.onBack(); assert.equal(p.data.view, 'course')
  p.onStartPhotoCourse(); for (let i = 0; i < 5; i++) answer(h)
  p.onNextCourseBatch(); assert.equal(p.data.courseBatch, 1); assert.equal(p.data.courseCard.word, 'leaf')
  const reloaded = harness({ subject: 'english', storage: h.storage })
  assert.equal(reloaded.page.data.photoCourses[0].practiced, 5)
  reloaded.page.onUnload(); p.onUnload()
})

test('last group is short, synonyms are accepted on the page and duplicate checks cannot count twice', () => {
  const h = harness({ subject: 'english' }), p = h.page
  open(h, 'unit-1', 1, 'spelling'); p.onStartPhotoCourse()
  p.onAnswer(input('LEAVES')); p.onCheck(); assert.equal(p.data.isCorrect, true)
  p.onCheck(); assert.equal(p.data.totals.english, 1)
  p.onBack(); p.openPhotoCourse('kangaroo-story', 2); p.onStartPhotoCourse()
  assert.equal(p.data.total, 4); assert.equal(p.data.courseRound.hasNext, false)
  p.onUnload()
})

test('listening requires finished audio and method-lesson navigation preserves course and current answer', () => {
  const h = harness({ subject: 'english' }), p = h.page
  open(h, 'unit-5', 0, 'listening'); p.onStartPhotoCourse()
  const q = p.data.question
  p.onChoice(tap({ id: q.options.find(o => o.label === q.answer).id })); p.onCheck()
  assert.equal(p.data.answered, false); assert.match(p.data.error, /完整听/)
  p.onListenHelp(); assert.equal(p.data.view, 'lecture')
  p.onBack(); assert.equal(p.data.view, 'practice'); assert.equal(p.data.question.courseWordID, q.courseWordID)
  assert.equal(p.data.answer, q.answer); assert.equal(p.data.courseRound.id, 'unit-5')
  h.audioState({ heardAudio: true }); p.onCheck(); assert.equal(p.data.isCorrect, true)
  p.onSubject(tap({ subject: 'math' })); assert.equal(p.data.courseRound, null)
  p.onStart(); assert.equal(p.data.subject, 'math'); assert.equal(p.data.courseRound, null)
  p.onUnload()
})

test('failed resource loading keeps text study available, retries explicitly and ignores stale/unloaded callbacks', () => {
  const loads = [], h = harness({ subject: 'english', loadCoursebook: (success, fail) => loads.push({ success, fail }) }), p = h.page
  open(h)
  assert.equal(loads.length, 1, 'opening a card while loading must not start a second package load')
  loads[0].fail(); assert.match(p.data.courseMediaError, /重新加载/)
  p.onCourseMode(tap({ mode: 'listening' })); p.onStartPhotoCourse()
  assert.equal(p.data.view, 'course'); assert.match(p.data.error, /先加载/); assert.equal(loads.length, 2)
  loads[0].success(); assert.equal(p.data.courseMediaReady, false)
  p.onCourseMode(tap({ mode: 'spelling' })); p.onStartPhotoCourse(); assert.equal(p.data.view, 'practice')
  p.onBack(); loads[1].success(); assert.equal(p.data.courseMediaReady, true)
  p.onUnload()
  const late = [], other = harness({ loadCoursebook: success => late.push(success) })
  other.page.onPhotoCourses(); other.page.onUnload()
  other.page.setData = () => { throw Error('unloaded page changed') }
  late[0]()
})

test('materials entry works from another subject and returns to the notebook', () => {
  const h = harness(), p = h.page
  p.onMaterials(); p.onPhotoCourses(); assert.equal(p.data.subject, 'english')
  p.onBack(); assert.equal(p.data.view, 'materials')
  p.onUnload()
})

test('production loader waits for both resource packages and can retry a failed voice load', () => {
  const loads = [], module = { exports: {} }
  const filename = path.resolve(__dirname, '../miniapp/school/utils/photo-course-page.js')
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, setTimeout, clearTimeout,
    require(name, success, fail) {
      if (name === './photo-course') return require('../miniapp/school/utils/photo-course')
      loads.push({ name, success, fail })
    }
  }, { filename })
  const page = { ...module.exports.createPhotoCourseMethods(), _alive: true,
    data: { courseMediaReady: false, courseMediaLoading: false }, setData(patch) { Object.assign(this.data, patch) } }
  page.ensureCourseMedia()
  assert.equal(loads[0].name, '../../coursebook/ready.js')
  loads[0].success(); assert.equal(loads[1].name, '../../coursebook-voice/ready.js')
  assert.equal(page.data.courseMediaReady, false)
  loads[1].fail(); assert.equal(page.data.courseMediaLoading, false)
  page.ensureCourseMedia(); loads[2].success(); loads[3].success()
  assert.equal(page.data.courseMediaReady, true)
  page.stopPhotoCourse()
})

test('course progress migrates old notebooks, isolates accounts/backends and never invents a failed save', () => {
  const h = harness(), book = createNotebook(h.wxApi, 'local:1')
  h.storage['school-notebook:v1:local:1'] = { lessons: [], totals: { chinese: 2, math: 3, english: 4 }, classroomHistory: [] }
  assert.deepEqual(book.read().courseProgress, {})
  book.recordCourseAnswer('unit-1', 'unit-1:0'); book.recordCourseAnswer('unit-1', 'unit-1:0')
  assert.equal(courseLibrary(book.read().courseProgress)[0].practiced, 1)
  assert.deepEqual(createNotebook(h.wxApi, 'local:2').read().courseProgress, {})
  assert.deepEqual(createNotebook(h.wxApi, 'cloudrun:1').read().courseProgress, {})
  h.failStorage(true)
  assert.throws(() => book.recordCourseAnswer('unit-1', 'unit-1:1'), /保存/)
  assert.equal(courseLibrary(book.read().courseProgress)[0].practiced, 1)
  assert.equal(book.read().totals.english, 4)
  h.page.onUnload()
})

test('photos and every canonical/variant recording are packaged, hashed, and stay inside the 2 MiB budget', () => {
  const root = path.resolve(__dirname, '../miniapp'), media = path.join(root, 'coursebook')
  const manifest = JSON.parse(fs.readFileSync(path.join(media, 'manifest.json')))
  const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  for (const course of COURSES) {
    const photo = path.join(root, course.photo)
    assert.equal(sha(photo), manifest.photos[course.id].sha256)
    assert.ok(manifest.photos[course.id].source.endsWith('-' + course.photoNumber + '.jpg'))
    for (const item of course.words) for (const form of [item.word].concat(item.aliases)) {
      const audio = path.join(root, audioFor(form)), info = manifest.clips[path.basename(audio)]
      assert.ok(info && info.duration > 0, form)
      assert.equal(sha(audio), info.sha256)
    }
  }
  const size = folder => fs.readdirSync(folder, { withFileTypes: true }).reduce((n, entry) => n + (entry.isDirectory() ? size(path.join(folder, entry.name)) : fs.statSync(path.join(folder, entry.name)).size), 0)
  assert.ok(size(media) < 2 * 1024 * 1024)
  assert.ok(size(path.join(root, 'coursebook-voice')) < 2 * 1024 * 1024)
  assert.ok(size(path.join(root, 'school')) < 2 * 1024 * 1024)
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')))
  for (const folder of ['coursebook-voice/audio', 'coursebook/photos']) assert.ok(config.packOptions.include.some(item => item.value === folder))
})
