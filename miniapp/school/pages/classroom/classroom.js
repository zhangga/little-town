const { withTapSounds } = require('../../../utils/sound-page')
const { createClassroomPage } = require('../../utils/classroom-page')

Page(withTapSounds(createClassroomPage(wx)))
