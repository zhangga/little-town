# 本地开发、微信云托管与自建部署

三种方式共用 Go 后端、MySQL 模型和小程序页面。部署差异通过配置切换，不需要维护多套业务代码。

| 场景 | 小程序目标 | 请求方式 | 后端 |
|---|---|---|---|
| 本地开发 | local | wx.request → localhost:8080 | 本机 Go + 本地 Docker MySQL |
| 微信云托管 | cloudrun | wx.cloud.callContainer | 指定环境中的 golang-y91h 容器 |
| 自建服务器 | server | wx.request → HTTPS 域名 | Docker Compose + MySQL + Caddy |

## 小程序配置

编辑 `miniapp/utils/config.js`。默认映射：

```js
const ENV = {
  develop: 'local',
  trial: 'cloudrun',
  release: 'cloudrun'
}
```

微信云托管信息已经填好：

- 环境：`prod-d4g0vweip50ea1139`
- 服务：`golang-y91h`
- 接口前缀：`/api/v1`
- 公网诊断地址：`https://golang-y91h-329751-5-1317371943.sh.run.tcloudbase.com`

本地开发无需初始化云 SDK。体验版/正式版通过云 SDK 访问上述环境；公网地址用于浏览器健康检查，不需要把请求改为直连该地址。GET 参数编码进 path，POST/PUT/DELETE 保留原请求体，业务登录仍使用原来的 JWT。

自建服务器上线后，把 `TARGETS.server.baseURL` 填为 `https://你的域名/api/v1`，再将需要使用自建后端的版本映射为 `server`。也可以暂时将 `ENV.develop` 改为 `cloudrun`，在开发者工具中联调云端。配置缺失会报错，不会回退到本机；更换目标会清理前一目标的登录凭证及用户缓存，需要重新登录。

## 本地开发

现有 `backend/.env` 与 MySQL 数据可以继续使用，不需要重建数据库或覆盖配置。

```powershell
cd C:\work\github\little-town
.\scripts\db-start.bat
cd .\backend
go run ./cmd/server
```

开发者工具打开 `miniapp`，在本地设置勾选“不校验合法域名”，编译。`/health` 检查进程存活，`/ready` 会确认数据库可连接：

```powershell
Invoke-RestMethod http://localhost:8080/ready
```

只有首次空库或更新词库、建筑数据时，才需要在 backend 目录运行 `go run ./cmd/import`。本地未配置微信凭证时允许开发模拟登录；生产环境禁止使用模拟登录。

## 微信云托管：复用当前环境

1. 在项目根目录打包源代码：

   ```powershell
   .\scripts\package-cloudrun.ps1
   ```

   输出 `output/cloudrun/little-town-cloudrun.zip`，包根目录包含 Dockerfile、Go 源码和初始数据。打包使用白名单，不包含真实 `.env`、日志、数据库备份和本地临时文件。

2. 在微信云托管控制台进入环境 `prod-d4g0vweip50ea1139`，打开已有服务 `golang-y91h`，通过上传代码包创建新版本。构建目录为代码包根目录，Dockerfile 为 `Dockerfile`，监听端口为 **80**。Git 仓库部署时，目标目录选择 `backend`。

3. 保留现有 MySQL 连接变量，按 `backend/.env.cloudrun.example` 配置新版本环境变量：

   | 配置 | 值/说明 |
   |---|---|
   | ENV | production |
   | DEPLOY_TARGET | cloudrun |
   | PORT / SERVER_PORT | 80；若存在旧的 SERVER_PORT，也要保持为 80 |
   | MYSQL_ADDRESS | 现有 MySQL 的主机:端口 |
   | MYSQL_USERNAME / MYSQL_PASSWORD | 现有数据库用户名和密码 |
   | DB_NAME | 当前官方模板默认 golang_demo；以实际已有库名为准 |
   | WECHAT_APPID | 当前小程序 AppID，默认 wxbd8f4a305320e623 |
   | WECHAT_SECRET | 对应小程序 AppSecret，只存控制台 |
   | JWT_SECRET | 至少 32 字符随机密钥，所有应用副本一致 |
   | INIT_DATA | 首次部署设 true，自动建表并导入单词、建筑 |
   | AUTO_MIGRATE | true；需要单独控制生产结构更新时可设 false |
   | LOG_TO_FILE | false，由平台采集标准输出 |
   | PUSH_ENABLED | false，缩容场景使用外部任务 |

   后端优先读取明确设置的 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME；未设置时兼容 MYSQL_ADDRESS/MYSQL_USERNAME/MYSQL_PASSWORD/MYSQL_DATABASE。沿用 golang_demo 会新增小小镇业务表，计数器模板的 Counters 表不会被修改。需要新建独立库时，先在已有 MySQL 实例中建库再设置 DB_NAME。

4. 确认该云托管环境关联了当前小程序。发布后访问公网地址的 `/ready`，应返回 `{"status":"ready"}`；通过小程序体验版验证真实微信登录、答题、建造和统计。

5. 初始化成功后可将 INIT_DATA 改为 false，避免每次冷启动都检查词库。这个开关只控制容器启动时的数据导入；显式执行 `/app/import` 仍可更新初始数据。

`deploy/cloudrun-settings.json` 记录当前目标环境，仅作为部署参考，不会自动修改控制台设置。源代码打包也不会发布服务、上传小程序或更改线上流量。

## 自建服务器

部署文件位于 deploy，使用独立 Compose 项目和数据卷，不会占用或清空本地开发数据库。

1. 将代码放到有 Docker Compose 的服务器上，把 `deploy/.env.example` 复制为 `deploy/.env`。
2. 填写 APP_DOMAIN、数据库密码、root 密码、微信凭证和 JWT_SECRET；域名解析到该服务器，开放 80/443 端口。
3. 在项目根目录执行：

   ```bash
   docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
   docker compose --env-file deploy/.env -f deploy/compose.yml ps
   ```

MySQL 仅在容器网络中提供服务。应用内部监听 8080，宿主机诊断端口仅绑定 127.0.0.1。Caddy 对外提供 HTTPS 并反向代理到应用。首次启动 INIT_DATA=true 时会自动建表、导入初始词库与建筑；不要把本机调试数据库目录直接当作服务器数据目录。

```bash
# 就绪检查与日志
curl http://127.0.0.1:8080/ready
docker compose --env-file deploy/.env -f deploy/compose.yml logs -f app

# 更新代码后重新构建；MySQL 卷保留
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build

# 按需更新初始数据
docker compose --env-file deploy/.env -f deploy/compose.yml exec app /app/import

# 停止服务，保留数据
docker compose --env-file deploy/.env -f deploy/compose.yml stop
```

在微信后台配置 HTTPS 请求合法域名，再按前文将小程序版本切为 server。大陆自建服务按平台要求完成备案后再正式对外开放。

## 每日提醒与多副本

常驻自建实例可使用 PUSH_ENABLED=true 的进程内调度。云托管默认关闭它，因为实例可能缩容为零。两种调度方式共用数据库任务锁，避免同一 MySQL 库的多个实例同时执行每日任务；发送后仍按订阅额度和最近推送时间筛选。消息发送与数据库更新不属于同一个事务，网络中断时不能承诺外部消息严格只发送一次。

要启用云端每日提醒：设置 SUBSCRIBE_TEMPLATE_ID 和至少 32 字符的随机 JOB_TOKEN，再在外部定时服务中配置上海时间每日 19:00 后的 POST 请求：

```text
POST https://golang-y91h-329751-5-1317371943.sh.run.tcloudbase.com/internal/jobs/daily-push
Authorization: Bearer <JOB_TOKEN>
```

未配置 JOB_TOKEN 时任务路由不存在；普通用户的 JWT 不能调用它。未配置订阅模板时返回 configured=false，不会发送消息。仅部署代码不会创建外部定时触发器。若关闭了公网访问，需要通过可访问该服务的可信云端调用方触发任务。

自建环境也可以关闭进程内调度，由系统定时器运行 `docker compose --env-file deploy/.env -f deploy/compose.yml exec -T app /app/push`。不要对任务入口配置不加判断的并发重试；任务失败时先查看返回的统计及后端日志。

## 数据与运行边界

- 本地库、云托管库、自建服务器库默认互相独立。切换前端目标不会自动同步学习进度；迁移数据需单独备份和导入。
- 如果两种线上入口同时服务同一批用户，应连接同一数据库、使用同一 JWT_SECRET、同一小程序身份，并保证数据库网络可达。
- 容器不依赖本地磁盘保存登录态。日志默认标准输出；现有图片、音频仍随小程序打包。后续增加用户上传时，应另接持久对象存储。
- 数据库连接池默认每实例最多 10 个连接，需结合云托管最大副本数和 MySQL 连接额度调整 DB_MAX_OPEN/DB_MAX_IDLE。
- 生产启动会校验密钥与微信配置，错误时退出并给出变量名，不会把默认密钥或模拟账号用于线上登录。

## 验证

```powershell
node --test scripts/api-transport-test.cjs scripts/learning-test.cjs scripts/building-test.cjs
cd backend
go test ./...
go vet ./...
```

真实 MySQL 测试使用 MYSQL_TEST_DB 指定以 littletown_test_ 开头的独立库，包含字符集、时间、迁移重复执行和任务锁验证。容器构建命令：`docker build -t little-town-backend backend`。

参考：[官方 Go 模板及数据库变量](https://github.com/WeixinCloud/wxcloudrun-golang)、[微信云调用类型定义](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.cloud.d.ts)、[云托管服务设置](https://cloud.tencent.com/document/product/1243/77197/)。
