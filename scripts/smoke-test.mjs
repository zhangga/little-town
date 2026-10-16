#!/usr/bin/env node
/**
 * 后端接口冒烟测试
 *
 * 在打开微信开发者工具之前先跑这个，确认后端整条链路是通的。
 * 覆盖：健康检查 → 登录 → 今日单词 → 答题发奖 → 建造 → 小镇 → 统计 → 家长报告
 *
 * 用法（需要 Node 18+，用内置 fetch）：
 *   node scripts/smoke-test.mjs
 *   node scripts/smoke-test.mjs http://localhost:8080   # 指定后端地址
 *
 * 注意：会往数据库写入一个测试账号（dev smoke test）。重复运行会复用该账号。
 */

const BASE = (process.argv[2] || 'http://localhost:8080') + '/api/v1'

let pass = 0
let fail = 0
const failures = []

function ok(name, detail) {
  pass++
  console.log('  \x1b[32m✓\x1b[0m ' + name + (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''))
}

function bad(name, detail) {
  fail++
  failures.push(name + (detail ? ' — ' + detail : ''))
  console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? '  ' + detail : ''))
}

function section(title) {
  console.log('\n\x1b[1m' + title + '\x1b[0m')
}

async function req(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch (e) {
    throw new Error('无法连接后端 ' + BASE + ' —— 后端启动了吗？(' + e.message + ')')
  }

  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON 响应 */ }
  return { status: res.status, data: json, raw: text }
}

/**
 * 通过答题攒够指定数量的砖块。
 *
 * 后端有每日奖励上限（默认 20 块），所以这里最多能攒到上限值；
 * 上限本身由下面的 [9] 单独验证。
 */
async function earnBricks(token, target, maxRounds = 30) {
  let bricks = 0
  for (let round = 0; round < maxRounds; round++) {
    const profile = await req('GET', '/user/profile', { token })
    bricks = profile.data?.bricks ?? 0
    if (bricks >= target) return bricks

    const daily = await req('GET', '/learn/daily-words', { token })
    const words = daily.data?.words ?? []
    if (words.length === 0) break

    for (const w of words) {
      await req('POST', '/learn/submit-answer', {
        token,
        body: { word_id: w.id, is_correct: true }
      })
    }
  }
  const profile = await req('GET', '/user/profile', { token })
  return profile.data?.bricks ?? bricks
}

async function main() {
  console.log('\x1b[1m小小镇后端冒烟测试\x1b[0m')
  console.log('后端地址: ' + BASE)

  // ---------- 0. 健康检查 ----------
  section('[0] 健康检查')
  {
    const base = BASE.replace('/api/v1', '')
    let res
    try {
      res = await fetch(base + '/health')
      const d = await res.json()
      if (res.ok && d.status === 'ok') ok('GET /health', JSON.stringify(d))
      else bad('GET /health', '状态码 ' + res.status)
    } catch (e) {
      bad('GET /health', e.message)
      console.log('\n\x1b[31m后端没起来，后面的测试无法继续。\x1b[0m')
      console.log('启动命令: cd backend && go run cmd/server/main.go\n')
      process.exit(1)
    }
  }

  // ---------- 1. 登录 ----------
  section('[1] 登录')
  let token
  let user
  {
    // 用独立账号，且每次都换一个新的隔离键。
    //
    // 必须这么做的原因：后端有每日砖块上限（默认 20），
    // 如果共用账号，脚本第二次运行时额度已被上次用光，
    // 「答对必得 1 块」这类断言就会失败——那是测试的隐含状态假设，
    // 不是后端的问题，却会掩盖真正的 bug。
    //
    // code 以 "dev:" 开头时后端会据此生成互不干扰的账号；
    // 未配置 AppSecret 的开发模式下这是唯一能拿到干净账号的方式。
    const stamp = Date.now()
    const res = await req('POST', '/auth/login', {
      body: { code: 'dev:smoke-' + stamp, nickname: '冒烟测试员', grade: 1 }
    })

    if (res.status === 200 && res.data && res.data.token) {
      token = res.data.token
      user = res.data.user
      ok('POST /auth/login', 'userId=' + user.id + ' grade=' + user.grade)
      ok('返回了 JWT', token.slice(0, 20) + '…')
      if (typeof user.coins === 'number' && typeof user.bricks === 'number') {
        ok('初始资源字段完整', 'coins=' + user.coins + ' bricks=' + user.bricks)
      } else {
        bad('资源字段缺失', JSON.stringify(user))
      }
      if (user.coins === 0 && user.bricks === 0) {
        ok('新账号资源归零', '可用于验证奖励计算')
      } else {
        bad('新账号初始资源不为零', 'coins=' + user.coins + ' bricks=' + user.bricks)
      }
    } else {
      bad('POST /auth/login', '状态码 ' + res.status + ' ' + res.raw.slice(0, 200))
      console.log('\n\x1b[31m登录失败，无法继续。\x1b[0m')
      if (res.status === 401) {
        console.log('\n提示：code 使用了 "dev:" 前缀，该约定只在开发模式下生效。')
        console.log('若已配置 WECHAT_SECRET，请改用真实的 wx.login() 流程测试。\n')
      }
      process.exit(1)
    }
  }

  // ---------- 2. 鉴权 ----------
  section('[2] 鉴权保护')
  {
    const noAuth = await req('GET', '/user/profile')
    if (noAuth.status === 401) ok('无 token 访问被拒绝', '401')
    else bad('无 token 应返回 401', '实际 ' + noAuth.status)

    const badToken = await req('GET', '/user/profile', { token: 'not-a-real-token' })
    if (badToken.status === 401) ok('伪造 token 被拒绝', '401')
    else bad('伪造 token 应返回 401', '实际 ' + badToken.status)

    const good = await req('GET', '/user/profile', { token })
    if (good.status === 200 && good.data && good.data.id === user.id) {
      ok('有效 token 可访问 /user/profile')
    } else {
      bad('有效 token 访问失败', JSON.stringify(good.data))
    }
  }

  // ---------- 3. 今日单词 ----------
  section('[3] 今日单词')
  let words = []
  {
    const res = await req('GET', '/learn/daily-words', { token })
    if (res.status === 200 && Array.isArray(res.data.words)) {
      words = res.data.words
      ok('GET /learn/daily-words', '返回 ' + words.length + ' 个单词')

      if (words.length > 0) {
        const w = words[0]
        const missing = ['id', 'word', 'translation', 'is_review'].filter((k) => w[k] === undefined)
        if (missing.length === 0) {
          ok('单词字段完整', JSON.stringify(w.word) + ' / ' + JSON.stringify(w.translation))
        } else {
          bad('单词字段缺失', missing.join(', '))
        }

        const reviews = words.filter((x) => x.is_review).length
        const fresh = words.filter((x) => !x.is_review).length
        ok('新词/复习词分布', '新词 ' + fresh + ' 个，复习 ' + reviews + ' 个')
      } else {
        bad('没有返回任何单词', '是否执行过 go run cmd/import/main.go 导入数据？')
      }
    } else {
      bad('GET /learn/daily-words', '状态码 ' + res.status + ' ' + res.raw.slice(0, 200))
    }
  }

  // ---------- 4. 答题发奖 ----------
  section('[4] 答题与奖励')
  {
    if (words.length === 0) {
      bad('跳过：没有单词可答')
    } else {
      const before = await req('GET', '/user/profile', { token })
      const coinsBefore = before.data.coins
      const bricksBefore = before.data.bricks

      const res = await req('POST', '/learn/submit-answer', {
        token,
        body: { word_id: words[0].id, is_correct: true }
      })

      if (res.status === 200) {
        ok('POST /learn/submit-answer', '答对')

        // 新账号首次答对，额度未用，应得满额奖励
        if (res.data.bricks_earned === 1 && res.data.coins_earned === 5) {
          ok('答对奖励正确', '金币 +5 砖块 +1')
        } else if (res.data.capped) {
          bad('新账号首次答题就触发上限',
            'bricks_today=' + res.data.bricks_today + '（新账号不应已达上限）')
        } else {
          bad('奖励数量不符', JSON.stringify(res.data))
        }

        const after = await req('GET', '/user/profile', { token })
        const dCoins = after.data.coins - coinsBefore
        const dBricks = after.data.bricks - bricksBefore
        if (dCoins === 5 && dBricks === 1) {
          ok('奖励已落库', 'coins +' + dCoins + ' bricks +' + dBricks)
        } else {
          bad('奖励未正确落库', 'coins +' + dCoins + ' bricks +' + dBricks)
        }
      } else {
        bad('提交答案失败', '状态码 ' + res.status + ' ' + res.raw.slice(0, 200))
      }

      // 答错不应发奖
      if (words.length > 1) {
        const before2 = await req('GET', '/user/profile', { token })
        const wrong = await req('POST', '/learn/submit-answer', {
          token,
          body: { word_id: words[1].id, is_correct: false }
        })
        const after2 = await req('GET', '/user/profile', { token })

        if (wrong.status === 200 && wrong.data.coins_earned === 0) {
          ok('答错不发奖', 'coins_earned=0')
        } else {
          bad('答错不应发奖', JSON.stringify(wrong.data))
        }
        if (after2.data.coins === before2.data.coins) {
          ok('答错后资源不变')
        } else {
          bad('答错后资源被改动', before2.data.coins + ' → ' + after2.data.coins)
        }
      }
    }
  }

  // ---------- 5. 建筑与建造 ----------
  section('[5] 建筑与建造')
  {
    const res = await req('GET', '/buildings', { token })
    if (res.status === 200 && Array.isArray(res.data.buildings)) {
      const list = res.data.buildings
      ok('GET /buildings', '返回 ' + list.length + ' 种建筑')

      const b = list[0]
      const missing = ['id', 'name', 'cost_bricks', 'is_built', 'can_build'].filter((k) => b[k] === undefined)
      if (missing.length === 0) ok('建筑字段完整', b.name + ' 造价 ' + b.cost_bricks + ' 砖')
      else bad('建筑字段缺失', missing.join(', '))

      // 找一栋最便宜的建筑来测
      const affordable = list.filter((x) => !x.is_built).sort((a, b2) => a.cost_bricks - b2.cost_bricks)[0]
      if (!affordable) {
        bad('没有可建造的建筑（可能都已建完）')
      } else {
        // 先确认砖块够不够。
        // [4] 只答了 2 个词（1 对 1 错），也就是 1 块砖，
        // 够不上最便宜的建筑（商店 5 块），所以这里需要先补一些。
        let profile = await req('GET', '/user/profile', { token })
        if (profile.data.bricks < affordable.cost_bricks) {
          const needed = affordable.cost_bricks - profile.data.bricks
          const got = await earnBricks(token, affordable.cost_bricks)
          if (got >= affordable.cost_bricks) {
            ok('通过答题攒够砖块', '补了 ' + needed + ' 块 → 现有 ' + got + ' 块')
          } else {
            bad('砖块仍不足', '需要 ' + affordable.cost_bricks + '，只有 ' + got)
          }
        }

        profile = await req('GET', '/user/profile', { token })
        if (profile.data.bricks < affordable.cost_bricks) {
          bad('无法测试建造：砖块不足', '需要 ' + affordable.cost_bricks + '，当前 ' + profile.data.bricks)
        } else {
          const build = await req('POST', '/buildings/build', {
            token, body: { building_id: affordable.id }
          })
          if (build.status === 200) {
            ok('POST /buildings/build', '建造 ' + affordable.name)
            if (typeof build.data.remaining_bricks === 'number') {
              ok('返回剩余砖块', build.data.remaining_bricks + ' 块')
            }
          } else {
            bad('建造失败', '状态码 ' + build.status + ' ' + build.raw.slice(0, 200))
          }

          // 重复建造应被拒绝
          const again = await req('POST', '/buildings/build', {
            token, body: { building_id: affordable.id }
          })
          if (again.status === 400) ok('重复建造被拒绝', '400')
          else bad('重复建造应返回 400', '实际 ' + again.status)
        }
      }
    } else {
      bad('GET /buildings', '状态码 ' + res.status + ' ' + res.raw.slice(0, 200))
    }
  }

  // ---------- 6. 我的小镇 ----------
  section('[6] 我的小镇')
  {
    const res = await req('GET', '/buildings/my-town', { token })
    if (res.status === 200) {
      const town = res.data.town_data
      const buildings = res.data.buildings

      if (town && typeof town.coins === 'number' && typeof town.bricks === 'number') {
        ok('town_data 字段完整', 'coins=' + town.coins + ' bricks=' + town.bricks + ' Lv.' + town.level)
      } else {
        bad('town_data 缺字段', JSON.stringify(town))
      }

      if (Array.isArray(buildings)) {
        ok('建筑列表', buildings.length + ' 栋')
        if (buildings.length > 0) {
          const b = buildings[0]
          const missing = ['name', 'position_x', 'position_y'].filter((k) => b[k] === undefined)
          if (missing.length === 0) {
            ok('坐标字段完整', b.name + ' @ (' + b.position_x + ', ' + b.position_y + ')')
          } else {
            bad('坐标字段缺失', missing.join(', '))
          }
        }
      } else {
        bad('buildings 不是数组')
      }
    } else {
      bad('GET /buildings/my-town', '状态码 ' + res.status)
    }
  }

  // ---------- 7. 学习统计 ----------
  section('[7] 学习统计')
  {
    const res = await req('GET', '/learn/stats', { token })
    if (res.status === 200 && res.data.stats) {
      const s = res.data.stats
      ok('GET /learn/stats', JSON.stringify({
        total: s.total_words, mastered: s.mastered_words,
        today: s.today_learned, due: s.due_today
      }))

      if (Array.isArray(res.data.upcoming) && res.data.upcoming.length === 7) {
        ok('未来 7 天复习计划', res.data.upcoming.map((u) => u.count).join(', '))
      } else {
        bad('upcoming 应有 7 天', JSON.stringify(res.data.upcoming))
      }

      // 答对过的词，下次复习时间应该被推后（不是立刻到期）
      if (s.total_words > 0) {
        ok('已建立复习计划', '共 ' + s.total_words + ' 个词')
      }
    } else {
      bad('GET /learn/stats', '状态码 ' + res.status)
    }
  }

  // ---------- 8. 家长端 ----------
  section('[8] 家长端')
  {
    const res = await req('GET', '/parent/stats', { token })
    if (res.status === 200 && res.data.stats) {
      const s = res.data.stats
      ok('GET /parent/stats', JSON.stringify(s))

      if (Array.isArray(res.data.recent_days) && res.data.recent_days.length === 7) {
        ok('最近 7 天数据', res.data.recent_days.map((d) => d.date + ':' + d.count).join(' '))
      } else {
        bad('recent_days 应有 7 天', JSON.stringify(res.data.recent_days))
      }

      if (s.today_words > 0) ok('今日学习数已统计', s.today_words + ' 次')
      else bad('今日学习数应为正（前面已答过题）', String(s.today_words))
    } else {
      bad('GET /parent/stats', '状态码 ' + res.status)
    }

    // 添加自定义单词
    const add = await req('POST', '/parent/add-word', {
      token,
      body: { word: 'smoketest' + Date.now().toString().slice(-6), translation: '冒烟测试词' }
    })
    if (add.status === 200 && add.data.word) {
      ok('POST /parent/add-word', add.data.word.word)
    } else {
      bad('添加单词失败', '状态码 ' + add.status + ' ' + add.raw.slice(0, 200))
    }

    // 参数校验
    const invalid = await req('POST', '/parent/add-word', { token, body: { word: '', translation: '' } })
    if (invalid.status === 400) ok('空参数被拒绝', '400')
    else bad('空参数应返回 400', '实际 ' + invalid.status)
  }

  // ---------- 9. 每日奖励限额 ----------
  section('[9] 每日奖励限额与完成奖励')
  {
    // 用独立账号测试，避免前面已经消耗掉限额。
    //
    // code 以 "dev:" 开头时，后端会取冒号后的内容作为隔离键，
    // 从而生成互不干扰的开发账号。不使用该前缀的话，开发模式下
    // 所有登录都会命中同一个账号（这是为了让小程序反复登录不丢小镇），
    // 那时这些"新账号"会带着前面测试的状态，"全新账号"的假设就不成立了。
    const stamp = Date.now()
    const fresh = await req('POST', '/auth/login', {
      body: { code: 'dev:smoke-cap-' + stamp, nickname: '限额测试', grade: 1 }
    })
    if (fresh.status !== 200) {
      bad('无法创建限额测试账号', '状态码 ' + fresh.status)
    } else {
      const t = fresh.data.token

      // 连答同一题，验证刷砖被限制
      const daily = await req('GET', '/learn/daily-words', { token: t })
      const someWord = (daily.data?.words ?? [])[0]

      if (!someWord) {
        bad('没有单词可答，无法验证限额')
      } else {
        let capped = false
        let capAt = 0
        for (let i = 0; i < 40; i++) {
          const r = await req('POST', '/learn/submit-answer', {
            token: t, body: { word_id: someWord.id, is_correct: true }
          })
          if (r.data?.capped) { capped = true; capAt = i + 1; break }
        }

        const prof = await req('GET', '/user/profile', { token: t })
        if (capped) {
          ok('连答同一题触发每日上限', '第 ' + capAt + ' 次被削，今日砖块 ' + prof.data.bricks)
        } else {
          bad('连答 40 次仍未触发上限', '砖块已到 ' + prof.data.bricks + '，限额可能失效')
        }
        if (prof.data.bricks <= 20) {
          ok('刷砖无法突破上限', '最终 ' + prof.data.bricks + ' 块')
        } else {
          bad('刷砖突破了上限', prof.data.bricks + ' 块')
        }
      }

      // 完成奖励：用一个新账号学满当日目标
      const fresh2 = await req('POST', '/auth/login', {
        body: { code: 'dev:smoke-bonus-' + stamp, nickname: '奖励测试', grade: 1 }
      })
      if (fresh2.status === 200) {
        const t2 = fresh2.data.token
        const d2 = await req('GET', '/learn/daily-words', { token: t2 })
        const goal = d2.data?.daily_goal || 5
        const list = d2.data?.words ?? []

        let bonusSeen = false
        let bonusBricks = 0
        for (const w of list) {
          const r = await req('POST', '/learn/submit-answer', {
            token: t2, body: { word_id: w.id, is_correct: true }
          })
          if (r.data?.bonus_granted) { bonusSeen = true; bonusBricks = r.data.bonus_bricks }
        }

        if (bonusSeen) {
          ok('完成当日学习量后有完成奖励', '砖块 +' + bonusBricks)
        } else {
          bad('答完当日单词未收到完成奖励', '目标 ' + goal + '，实际答了 ' + list.length + ' 个')
        }

        const after = await req('GET', '/user/profile', { token: t2 })
        const cheapest = (await req('GET', '/buildings', { token: t2 })).data.buildings
          .filter((b) => !b.is_built).sort((a, b2) => a.cost_bricks - b2.cost_bricks)[0]

        if (after.data.bricks >= cheapest.cost_bricks) {
          ok('第一天就能开建（核心闭环成立）',
            after.data.bricks + ' 块 ≥ 最便宜 ' + cheapest.name + ' ' + cheapest.cost_bricks + ' 块')
        } else {
          bad('第一天攒不出最便宜的建筑',
            after.data.bricks + ' 块 < ' + cheapest.cost_bricks + ' 块')
        }
      }
    }
  }

  // ---------- 汇总 ----------
  console.log('\n' + '='.repeat(50))
  if (fail === 0) {
    console.log('\x1b[32m\x1b[1m全部通过 (' + pass + ' 项)\x1b[0m')
    console.log('后端整条链路正常，可以打开微信开发者工具了。')
  } else {
    console.log('\x1b[31m\x1b[1m通过 ' + pass + '  失败 ' + fail + '\x1b[0m')
    console.log('\n失败项：')
    failures.forEach((f) => console.log('  · ' + f))
  }
  console.log('='.repeat(50) + '\n')

  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\n\x1b[31m测试中断: ' + e.message + '\x1b[0m\n')
  process.exit(1)
})
