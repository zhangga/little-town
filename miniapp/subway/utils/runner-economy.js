// Persist receipts before sending. A retry always keeps the original identifier.
function requestID() { return 'metro-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14) }
function createEconomy(api, wx, owner, current) {
  const key = 'subwayPending:v2:' + owner
  let startID = ''
  const read = () => wx.getStorageSync(key) || {}
  const write = value => wx.setStorageSync(key, value)
  function check() { if (!current()) throw Error('账号已切换，请重新进入地铁站') }
  return {
    pending: read,
    async load() { check(); return api.get('/subway') },
    async start() {
      check()
      if (read().finish) throw Error('上一程还未结算，请先领取星光币')
      startID = startID || requestID()
      const state = await api.post('/subway/start', { request_id: startID })
      if (!state.run || !state.run.run_id) throw Error('出发记录没能确认，请重试')
      startID = ''
      return state
    },
    checkpoint(run, id) {
      if (!id || !current()) return
      const pending = read()
      pending.finish = { run_id: id, coins: run.coins, stars: run.stars, distance: Math.floor(run.distance), elapsed: run.elapsed }
      write(pending)
    },
    async settle() {
      check(); const result = read().finish
      if (!result) return this.load()
      const state = await api.post('/subway/finish', result)
      check()
      const pending = read()
      if (pending.finish && pending.finish.run_id === result.run_id) { delete pending.finish; write(pending) }
      return state
    },
    discard() { check(); const pending = read(); delete pending.finish; write(pending) },
    async purchase(itemID) {
      check(); const pending = read()
      if (pending.purchase && pending.purchase.item_id !== itemID) throw Error('先完成上次购买，再选择新商品')
      if (!pending.purchase) { pending.purchase = { item_id: itemID, request_id: requestID() }; write(pending) }
      const receipt = pending.purchase
      const state = await api.post('/subway/purchase', receipt)
      check(); const latest = read()
      if (latest.purchase && latest.purchase.request_id === receipt.request_id) { delete latest.purchase; write(latest) }
      return state
    },
    async equip(itemID) { check(); return api.post('/subway/equip', { item_id: itemID }) }
  }
}
module.exports = { createEconomy, requestID }
