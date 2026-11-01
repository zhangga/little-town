// Persist pending submissions before sending. Receipts are cumulative, so retries never add twice.
function createSchoolRewards(wxApi, owner, onChange, api) {
  const key = 'school-reward-outbox:v1:' + owner
  let pending = [], statuses = {}, running = null, stopped = false, revision = 0, error = '', notice = ''
  try {
    const stored = wxApi.getStorageSync(key)
    if (stored && !Array.isArray(stored)) throw Error('invalid queue')
    pending = stored || []
  } catch (_) { error = '待确认奖励暂时读不到，请重新进入学校。' }
  function sameOwner() {
    const user = wxApi.getStorageSync('userInfo') || {}
    return (wxApi.getStorageSync('apiBackend') || 'local') + ':' + user.id === owner && !!wxApi.getStorageSync('token')
  }
  function publish(session) {
    if (!stopped && sameOwner()) onChange({ statuses, session, busy: !!running, error, notice, pending: pending.length })
  }
  function persist() {
    try { wxApi.setStorageSync(key, pending) }
    catch (_) { throw Error('待确认奖励暂时存不下，请清理设备空间后点“重新确认奖励”。') }
  }
  function receive(session, receipt) {
    if (stopped || !sameOwner()) return
    revision++
    if (receipt.rewards) statuses[receipt.rewards.subject] = receipt.rewards
    session.receipt = receipt
    const user = wxApi.getStorageSync('userInfo')
    if (user && Number.isFinite(receipt.total_bricks) && Number.isFinite(receipt.total_coins)) {
      try { wxApi.setStorageSync('userInfo', Object.assign({}, user, { bricks: receipt.total_bricks, coins: receipt.total_coins })) }
      catch (_) { notice = '奖励已到账，回小镇时会重新读取余额。' }
    }
    publish(session)
  }
  function enqueue(session) {
    if (session.disabled) return
    if (!pending.includes(session)) pending.push(session)
    try { persist() } catch (err) { error = err.message; publish(session); return }
    flush()
  }
  function flush() {
    if (running || stopped || !pending.length || !sameOwner()) return running || Promise.resolve()
    error = ''
    // Defer work one microtask so busy state and the promise are set before callbacks run.
    running = Promise.resolve().then(async () => {
      while (pending.length && !stopped && sameOwner()) {
        const session = pending[0]
        try {
          persist()
          receive(session, await api.post('/learn/school/start', session.request))
          if (stopped || !sameOwner()) break
          while (session.saved < session.answers.length) {
            const answer = session.answers[session.saved]
            const receipt = await api.post('/learn/school/answer', { round_id: session.request.round_id, index: answer.index, correct: answer.correct })
            if (stopped || !sameOwner()) break
            receive(session, receipt); session.saved++; persist()
          }
          if (stopped || !sameOwner()) break
          if (session.finished && !(session.receipt || {}).completed) {
            receive(session, await api.post('/learn/school/complete', { round_id: session.request.round_id }))
          }
          if (stopped || !sameOwner()) break
          pending.shift(); persist()
        } catch (err) {
          if (err.statusCode === 400 || err.statusCode === 410) {
            session.disabled = true; notice = err.message; pending.shift()
            try { persist() } catch (saveError) { error = saveError.message; break }
            publish(session)
          } else { error = err.message || '学习奖励暂未确认，请稍后重试。'; break }
        }
      }
    }).finally(() => { running = null; publish() })
    publish()
    return running
  }
  return {
    begin(subject, questions, kind) {
      if (pending.length >= 20) throw Error('还有一些奖励待确认，先点“重新确认奖励”，再开始新一轮。')
      const id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
      const session = { request: { round_id: id, subject, kind, questions }, answers: [], saved: 0, finished: false }
      // Starting a local round spends no quota. The first answer persists the entire request.
      return session
    },
    answer(session, index, correct) {
      if (!session || session.disabled || session.answers.some(answer => answer.index === index)) return
      session.answers.push({ index, correct }); enqueue(session)
    },
    complete(session) { if (session && !session.disabled) { session.finished = true; enqueue(session) } },
    flush,
    async refresh() {
      if (stopped || !sameOwner()) return
      const version = revision
      try {
        const result = await api.get('/learn/school/rewards')
        if (stopped || !sameOwner()) return
        if (version === revision) statuses = result.subjects || {}
        if (!pending.length) error = ''
      } catch (err) { if (!stopped) error = err.message || '奖励次数暂时没读到，可以稍后重新确认。' }
      publish(); return flush()
    },
    stop() { stopped = true }
  }
}

function rewardQuestion(question) {
  const clean = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return { kind: question.kind,
    key: [question.mode, question.text, question.display, question.prompt, question.passage, question.translation, question.word, question.answer].map(clean).join('|'),
    word: question.word || '', translation: question.translation || '' }
}
module.exports = { createSchoolRewards, rewardQuestion }
