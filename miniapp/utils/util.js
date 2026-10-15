// 格式化时间
function formatTime(date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

function formatNumber(n) {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

// 格式化日期 (YYYY-MM-DD)
function formatDate(date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  return `${year}-${formatNumber(month)}-${formatNumber(day)}`
}

// 显示加载提示
function showLoading(title = '加载中...') {
  wx.showLoading({
    title,
    mask: true
  })
}

// 隐藏加载提示
function hideLoading() {
  wx.hideLoading()
}

// 显示成功提示
function showSuccess(title = '操作成功') {
  wx.showToast({
    title,
    icon: 'success',
    duration: 2000
  })
}

// 显示错误提示
function showError(title = '操作失败') {
  wx.showToast({
    title,
    icon: 'none',
    duration: 2000
  })
}

// 确认对话框
function showConfirm(options) {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: options.title || '提示',
      content: options.content || '',
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      success: (res) => {
        if (res.confirm) {
          resolve(true)
        } else {
          resolve(false)
        }
      },
      fail: reject
    })
  })
}

// 防抖函数
function debounce(fn, delay = 500) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

// 节流函数
function throttle(fn, delay = 500) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= delay) {
      fn.apply(this, args)
      lastTime = now
    }
  }
}

// 检查是否登录
function checkLogin() {
  const token = wx.getStorageSync('token')
  if (!token) {
    wx.redirectTo({
      url: '/pages/login/login'
    })
    return false
  }
  return true
}

module.exports = {
  formatTime,
  formatDate,
  formatNumber,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  showConfirm,
  debounce,
  throttle,
  checkLogin
}
