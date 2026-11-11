const api = require('../../../utils/api')
const { withTapSounds } = require('../../../utils/sound-page')
const { showError } = require('../../../utils/util')
const { saveWallet } = require('../../../utils/resident')
const { createSandboxPage, worldData } = require('../../utils/sandbox-page')
const controller = createSandboxPage(api, wx, showError)
const applyWorldState = controller.applyWorldState
controller.applyWorldState = function (state) { if (this._disposed) return; applyWorldState.call(this, state); saveWallet(state.wallet) }
Page(withTapSounds(Object.assign(controller, { data: Object.assign({}, worldData) })))
