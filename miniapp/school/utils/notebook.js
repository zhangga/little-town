const { parseMaterial, subjectInfo } = require('./content')
const LIMIT = 16
let sequence = 0
const empty = () => ({ lessons: [], totals: { chinese: 0, math: 0, english: 0 }, classroomHistory: [] })

function createNotebook(wxApi, owner) {
  const key = 'school-notebook:v1:' + owner
  const photoPrefix = wxApi.env && wxApi.env.USER_DATA_PATH ? wxApi.env.USER_DATA_PATH + '/school-photo-' : ''
  function read() {
    const value = wxApi.getStorageSync(key)
    if (!value) return empty()
    if (!value || !Array.isArray(value.lessons) || !value.totals) throw Error('教材暂时没能读出来，请退出教室后重试。')
    const state = JSON.parse(JSON.stringify(value))
    if (!Array.isArray(state.classroomHistory)) state.classroomHistory = []
    return state
  }
  function write(value) {
    try { wxApi.setStorageSync(key, value) } catch (_) { throw Error('本机存储没有保存成功，请清理空间后重试。') }
  }
  function removePhoto(photo) {
    if (!photoPrefix || !photo || !photo.startsWith(photoPrefix)) return
    try { wxApi.getFileSystemManager().unlink({ filePath: photo, fail() {} }) } catch (_) {}
  }
  async function saveLesson(draft) {
    const items = parseMaterial(draft.subject, draft.text)
    const state = read()
    if (state.lessons.length >= LIMIT) throw Error('教材本放满了（最多 ' + LIMIT + ' 份），先删除不需要的教材吧。')
    const id = Date.now().toString(36) + '-' + (++sequence).toString(36)
    let photo = ''
    if (draft.photo) {
      if (!photoPrefix || !wxApi.getFileSystemManager) throw Error('当前微信无法保存照片，请更新微信后重试。')
      const suffix = /\.(png|jpe?g|webp)$/i.exec(draft.photo)
      photo = photoPrefix + id + '.' + (suffix ? suffix[1].toLowerCase() : 'jpg')
      try {
        await new Promise((resolve, reject) => wxApi.getFileSystemManager().copyFile({ srcPath: draft.photo, destPath: photo, success: resolve, fail: reject }))
      } catch (_) { removePhoto(photo); throw Error('照片没有保存成功，请重新选择照片后再试。') }
    }
    const lesson = { id, subject: draft.subject, title: (draft.title || '').trim().slice(0, 30) || '我的' + subjectInfo(draft.subject).name + '教材', text: draft.text.trim(), items, photo, createdAt: Date.now() }
    // 照片复制期间可能完成了其他练习，提交时读取最新的次数。
    try {
      const latest = read()
      if (latest.lessons.length >= LIMIT) throw Error('教材本放满了，先删除不需要的教材吧。')
      latest.lessons.unshift(lesson)
      write(latest)
    } catch (error) { removePhoto(photo); throw error }
    return lesson
  }
  function removeLesson(id) {
    const state = read(), lesson = state.lessons.find(item => item.id === id)
    if (!lesson) return
    state.lessons = state.lessons.filter(item => item.id !== id)
    write(state)
    removePhoto(lesson.photo)
  }
  function record(subject) {
    const state = read()
    state.totals[subject] = (Number(state.totals[subject]) || 0) + 1
    write(state)
    return state.totals
  }
  function recordClassroom(result) {
    const state = read()
    state.classroomHistory.unshift(Object.assign({}, result, { completedAt: Date.now() }))
    state.classroomHistory = state.classroomHistory.slice(0, 12)
    write(state)
    return state.classroomHistory
  }
  return { read, saveLesson, removeLesson, record, recordClassroom }
}

module.exports = { createNotebook, LIMIT }
