const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { fixture, harness, tap } = require('./town-life-test.cjs')
const { shopFixture } = require('./town-shop-test.cjs')
const { activityDetails } = require('../miniapp/utils/building-activities')

function activityFixture() {
  const server = fixture()
  // Check the actual API catalog against the shipped local games, including future additions.
  server.activities = [...fs.readFileSync('backend/internal/services/town_activity.go', 'utf8').matchAll(/ID: "([a-z_]+)", Name: "([^"]+)", Building: "([^"]+)", Icon: "([^"]+)", Description: "([^"]+)", Price: (\d+)/g)].map(match => ({
    id: match[1], name: match[2], building: match[3], icon: match[4], description: match[5], price: Number(match[6]), available: true, locked_reason: ''
  }))
  server.buildings = [...new Set(server.activities.map(item => item.building))]
  server.activity_visits = []
  server.event = null
  return server
}
const open = (h, name) => h.page.onPlotTap(tap({ index: h.page.data.plots.findIndex(p => p.name === name) }))
function purchase(_, body, server) {
  let receipt = server.activity_visits.find(item => item.request_id === body.request_id)
  if (!receipt) {
    const item = server.activities.find(item => item.id === body.activity_id)
    server.wallet.coins -= item.price
    receipt = { activity_id: item.id, request_id: body.request_id, name: item.name, building: item.building, icon: item.icon, price: item.price, created_at: '2026-10-23T12:00:00Z' }
    server.activity_visits.unshift(receipt)
  }
  return { ...structuredClone(server), activity_receipt: structuredClone(receipt) }
}
module.exports = { activityFixture, purchase }

if (require.main === module) {
  test('every built venue lists two playable experiences and opening a room is free', async () => {
    const h = await harness({ server: activityFixture(), post: purchase })
    assert.equal(h.server.activities.length, 22)
    for (const building of h.server.buildings) {
      open(h, building)
      assert.equal(h.page.data.selected.activities.length, 2, building)
      assert.ok(h.page.data.selected.interior.room)
      for (const activity of h.page.data.selected.activities) {
        assert.ok(activityDetails(activity.id), activity.id)
        assert.equal(activity.name, activityDetails(activity.id).title, 'the ticket and game must name the same experience')
      }
    }
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0)
    h.page.onUnload()
  })

  test('returning from a paid shop activity preserves drinking water and its spending limits', async () => {
    const server = activityFixture()
    const shop = shopFixture()
    server.supplies = shop.supplies
    server.needs = { ...shop.needs, water: 50 }
    server.wallet.coins = 1
    const activity = server.activities.find(item => item.building === '商店')
    server.activity_visits = [{ activity_id: activity.id, request_id: 'existing-shop-ticket-001', name: activity.name, building: '商店', price: activity.price }]
    const h = await harness({ server })

    open(h, '商店')
    await h.page.onStartBuildingActivity(tap({ id: activity.id }))
    assert.equal(h.page.data.activitySession.id, activity.id)
    assert.equal(h.page.data.town.coins, 1, 'using an existing ticket must leave the drinking-water coin available')
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)

    h.page.onActivityLobby()
    assert.equal(h.page.data.activitySession, null)
    assert.equal(h.page.data.selected.name, '商店')
    const water = h.page.data.selected.supplies.find(item => item.id === 'water')
    assert.equal(water.consume, '买来喝')
    assert.equal(water.needed, true)
    assert.equal(water.affordable, true)
    await h.page.onBuySupply(tap({ id: 'water' }))
    const purchases = h.calls.filter(call => call.method === 'POST')
    assert.equal(purchases.length, 1)
    assert.equal(purchases[0].url, '/town-life/supplies/purchase')
    assert.equal(purchases[0].body.item_id, 'water')
    assert.equal(h.page.data.town.coins, 0)
    assert.equal(h.storage.userInfo.coins, 0)
    assert.equal(h.page.data.life.needs.water, 100)

    h.page.onCloseFeedback()
    assert.equal(h.page.data.selected.supplies.find(item => item.id === 'water').needed, false)
    await h.page.onBuySupply(tap({ id: 'water' }))
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1, 'full water must not buy again')
    assert.deepEqual(h.navigation, [])

    server.needs.water = 25
    h.page.applyLife(server)
    await h.page.onBuySupply(tap({ id: 'water' }))
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1, 'insufficient coins must not submit a purchase')
    assert.deepEqual(h.navigation, ['/pages/learn/learn'])
    h.page.onUnload()
  })

  test('cinema charges authoritative coins once, plays through six scenes, and replays free', async () => {
    const h = await harness({ server: activityFixture(), post: purchase }); open(h, '电影院')
    await h.page.onStartBuildingActivity(tap({ id: 'cinema_cloud' }))
    assert.equal(h.page.data.town.coins, 22)
    assert.equal(h.storage.userInfo.coins, 22)
    const session = h.page.data.activitySession
    assert.equal(session.kind, 'movie'); assert.equal(session.step, 0)
    const caption = session.scene.caption
    await h.page.onStartBuildingActivity(tap({ id: 'cinema_space' }))
    h.strollClock.tick(3600)
    assert.notEqual(h.page.data.activitySession.scene.caption, caption)
    h.page.onActivityPause(); const step = h.page.data.activitySession.step
    h.strollClock.tick(7200); assert.equal(h.page.data.activitySession.step, step)
    h.page.onActivityPause(); h.strollClock.tick(18000)
    assert.equal(h.page.data.activitySession.complete, true)
    assert.equal(h.page._activityTimer, null)
    h.page.onActivityReplay(); assert.equal(h.page.data.activitySession.step, 0)
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 1)
    h.page.onActivityLobby(); h.server.wallet.coins = 0; h.page.applyLife(h.server)
    await h.page.onStartBuildingActivity(tap({ id: 'cinema_cloud' }))
    assert.equal(h.page.data.activitySession.id, 'cinema_cloud')
    assert.equal(h.page.data.pendingActivity, '')
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 1)
    h.page.onUnload(); assert.equal(h.strollClock.pending(), 0)
  })

  test('rapid taps and close requests cannot race admission; hidden movies do not progress', async () => {
    let finish
    const h = await harness({ server: activityFixture(), post: (url, body, server) => new Promise(resolve => { finish = () => resolve(purchase(url, body, server)) }) })
    open(h, '电影院')
    const pending = h.page.onStartBuildingActivity(tap({ id: 'cinema_space' }))
    h.page.onStartBuildingActivity(tap({ id: 'cinema_space' })); h.page.onCloseDetail(); open(h, '学校')
    assert.equal(h.page.data.selected.name, '电影院')
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 1)
    h.page.onHide(); finish(); await pending
    h.strollClock.tick(10000); assert.equal(h.page.data.activitySession.step, 0)
    assert.equal(h.page._activityTimer, null)
    h.page.onShow(); await h.page._loadPromise
    h.strollClock.tick(3600); assert.equal(h.page.data.activitySession.step, 1)
    h.page.onCloseDetail(); assert.equal(h.page._activityTimer, null)
    h.page.onUnload(); assert.equal(h.strollClock.pending(), 0)
  })

  test('lost payment response recovers the paid experience from receipt without another charge', async () => {
    const h = await harness({ server: activityFixture(), post: (url, body, server) => { purchase(url, body, server); throw Error('连接中断') } })
    open(h, '餐厅'); await h.page.onStartBuildingActivity(tap({ id: 'restaurant_soup' }))
    assert.equal(h.page.data.activitySession.id, 'restaurant_soup')
    assert.equal(h.page.data.town.coins, 23)
    assert.equal(h.page.data.pendingActivity, '')
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 1)
    assert.equal(h.errors.length, 0)
    h.page.onUnload()
  })

  test('queued taps from a previous question cannot answer the following round', async () => {
    const h = await harness({ server: activityFixture(), post: purchase }); open(h, '学校')
    await h.page.onStartBuildingActivity(tap({ id: 'school_numbers' }))
    h.page.onActivityChoice(tap({ id: 'three', step: 0 }))
    assert.equal(h.page.data.activitySession.step, 1)
    h.page.onActivityChoice(tap({ id: 'three', step: 0 }))
    assert.equal(h.page.data.activitySession.step, 1)
    h.page.onActivityChoice(tap({ id: 'three', step: 1 }))
    assert.equal(h.page.data.activitySession.step, 2)
    h.page.onUnload()
  })

  test('unconfirmed admission retains its request across closing and a later explicit retry', async () => {
    let attempts = 0
    const h = await harness({ server: activityFixture(), post: (url, body, server) => {
      if (++attempts === 1) throw Error('连接中断')
      return purchase(url, body, server)
    } })
    open(h, '电影院'); await h.page.onStartBuildingActivity(tap({ id: 'cinema_cloud' }))
    assert.equal(h.page.data.activitySession, null)
    assert.equal(h.page.data.pendingActivity, 'cinema_cloud')
    h.page.onCloseDetail(); open(h, '电影院')
    assert.equal(h.page.data.pendingActivity, 'cinema_cloud')
    await h.page.onStartBuildingActivity(tap({ id: 'cinema_cloud' }))
    const requests = h.calls.filter(c => c.method === 'POST')
    assert.equal(requests.length, 2)
    assert.equal(requests[0].body.request_id, requests[1].body.request_id)
    assert.match(requests[0].body.request_id, /^[a-z0-9-]{16,80}$/)
    assert.equal(h.page.data.town.coins, 22)
    h.page.onUnload()
  })

  test('low balance, missing pets, wrong-building IDs and missing server state never grant admission', async () => {
    const server = activityFixture(); server.wallet.coins = 0
    server.activities.filter(item => item.building === '宠物医院').forEach(item => { item.available = false; item.locked_reason = '先领养一位伙伴' })
    const h = await harness({ server, post: purchase }); open(h, '电影院')
    await h.page.onStartBuildingActivity(tap({ id: 'cinema_cloud' }))
    assert.deepEqual(h.navigation, ['/pages/learn/learn'])
    await h.page.onStartBuildingActivity(tap({ id: 'school_words' }))
    open(h, '宠物医院'); await h.page.onStartBuildingActivity(tap({ id: 'vet_groom' }))
    assert.equal(h.page.data.selected.activities[0].locked_reason, '先领养一位伙伴')
    h.page.setData({ life: null }); await h.page.onStartBuildingActivity(tap({ id: 'vet_groom' }))
    assert.equal(h.page.data.activitySession, null)
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0)
    h.page.onUnload()
  })

  test('a payment and reconciliation outage can recover in the open lobby without a second purchase', async () => {
    const h = await harness({ server: activityFixture(), post: (url, body, server) => { purchase(url, body, server); throw Error('连接中断') } })
    const get = h.api.get
    h.api.get = async () => { throw Error('还没连上') }
    open(h, '电影院'); await h.page.onStartBuildingActivity(tap({ id: 'cinema_cloud' }))
    assert.equal(h.page.data.life, null)
    assert.equal(h.page.data.selected.name, '电影院')
    assert.equal(h.page.data.activitySession, null)
    h.api.get = get
    await h.page.loadTown()
    assert.equal(h.page.data.town.coins, 22)
    await h.page.onStartBuildingActivity(tap({ id: 'cinema_cloud' }))
    assert.equal(h.page.data.activitySession.id, 'cinema_cloud')
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 1)
    h.page.onUnload()
  })

  test('unloading during admission never updates a destroyed page or schedules animation', async () => {
    let finish
    const h = await harness({ server: activityFixture(), post: (url, body, server) => new Promise(resolve => { finish = () => resolve(purchase(url, body, server)) }) })
    open(h, '电影院'); const pending = h.page.onStartBuildingActivity(tap({ id: 'cinema_cloud' }))
    h.page.onUnload(); h.page.setData = () => { throw Error('updated disposed page') }
    finish(); await pending
    assert.equal(h.strollClock.pending(), 0)
  })
}
