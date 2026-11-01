# 小镇长养成与小屋

## 本版功能

圆润卡通角色与方块建筑搭配。首页显示小镇长、等级、每日学习任务，并在地图中加入“我的家”；角色页也能从“我的”进入。底部原生导航新增“我的家”，小屋页面也保留导航，可直接切换小镇、学习、建造和个人页；离开时收起改名和物品预览，返回后刷新角色与余额。角色名字与微信账号昵称独立，支持 1～12 个字符，点击角色可挥手。

衣橱有免费日常装，以及建造师 60、园丁 90、探险家 120 金币。庭院有免费清空，以及花箱 40、小旗 30、树林 70 金币；当前可同时使用一套衣服和一种庭院装饰。点物品先预览，确认按钮明确标价，购买后自动使用、永久拥有，重复购买不会再次扣款。

每位用户免费获得一级小屋；二级需要 15 砖块，三级需要 30 砖块，外观依次增加门廊、二层与阳台。小屋独立于公共建筑，不占用旧建筑数据库坐标；地图显示时为它预留一个地块。

预览面板的内容可滚动，确认按钮固定在面板底部。余额不足直接提供学习入口；写入期间禁止重复点击，网络错误后重新读取服务端状态，不自动重发消费请求。

## 商场与屋内生活（2026-10-31）

“我的家”现在有衣橱、庭院装饰、小屋升级、屋内生活四个入口。点第四项或住宅上的“进屋走走”进入立体房间；原来的三级住宅、角色换装与庭院装饰继续保留。房间和商场页面位于 `miniapp/home` 分包，进屋时加载，避免把室内素材塞进主包。

原商店在地图、图纸和大厅显示为“商场”，数据库仍保留 `商店` 这个已有名称，保持旧建筑、补给、活动和布局数据兼容。建好商场后，从大厅“家具生活馆”或屋内“去商场买家具”购物。家具按客厅、卧室、书房、餐厨分类：原木单椅免费赠送，沙发 45、电视 75、落地灯 18、绿植 12、床 60、衣柜 50、地毯 16、书桌 35、书架 30、餐桌 32、冰箱 55 金币。每款家具可拥有一件，买一次永久拥有，不改变角色服装或庭院装饰。

点房间地板，小人沿可通行路线走过去；方向键控制前后左右一步移动。家具会阻挡通行，地毯可以踩过。点家具后，小人先走近再坐下、休息、浇水、看书、画画、喝茶、整理衣柜或打开冰箱；落地灯可开关，电视有森林、海边、雪山三张本地自然插画。互动为免费动画，不增加或扣除资源，也不改变学习奖励。

“布置我的家”中先选家具，再点亮起的地板，可以移动、旋转或收回家具箱。点“保存布置”写入服务端；取消恢复上次保存。房间是 7×7 网格，保存验证所有权、边界、重叠、唯一家具和门口畅通；每次保存携带版本，旧设备不能覆盖新布置。去商场再返回会保留当前页面草稿；关闭页面前需保存。网络错误后只读取状态确认结果，不自动重复购买或重发保存。

住宅沿用原始图集。新商场、房间和家具使用内置 image_gen，参考原小镇的橡木、奶油墙面和积木立体风格。完整提示词及源图在 `output/imagegen/home-mall-prompts.md`；`scripts/pack-home-art.cjs` 生成分包素材，并仅替换原建筑图集中的商店单元。打包会验证其他所有单元的解码 RGBA 像素完全不变。电视插画由 `scripts/generate-home-nature.cjs` 生成，不依赖外部图片链接。

验证：`node --test scripts/home-room-test.cjs scripts/resident-test.cjs` 覆盖真实页面入口、购买后回家摆放、草稿、碰撞、寻路、全部家具互动和错误恢复；`TestResidentMySQLLifecycle` 增加真实 MySQL 的家具购买、并发幂等、布局版本、永久所有权与账号隔离检查。

## 成长规则

- 每天首次练习一个不同单词获得 5 成长，新词和复习词均可，答错也鼓励完成练习。只给每日目标范围内的单词发成长，默认每天前 10 个词。
- 完成每日目标额外获得 10 成长，每天一次，默认每日最多 60 成长。当天重复练习不重复计数。
- 总成长达到 0 / 30 / 80 / 150 / 250，获得见习镇长 / 活力镇长 / 小镇建造师 / 小镇规划师 / 小镇守护者称号，共五级。
- 同一个单词当天答对奖励只发一次。当天先错后对可以获得一次答对奖励；前端本轮巩固环节维持原有规则，不再次提交发奖。
- 自由复习整轮奖励独立结算：每轮 4 砖块、12 金币，每日最多 12 轮；不增加成长或改变间隔复习计划。详见 [学习模式](learning-modes.md)。
- 原有金币、砖块单题奖励、每日答题砖块上限和每日完成奖励保留。学习统计按最近练习日期计入复习词。
- 历史学习不回填成长；已领取当天旧版完成奖励的用户仍显示今日已完成。

角色等级与旧 User.level 字段分开，当前不引入建筑等级门槛，也没有体力消耗、饥饿或不学习惩罚。

## 接口与数据库

接口在现有登录鉴权下，路径带 /api/v1 前缀：

| 方法 | 路径 | 请求 |
| --- | --- | --- |
| GET | /resident | 无 |
| PUT | /resident | name |
| POST | /resident/purchase | item_id |
| POST | /resident/equip | item_id |
| POST | /resident/home/upgrade | expected_level |
| PUT | /resident/room | expected_version, layout |

成功统一返回 resident、wallet、daily、home、shop、furniture、room、mall_available。物品、价格、所有权、升级花费与余额以服务端为准。升级携带预览时的级别，旧请求不能触发下一级消费。

新增 residents、resident_items、resident_studies 三张表，通过现有 AutoMigrate 创建。发布时需要同时更新后端和小程序；后端开启 AUTO_MIGRATE 时重启会创建表，关闭时应先执行项目迁移流程。无需导入新种子数据。GET 首次访问为当前账号创建初始角色。家具版本新增 residents.room_layout（TEXT）和 room_version（INT）列，使用相同 AutoMigrate 流程。

学习、换装购买、升级和建造在事务中先锁定同一用户行，数据库提交成功后才返回结果。学习记录、复习计划、每日成长、奖励在同一事务内保存。更新账号资料和资源时只写对应字段，防止旧快照覆盖余额。resident_items 使用 user_id + item_id 主键；resident_studies 使用 user_id + day + word_id 主键。

本版延续原接口的 is_correct 客户端判定；重复请求保护不等于防作弊。后续若增加竞争或兑换价值，应由服务端验证答案。

## 素材

由内置 imagegen 生成，透明背景、独立原创造型。原图保存在 output/imagegen，项目素材经 Sharp 等比例缩至 1024×1024 并压缩为保留 alpha 的调色板 PNG；没有改绘素材或使用外部 CDN。

| 文件 | 图集排列 | 大小 |
| --- | --- | --- |
| miniapp/images/resident/resident-atlas.png | 4×4：行是日常 / 建造师 / 园丁 / 探险家；列是站立 / 挥手 / 行走 / 庆祝 | 222,693 字节 |
| miniapp/images/resident/home-atlas.png | 2×2：一级小屋 / 二级小屋 / 三级小屋 / 花箱，均已去掉草皮泥土底座 | 217,094 字节 |
| miniapp/images/resident/walk-directions.png | 4×4：日常 / 建造师 / 园丁 / 探险家；列为向下 / 向上 / 向左 / 向右 | 174,714 字节 |
| miniapp/images/resident/pet-directions.png | 4×2：小狗 / 小猫；列为向下 / 向上 / 向左 / 向右 | 112,734 字节 |

原图：output/imagegen/resident-source.png、output/imagegen/home-source.png。小旗、树林复用已有原创 town/voxel-atlas.png。当前交互使用站立与挥手，行走和庆祝帧预留。图集映射在 miniapp/utils/resident.js，共享模板在 miniapp/templates/resident.wxml。小程序目录当前约 1.77 MiB（实际发布包由开发者工具计算）。

住宅与花箱去底座的编辑源图为 `output/imagegen/home-grounded-source.png`，使用内置 imagegen 移除草皮和泥土台座，再分切、等比例缩放并排列为等分图集。对应提示词见 `output/imagegen/grounded-atlases-prompt.md`；地图上的“我的家”名称前增加 🏡 图标。小旗和树林也已同步去掉地块底座。

地图散步改用四方向专用图集，普通角色预览、挥手等交互继续使用原角色图集。人物新素材保留已有四套服装；猫狗采用对应方向的全身造型。原始输出为 `output/imagegen/resident-directions-source.png`、`output/imagegen/pet-directions-source.png`，内置 imagegen 的完整提示词与打包参数见 `output/imagegen/walk-directions-prompt.md`。同一角色四个方向按相同比例缩放、对齐脚底，转身时保持体型和站位；宠物图集使用独立纵向比例 `scaleY`，共享模板对旧方形图集仍回退到 `scale`。

## 验证

- node scripts/learning-test.cjs：22 项，含成长显示与巩固不重复计入，保留读音和自动跳转回归。
- node scripts/building-test.cjs：8 项。
- node scripts/resident-test.cjs：9 项，覆盖预览、重复点击、网络结果不明、余额不足、命名、页面生命周期和地图。
- node scripts/api-transport-test.cjs：9 项。
- backend 下 go test -p 1 ./... 通过；设置 MYSQL_TEST_DB=littletown_test_resident，配合 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD，在独立 MySQL 8.4 容器执行了数据库集成测试。
- 新增 TestResidentMySQLLifecycle：真实数据库持久化、中文名字、多设备同物品并发购买只扣一次、重复升级、奖励与成长幂等、错后纠正、每日上限、隔日复习、同时学习/购买/建造、用户隔离、余额不足。
- 使用微信开发者工具内置 wcc/wcsc 编译角色、首页、学习、我的和共享模板；浏览器渲染编译结果，检查 375px 页面与 320×568 小屏升级面板。
- output/resident-preview.png 是带演示数据的浏览器预览截图；尚未做微信真机验收，也没有部署到生产或操作真实用户资源。

## 角色原始提示词

```text
Use case: stylized-concept. Asset type: one production character sprite atlas for a children's vocabulary town game. Create a square transparent PNG, exactly 4 columns and 4 rows, 16 equal square cells. Each sprite fully contained in central 72% width and 78% height of its own cell, all four equal gutters. Centers exactly at 12.5%,37.5%,62.5%,87.5% horizontally and vertically; do not trim canvas. No text, no labels, no cell borders, no ground tiles.
Character: the SAME friendly original gender-neutral young town mayor in every cell, big round head, small rounded body, short chestnut wavy hair, warm tan skin, warm dark eyes, expressive gentle face, rounded mitten hands and tiny shoes. NOT blocky, not pixelated. Charming 3D illustrated toy character, matte surfaces, soft warm upper-left light, orthographic three-quarter front view, consistent size and identity, children-friendly proportions. Must harmonize with a moss-green, cream and terracotta voxel village. No brand references.
Four rows are outfits:
row 1 mint-green jacket, cream shorts, small coral backpack, cream sneakers;
row 2 yellow construction helmet, blue overalls, cream shirt, brown boots;
row 3 straw gardening hat, butter-yellow shirt, sage-green overalls, tan shoes;
row 4 teal explorer cap, rust-orange neckerchief, cream utility jacket, blue trousers.
Four columns in EVERY row are these poses in the same order:
column 1 standing at rest, hands at sides, friendly smile;
column 2 waving one hand, smiling brightly;
column 3 taking a small walking step, one foot forward, arms swinging gently;
column 4 celebrating with both hands up and eyes happy.
Exactly one whole-body character in each cell. No accessories floating outside body, no shadows wider than the body, no checkerboard. Genuine transparent alpha. Keep every toe and hat inside its own cell, ample clear space to avoid neighboring sprite leakage. This is ONE atlas for direct 4x4 CSS clipping.
```

## 小屋原始提示词

```text
Use case: stylized-concept. Asset type: a single square 2x2 sprite atlas for a warm children's town-building game, genuine transparent PNG. Exactly 4 equal square cells in 2 columns and 2 rows, no text, no labels, no grid. Every object entirely inside central 76% of its cell, centered at x25%/75%, y25%/75%; leave ample equal transparent gutters and do not crop canvas.
Original isometric voxel architecture, chunky cream plaster blocks, honey wood, terracotta stepped roof, blue windows, moss green grass, warm upper-left lighting, orthographic camera. Polished cheerful collectible game models, all same orientation, same diamond grass-and-soil tile footprint, no proprietary Minecraft textures.
Upper-left: level 1 home, tiny cozy one-story cottage, orange roof, single round doorway, two little windows, short doorstep, one flower pot.
Upper-right: level 2 of exactly the same cottage, bigger roof dormer, small covered porch, wooden mailbox, two flower planters. Clearly more developed yet same recognizable original home.
Lower-left: level 3 of the same cottage, two story with a small balcony, large orange roof with dormer, side porch and climbing flowers, green trimmed hedge. Clearly visibly larger and more delightful, same grass tile footprint.
Lower-right: a separate small garden decoration, low wooden planter with joyful pink, yellow and white flowers, a round watering can nearby, tiny square grass patch, no cottage.
No characters. Consistent coherent art direction with a friendly rounded 3D cartoon mayor who will stand beside these homes. Completely isolated sprites, square canvas 2x2 direct CSS clipping.
```
