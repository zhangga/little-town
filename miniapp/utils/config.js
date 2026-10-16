// 三种运行目标共用页面与业务接口。开发版默认本机，体验/正式版默认云托管。
const TARGETS = {
  local: {
    transport: 'http',
    baseURL: 'http://localhost:8080/api/v1',
    timeout: 10000
  },
  cloudrun: {
    transport: 'cloudrun',
    env: 'prod-d4g0vweip50ea1139',
    service: 'golang-y91h',
    apiPrefix: '/api/v1',
    publicURL: 'https://golang-y91h-329751-5-1317371943.sh.run.tcloudbase.com',
    timeout: 60000
  },
  server: {
    transport: 'http',
    // 自建部署后填写 https://你的域名/api/v1，再将相应版本的 ENV 改为 server。
    baseURL: '',
    timeout: 10000
  }
}

const ENV = {
  develop: 'local',
  trial: 'cloudrun',
  release: 'cloudrun'
}

function getEnvVersion() {
  try {
    const account = wx.getAccountInfoSync()
    const version = account && account.miniProgram && account.miniProgram.envVersion
    if (!version) throw new Error('missing envVersion')
    return version
  } catch (err) {
    // 仅明确处于开发者工具时允许兼容回落；手机上无法识别环境则停止请求。
    try {
      const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
      if (info.platform === 'devtools') return 'develop'
    } catch (ignored) {}
    throw new Error('无法识别运行环境，请更新微信后再试')
  }
}

function resolveConfig(envVersion = getEnvVersion()) {
  const target = ENV[envVersion]
  const settings = TARGETS[target]
  if (!settings) throw new Error('未配置小程序运行环境：' + envVersion)

  const config = Object.assign({ target, envVersion }, settings)
  if (config.transport === 'http') {
    if (!config.baseURL || !/^https?:\/\/[^/]+/.test(config.baseURL)) {
      throw new Error('请配置 ' + target + ' 的后端地址')
    }
    config.baseURL = config.baseURL.replace(/\/+$/, '')
    if (envVersion !== 'develop' && !/^https:\/\//.test(config.baseURL)) {
      throw new Error('体验版和正式版的自建后端必须配置 HTTPS 地址')
    }
  } else if (config.transport === 'cloudrun') {
    if (!config.env || !config.service || !/^\//.test(config.apiPrefix)) {
      throw new Error('云托管环境、服务名或接口前缀未配置')
    }
  } else {
    throw new Error('不支持的请求方式：' + config.transport)
  }
  return config
}

module.exports = { TARGETS, ENV, resolveConfig }
