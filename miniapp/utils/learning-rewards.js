// 顶部奖励展示：区分本轮实际到账与完成整轮后可领取的奖励。
function makeRewardHeader(state) {
  const stats = state.stats || {}
  const earned = state.earned || {}
  const total = (state.words || []).length
  const attempted = Math.min(total, (Number(stats.right) || 0) + (Number(stats.wrong) || 0))
  const header = {
    title: '本轮已到账',
    bricks: String(Number(earned.bricks) || 0),
    coins: String(Number(earned.coins) || 0),
    progress: '已答 ' + attempted + '/' + total + ' · 答对 ' + (Number(stats.right) || 0),
    note: '答对后奖励会实时累计'
  }
  if (state.freePractice) {
    const rewards = state.practiceRewards
    if (state.practiceSettled && !state.capped) {
      header.note = '本轮复习奖励已存进小镇'
    } else if (state.capped || (rewards && Number(rewards.remaining_rounds) === 0)) {
      header.title = '今日复习奖励已领满'
      header.bricks = header.coins = '—'
      header.note = '还可以继续练习，明天恢复奖励'
    } else {
      header.title = state.practiceSettling ? '正在确认到账' : state.practiceSettlementError ? '奖励待确认' : '完成本轮可得'
      header.bricks = rewards && rewards.bricks_per_round != null ? String(rewards.bricks_per_round) : '—'
      header.coins = rewards && rewards.coins_per_round != null ? String(rewards.coins_per_round) : '—'
      header.note = '完成本轮题目和配对后到账'
    }
    if (state.practiceSettlementError) header.note = state.practiceError || '奖励结果待确认，请重新确认奖励'
    else if (state.saveError || state.unsaved) header.note = '有复习进度待确认，完成后可重新确认奖励'
    else if (state.saving) header.note = '正在保存本题，完成整轮后一起领取'
    return header
  }
  if (state.saving) header.note = '正在保存本题，稍后更新到账数'
  else if (state.saveError || state.unsaved) header.note = '有 ' + (state.unsaved || 1) + ' 题奖励待确认，回小镇可核对余额'
  else if (state.phase === 'review') header.note = '错词巩固不重复发奖，本轮收获保留'
  else if (state.capped) header.note = '今日答题砖块已领满，金币按实际到账累计'
  else if (Number(stats.right) > 0 && !Number(earned.bricks) && !Number(earned.coins)) {
    header.title = '这些词今天已领奖'
    header.bricks = header.coins = '—'
    header.note = '答对的词今天已领过奖励，继续练习也能巩固记忆'
  } else if (state.answered && state.isCorrect && !(state.lastReward || {}).bricks && !(state.lastReward || {}).coins) header.note = '这个词今天已领过奖励'
  else if (Number(earned.bricks) || Number(earned.coins)) header.note = '本轮答题奖励已实时累计'
  return header
}

function makeDailyRewardQuota(state) {
  const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
  const cap = count(state.dailyBrickCap)
  const today = count(state.bricksToday)
  const perAnswer = count(state.bricksPerCorrect)
  const practice = state.practiceRewards || {}
  const practiceCap = count(practice.daily_round_cap)
  const practiceRemaining = count(practice.remaining_rounds)
  return {
    answerRemaining: cap !== null && today !== null && perAnswer > 0 ? Math.floor(Math.max(0, cap - today) / perAnswer) : '—',
    answerCap: cap !== null && perAnswer > 0 ? Math.floor(cap / perAnswer) : '—',
    practiceRemaining: practiceRemaining === null ? '—' : practiceCap === null ? practiceRemaining : Math.min(practiceCap, practiceRemaining),
    practiceCap: practiceCap === null ? '—' : practiceCap,
    completionRemaining: state.goalDone ? 0 : 1
  }
}

module.exports = { makeRewardHeader, makeDailyRewardQuota }
