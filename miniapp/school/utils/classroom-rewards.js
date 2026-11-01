const api = require('../../utils/api')
const { createSchoolRewards, rewardQuestion } = require('./reward-client')
const { makeClassroomRound } = require('./curriculum')

const rewardData = {
  rewardStatuses: {}, subjectReward: null, rewardBusy: false, rewardError: '', rewardNotice: '', rewardPending: 0,
  rewardAnswerRemaining: '—', rewardAnswerCap: '—', roundRewardBricks: 0, roundRewardCoins: 0,
  roundRewardKind: 'learning', roundRewardSettled: false, roundRewardDisabled: false
}
function rewardPatch(statuses, subject) {
  const status = statuses[subject]
  return { rewardStatuses: statuses, subjectReward: status || null,
    rewardAnswerRemaining: status ? Math.max(0, Math.floor((status.daily_brick_cap - status.bricks_today) / status.bricks_per_correct)) : '—',
    rewardAnswerCap: status ? Math.floor(status.daily_brick_cap / status.bricks_per_correct) : '—' }
}
function createRewardMethods(wxApi, dependencies) {
  return {
    initRewards(owner) {
      const factory = dependencies.createRewards || createSchoolRewards
      this._rewards = factory(wxApi, owner, update => {
        if (!this._alive) return
        const session = update.session
        const patch = Object.assign(rewardPatch(update.statuses, this.data.subject), {
          rewardBusy: update.busy, rewardError: update.error, rewardNotice: update.notice, rewardPending: update.pending
        })
        if (session && session === this._rewardRound) Object.assign(patch, {
          roundRewardBricks: session.receipt && session.receipt.round_bricks || 0,
          roundRewardCoins: session.receipt && session.receipt.round_coins || 0,
          roundRewardSettled: !!(session.receipt && session.receipt.completed), roundRewardDisabled: !!session.disabled
        })
        this.setData(patch)
      }, dependencies.api || api)
    },
    prepareRewardRound(subject, round, reviewing, kind) {
      try {
        this._rewardRound = reviewing || !this._rewards ? null : this._rewards.begin(subject, round.map(rewardQuestion), kind)
        this.setData(Object.assign(rewardPatch(this.data.rewardStatuses, subject), { roundRewardKind: kind,
          roundRewardBricks: 0, roundRewardCoins: 0, roundRewardSettled: false, roundRewardDisabled: false }))
        return true
      } catch (error) { this.setData({ rewardError: error.message }); return false }
    },
    onRetryRewards() { if (this._rewards) return this._rewards.refresh() },
    onRewardPractice() {
      const subject = this.data.subject
      const goal = this.data.subjectReward ? this.data.subjectReward.daily_goal : 10
      const items = [], offset = Number(this.data.totals[subject]) || 0
      while (items.length < goal) items.push(...makeClassroomRound(subject, this.data.level, offset + items.length))
      this.startRound(subject, items.slice(0, goal), this.data.info.name + ' · 整轮复习', '', false, { classroom: true, rewardKind: 'practice' })
    }
  }
}
module.exports = { rewardData, rewardPatch, createRewardMethods }
