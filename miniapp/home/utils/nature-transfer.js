const ids = ['glass', 'white_glass', 'mirror']
function validTransfer(value) {
  if (!value || !Number.isSafeInteger(value.sequence) || value.sequence < 1) return null
  const items = {}
  for (const id of ids) { const n = value.items && value.items[id]; if (Number.isInteger(n) && n > 0 && n <= 999) items[id] = n }
  return Object.keys(items).length ? { sequence: value.sequence, items } : null
}
// Write the debited source first. Its outbox survives a failed destination save,
// while the world's receipt survives a failed acknowledgement of that outbox.
function transferCrafts(wxApi, sourceKey, destinationKey, world) {
  let source = wxApi.getStorageSync(sourceKey)
  if (!source || source.version !== 1 || !source.inventory) return 0
  let pending = validTransfer(source.pendingTransfer)
  if (!pending) {
    const items = {}
    for (const id of ids) { const n = source.inventory[id]; if (Number.isInteger(n) && n > 0 && n <= 999) items[id] = n }
    if (!Object.keys(items).length) return 0
    const previous = Number.isSafeInteger(source.transferSequence) && source.transferSequence > 0 ? source.transferSequence : 0
    pending = { sequence: Math.max(previous, world.natureTransfer) + 1, items }
    source = { ...source, inventory: { ...source.inventory }, transferSequence: pending.sequence, pendingTransfer: pending }
    for (const id of Object.keys(items)) source.inventory[id] = 0
    wxApi.setStorageSync(sourceKey, source)
  }
  const received = world.receiveNatureTransfer(pending)
  wxApi.setStorageSync(destinationKey, world.serialize())
  const acknowledged = { ...source }; delete acknowledged.pendingTransfer
  wxApi.setStorageSync(sourceKey, acknowledged)
  const count = received ? Object.values(pending.items).reduce((sum, n) => sum + n, 0) : 0
  return count + (ids.some(id => Number.isInteger(acknowledged.inventory[id]) && acknowledged.inventory[id] > 0 && acknowledged.inventory[id] <= 999) ? transferCrafts(wxApi, sourceKey, destinationKey, world) : 0)
}
module.exports = { validTransfer, transferCrafts }
