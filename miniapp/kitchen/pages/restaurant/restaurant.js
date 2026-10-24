const api = require('../../../utils/api')
const { showError, showSuccess } = require('../../../utils/util')
const { withTapSounds } = require('../../../utils/sound-page')
const { createRestaurantPage } = require('../../utils/restaurant-page')

Page(withTapSounds(createRestaurantPage(api, wx, showError, showSuccess)))
