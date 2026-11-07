const api = require('../../../utils/api')
const { withTapSounds } = require('../../../utils/sound-page')
const { createRunnerPage } = require('../../utils/runner-page')

Page(withTapSounds(createRunnerPage(api, wx)))
