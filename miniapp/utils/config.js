// utils/config.js
// 所有需要随环境变化的配置集中在这里，改一处即可。
//
// 关于本地联调：
//   开发者工具模拟器里，localhost 指向你运行后端的这台电脑，可以直接用。
//   真机预览时 localhost 会指向手机本身，请求必然失败——
//   真机测试需要内网穿透（cpolar / ngrok）或部署到已备案的 HTTPS 域名。

// 环境地址表
const ENV = {
  // 本地开发：开发者工具模拟器可用
  develop: 'http://localhost:8080/api/v1',

  // 体验版：填内网穿透地址或测试服地址
  trial: 'http://172.29.64.1:8080/api/v1',

  // 正式版：必须是已备案的 HTTPS 域名，且已在微信后台配置为 request 合法域名
  release: ''
}

// 当前生效的地址。
// 自动按小程序环境切换：开发者工具=develop，体验版=trial，正式版=release
function resolveBaseURL() {
  try {
    const account = wx.getAccountInfoSync()
    const envVersion = account && account.miniProgram && account.miniProgram.envVersion
    const url = ENV[envVersion]
    if (url) return url
  } catch (err) {
    // 极低版本基础库不支持 getAccountInfoSync，回落到开发地址
    console.warn('无法识别小程序环境，回落到开发地址', err)
  }
  return ENV.develop
}

const API_BASE_URL = resolveBaseURL()

// 请求超时（毫秒）。微信登录需要回源，给足余量
const REQUEST_TIMEOUT = 10000

module.exports = {
  API_BASE_URL,
  ENV,
  REQUEST_TIMEOUT
}
