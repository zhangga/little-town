const sound = require('./sound')

// 只给真实点击配音，生命周期、输入、代码调用和冒泡拦截都保持安静。
const SILENT_HANDLERS = new Set([
  'onNoop', 'onPlayAudio', 'onToggleMusic', 'onToggleEffects',
  'onToggleSound', 'onMusicChange', 'onEffectsChange'
])

function withTapSounds(definition, effects = {}) {
  const page = Object.assign({}, definition)
  let depth = 0
  Object.keys(page).forEach(name => {
    const handler = page[name]
    if (typeof handler !== 'function' || SILENT_HANDLERS.has(name)) return
    page[name] = function (...args) {
      const tap = depth === 0 && args[0] && args[0].type === 'tap'
      let result
      depth++
      try {
        result = handler.apply(this, args)
      } finally {
        depth--
      }
      if (tap) {
        // 保持在同一次用户手势里；先让自动朗读登记状态，避免点击音盖住单词。
        try { sound.retryMusic() } catch (_) {}
        try { sound.playEffect(effects[name] || 'tap') } catch (_) {}
      }
      return result
    }
  })
  return page
}

module.exports = { withTapSounds }
