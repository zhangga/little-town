# 小程序开发与联调指南

多题型学习、常速／慢速发音和对应验收说明见 [学习模式与读音](learning-modes.md)。

本地、微信云托管和自建服务器的切换及部署步骤见 [部署说明](deployment.md)。开发版默认本地；体验版/正式版默认通过 callContainer 访问既有云托管环境。

## 一、启动顺序

后端和前端是两个独立进程，联调时先起后端。

### 1. 启动后端

```bash
cd C:\work\github\little-town\backend

# 首次：复制并填写配置
copy .env.example .env
# 核对 .env 的数据库连接信息，设置 JWT_SECRET；本地数据库密码需与 Compose 一致

# 启动本地 MySQL，自动创建数据库（Windows）
..\scripts\db-start.bat
# Linux/macOS 使用 ../scripts/db-start.sh

# 下载依赖
go mod download

# 启动服务（首次会自动建表）
go run cmd/server/main.go

# 另开一个终端：导入 25 个单词 + 10 种建筑
go run cmd/import/main.go
```

验证后端：

```bash
curl http://localhost:8080/health
# {"status":"ok","app":"little-town"}
```

### 2. 打开小程序

1. 微信开发者工具 → 导入项目
2. 目录选 `C:\work\github\little-town\miniapp`
3. AppID 会自动读取 `project.config.json` 中的值
   需要更换时用脚本统一改，不要手改单个文件：
   ```bash
   ./scripts/set-appid.sh wx你的新AppID
   ```
4. 编译

**关键设置**：详情 → 本地设置 → 勾选「不校验合法域名」。

本地开发使用 `http://localhost:8080`，需要关闭开发工具的域名校验。体验版/正式版默认走微信云托管；选择自建服务器目标时，填写 HTTPS 地址并在微信后台配置合法域名。

**注意工作区缓存的旧 AppID**：如果之前用另一个 AppID 打开过这个目录，开发者工具会记住旧值，表现为改了配置文件却仍按旧账号运行。此时需要在工具的「项目列表」里把该项目**移除**，再重新导入。

---

## 二、登录的两种模式

### 模式一：已配置 AppSecret（正常模式）

在 `backend/.env` 里填入 `WECHAT_SECRET`，后端就会调用微信 `code2session` 换取真实 openid。启动日志会显示：

```
微信登录：已配置（AppID wx85****adda）
```

### 模式二：未配置 AppSecret（开发模式）

留空也能跑，此时 openid 由固定种子散列生成：

```go
func devOpenID(code string) string {
    const devSeed = "little-town-dev-user"
    sum := sha256.Sum256([]byte(devSeed))
    return "dev_" + hex.EncodeToString(sum[:8])
}
```

**为什么不能直接用 code 拼 openid**：`wx.login()` 每次返回的 code 都不同，如果写成 `"mock_openid_" + code`，每次登录都会命中不同的 openid，于是每次都建新账号，之前盖的小镇全部消失。用固定种子散列可以保证同一台设备反复登录命中同一账号。

启动日志会明确提示当前处于哪种模式：

```
微信登录：未配置 ⚠️  当前为开发模式，openid 由固定种子派生
```

### 需要多个独立账号时：`dev:` 前缀

固定种子有个副作用——**所有登录都落在同一个账号上**，没法并行测多用户。比如想验证"新用户第一天能攒多少砖"，拿到的却是已经用过几天的账号。

约定：code 以 `dev:` 开头时，取冒号后的内容作为隔离键：

```js
// 两个互不干扰的账号
await api.post('/auth/login', { code: 'dev:user-a', nickname: '小明', grade: 1 })
await api.post('/auth/login', { code: 'dev:user-b', nickname: '小红', grade: 2 })

// 每次跑出一个全新账号（测试脚本用这种）
await api.post('/auth/login', { code: 'dev:test-' + Date.now(), ... })
```

同一个 key 反复登录仍是同一个账号，所以不会丢数据。该约定只在开发模式生效；配置了 AppSecret 后会走真实 `code2session`，`dev:` 前缀不再有特殊含义。

### AppSecret 的安全要求

AppSecret 等同于小程序的登录密钥，泄漏后他人可冒充你的小程序调用微信接口。因此：

- 只存在于 `backend/.env`（已被 `.gitignore` 忽略），不写进任何受版本控制的文件
- 代码里构建的 `code2session` 请求 URL 包含 `appsecret`，**不得打印到日志**
- 若怀疑泄漏，立即在微信公众平台重置

`session_key` 同样敏感，它只写入进程内缓存供后续解密使用，绝不出现在 API 响应中。

---

## 三、其余容易踩的坑

### 坑 1：答题奖励是前端算的

小程序在本地判断对错并上报 `is_correct`（`pages/learn/learn.js` 的 `submit`）。这种设计方便先跑通流程，但客户端可以伪造答案刷砖块。

正式版应改成：后端下发题目和正确答案，前端只上报选项 ID，对错由 `handlers/learn.go` 判定后再决定发不发奖励。

### 坑 2：订阅消息还没接

艾宾浩斯的价值在于「到点提醒复习」，但现在没有推送通道，只能靠用户自己打开。上线前需要：

1. 微信公众平台申请订阅消息模板
2. 前端在完成每日学习后调用 `wx.requestSubscribeMessage`
3. 后端加一个定时任务，扫描 `review_schedules` 表中 `next_review_at` 到期的记录并推送

订阅消息是**一次性**的，用户点一次只能推一条，所以要把「订阅明天的提醒」做成完成学习后的固定动作。

---

## 四、当前接口与前端页面的对应关系

| 页面 | 调用的接口 | 说明 |
|------|-----------|------|
| `pages/login` | `POST /auth/login` | 昵称 + 头像 + 年级，签发 JWT |
| `pages/index` | `GET /buildings/my-town` | 小镇地图，建筑按 `position_x/y` 绝对定位 |
| `pages/learn` | `GET /learn/daily-words`<br>`POST /learn/submit-answer` | 3 个复习词 + 2 个新词，答对得 1 砖 5 金币 |
| `pages/build` | `GET /buildings`<br>`POST /buildings/build` | 建造清单与建造动作 |
| `pages/parent` | `GET /parent/stats`<br>`POST /parent/add-word` | 家长报告与补充单词 |
| `pages/profile` | `GET /user/profile`<br>`GET /learn/stats` | 个人信息与学习小结 |

---

## 五、关于图形素材

现在所有建筑和单词都用 emoji 充当图形（`utils/assets.js`），这样没有美术资源也能跑通全流程。

接真实素材时：

1. 把图片放到 `miniapp/images/` 下（目录已建好）
2. 后端 `words.image_url` / `buildings.image_url` 填写图片 URL
3. 页面已经做了兼容：`image_url` 非空时用图片，否则回落到 emoji

需要注意 emoji 在不同机型上渲染风格不一致（iOS 是苹果体，安卓是各家厂商字体），正式版还是建议换成统一素材。

---

## 六、日志

后端同时输出到**终端**和**文件**，行为跟以前一样，终端里看到的内容不会减少。

```
backend/logs/app-2026-10-15.log
```

### 查看方式

终端里直接看；要翻历史记录就看文件：

```bash
# Windows
type backend\logs\app-2026-10-15.log

# Linux / macOS
tail -f backend/logs/app-$(date +%F).log

# 只看错误相关的行
grep -iE "error|fatal|failed" backend/logs/*.log
```

### 配置

```ini
LOG_DIR=./logs       # 日志目录，相对 backend 执行目录
LOG_KEEP_DAYS=7      # 保留天数，启动时清理过期文件；0 表示不清理
```

### 几个设计取舍

**按天切分，但不是靠重启。** 写入时会比对日期，跨天自动切到新文件，所以一个跑好几天的进程也会自然分开。

**文件句柄常驻。** 访问日志写入频繁，每条都 open/close 是没必要的开销。代价是程序被强杀时，内核缓冲区里还没落盘的内容会丢——对开发日志来说可以接受，因此没有每条都 `fsync`。

**日志写失败不会让服务挂掉。** 磁盘满、目录没权限这类情况下会降级为只输出终端，启动时打一条警告继续跑。这里我倾向于"能启动起来去排查问题"比"直接退出"更有用。

**清理时只删自己生成的文件。** 文件名必须匹配 `app-YYYY-MM-DD.log` 才会参与清理，目录里其他文件（比如你手动放的备份）不会被误删。

### 保留期的边界

`LOG_KEEP_DAYS=7` 表示保留**今天在内**的 7 个日历日。比较时把时间截断到当天零点——不截断的话，"正好 7 天前"的文件会因为带上了当前时分秒而被误判过期，实际只保留 6 天多。

---

## 七、目录说明

```
miniapp/
├── app.js / app.json / app.wxss    # 全局：注册页面、tabBar、设计令牌
├── project.config.json             # 开发者工具项目配置
├── pages/
│   ├── login/      # 进镇：昵称、头像、年级
│   ├── index/      # 小镇地图（tabBar 1）
│   ├── learn/      # 答题（tabBar 2）
│   ├── build/      # 建造（tabBar 3）
│   ├── resident/   # 小镇长的家（tabBar 4：我的家）
│   ├── profile/    # 我的（tabBar 5）
│   └── parent/     # 家长报告（从「我的」进入）
├── utils/
│   ├── config.js   # 环境地址表（开发/体验/正式），改地址只改这里
│   ├── api.js      # 请求封装，自动带 token、401 自动回登录页、错误翻译成人话
│   ├── util.js     # 提示、确认弹窗、防抖
│   └── assets.js   # emoji 映射、年级选项
└── images/         # 美术素材（待补）
```
