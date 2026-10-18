# 方块小镇：建造与素材

建造页使用双列图鉴、可建造/已落成筛选、最低成本建筑推荐。点图纸先看预览、材料进度和剩余砖块，点击明确标价的按钮才会提交建造；成功后展示落成反馈并可进入小镇。材料不足时提供学习入口。底部动作区与可滚动的预览内容分开，适配小屏。

小镇用三列地块展示现有建筑，保留原数据库位置，不再直接使用旧四列坐标，避免第四列超出屏幕。建造成功后返回地图会标记新建筑。未知建筑名称回退为空地素材。

## 连续草地与建造空地

地图使用连续的草地纹理填满建筑之间的空隙，移除规则圆点和浅色斜道。野花由白色雏菊、粉色三叶草花和淡紫色小花组成，分布疏密不一；原有建筑仍放在三列位置。

未建造地块不再渲染带木柱的旧空地图集帧，直接露出底层草地，以黄色虚线菱形和黄色加号提示建造。每块空地都可以点击进入工坊，第一个空地显示“建造新建筑”。草地按地图行数增加纹理块，避免地图变长后露底或把花朵拉长。

- 地图素材：`miniapp/images/town/meadow-grass.jpg`，768×768，127,441 字节。
- 原始生成图：`output/imagegen/meadow-grass-source.png`。使用内置 imagegen；只做尺寸和 JPEG 压缩后接入。
- 生成提示词：`output/imagegen/meadow-grass-prompt.md`。
- 验证：26 项建造、角色和生活页面测试通过，首页 WXML/WXSS 编译通过；浏览器检查 375px 和 320px 宽度、空地无木柱、黄色标记、空地点击进入工坊和草地加载。尚未做微信真机验收。

## 素材

### 建筑直接落在草地上

建筑、公园、树林和小旗的草皮／泥土底座已从透明素材中移除。住宅的三个等级和花箱也同步去掉底座，保留建筑基础、门前台阶、树木、花箱等实际物体；在地图上直接露出连续草坪。

地图名称统一使用 `buildingEmoji` 中的对应图标，例如 🏫 学校、🏪 商店、🏥 医院、🐾 宠物医院、🚒 消防站；我的家显示 🏡。图标在名称前独立排版，不改变点击建筑查看详情、点击空地建造的行为。

- 内置 imagegen 编辑源图：`output/imagegen/town-grounded-source.png`、`output/imagegen/home-grounded-source.png`。
- 完整提示词和图集打包记录：`output/imagegen/grounded-atlases-prompt.md`。移除底座后分切、等比例缩放、按等分网格排列并保留透明 alpha；砖块、金币和工具图标沿用原素材。
- 地图效果：`output/town-grounded-preview.png`。
- 验证：26 项建造、角色和生活测试通过；首页、建造页、角色页和共享模板 WXML 编译通过，首页与全局 WXSS 编译通过。浏览器检查 375px 地图及 320px 全部 11 种建筑、三级住宅：图片加载正常，名称图标无截断，页面无横向溢出，点击建筑可打开对应详情。尚未做微信真机验收。

### 原始图集来源

- 生成方式：内置 imagegen 工具，生成一次、调整图集排列一次。为本项目生成的方块风设计，未提取 Minecraft 原版素材。
- 当前成品：`miniapp/images/town/voxel-atlas.png`，1024 × 1024 透明 PNG，187,850 字节。保留 alpha，使用调色板压缩；无 CDN 依赖。原始图集的底座已按上文移除。
- 源图副本：`output/imagegen/town-atlas-source.png`（本地输出目录）。
- 4 × 4 图集，从左至右、从上至下：学校、商店、医院、公园；餐厅、电影院、图书馆、警察局；消防站、体育馆、空地、树林；砖块、金币、工具、旗帜。
- 映射：`miniapp/utils/assets.js`；共享模板：`miniapp/templates/voxel.wxml`；图集样式：`miniapp/app.wxss`。
- Minecraft 原版贴图、模型和其他资产受官方 [Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines) 约束。本项目采用独立生成的体素造型。

## 数据与行为

砖块价格、拥有量和可建造状态来自现有接口，不新增木材等经济资源。当前后端按砖块开放全部建筑，图鉴不显示建筑等级门槛；新增的小镇长等级用于角色称号，规则见 [角色养成](resident-growth.md)。

预览不提交请求；等待建造时锁住按钮和关闭动作；成功使用服务端 `remaining_bricks` 更新本地余额。建造异常后只重新读取列表，不自动重试扣砖请求。角色养成接入后，建造、发奖和消费统一在事务内锁定用户行，再检查重复建造与余额，避免并发重复扣款或覆盖余额。

## 生活功能

新增宠物医院图纸（10 砖块），复用医院图集并以爪印和名称区分。所有图纸预览会说明建成后解锁的生活事件，例如医院解锁居民感冒，消防站解锁小火情。宠物生病需要同时拥有宠物和宠物医院；服务仅花 1 金币。完整规则见 [小镇生活](town-life.md)。已有数据库需要重新执行建筑种子导入，才能显示新图纸。

## 验证

- `node --test scripts/building-test.cjs scripts/learning-test.cjs`：8 项建造测试 + 21 项学习回归。
- 用微信开发者工具内置 wcc/wcsc 编译两个页面与共享模板，输入路径使用正斜杠以正确解析 import。
- 用编译后的 WXML 和页面逻辑 mock 渲染浏览器预览，检查 375px 常规布局和 320 × 568 小屏、材料不足、建造前后余额、地图三列和固定操作区。
- 上述预览不是微信真机测试；未连接生产数据库或扣除真实用户资源。

## 原始生成提示词

```text
Use case: stylized-concept
Asset type: one production game sprite atlas for a Chinese children's vocabulary town-building miniapp.
Create ONE square PNG sprite atlas, exactly 4 columns by 4 rows of equally sized square cells. Transparent alpha background everywhere outside objects. No grid lines, no text, no labels, no borders. All 16 sprites must be fully separated inside their own cells with generous transparent gutters, no overlapping or clipping.
Style: original charming voxel town miniatures, chunky cubic geometry, crisp faceted blocks, isometric orthographic view from above at 30 degrees, warm sunlight from upper left, vivid moss-green grass, warm cream plaster, terracotta brick, honey wood, blue windows. Clear simple silhouettes readable at 96px. Consistent camera, scale, light across all sprites. No Minecraft textures, logos, characters or recognizable proprietary assets. Not photorealistic, not rounded clay.
Each building sits on its own thin diamond grass-and-earth square tile. Center the full object in each cell; tile bottom at roughly 88% of its cell. Enough space above tallest tower.
Exact row-major cell contents:
Row 1: (1) small cream village school with terracotta stepped roof and clock over entrance; (2) cozy small general store with green-and-cream striped awning and wooden crates; (3) small white clinic with teal roof and green medical plus sign; (4) park grass island with cubic green trees, square fountain and bench.
Row 2: (1) warm orange restaurant with a small chimney and outdoor table; (2) purple-roof village cinema with a blank marquee and simple film-reel ornament; (3) honey-colored library with blue roof and large arched window and book-like sign; (4) small blue police station with a shield badge.
Row 3: (1) red fire station with one garage door and little red vehicle; (2) open oval sports stadium built entirely of stepped cubes with green playing field; (3) empty diamond grass-and-soil tile with a short wooden stake, same footprint as buildings; (4) small cluster of three cubic trees and tiny flowers on a grass island.
Row 4: (1) icon of a neat stack of terracotta building bricks, no ground tile; (2) icon of three chunky golden coins, no currency symbols, no ground tile; (3) crossed wooden mallet and small blueprint rolled scroll, no ground tile; (4) a tiny planted orange pennant flag on a grass island.
Do not add extra objects outside their specified cell. Render as high quality polished game art, 1536 by 1536 or larger square. Genuine transparent background, not a drawn checkerboard.
```

## 图集排列调整提示词

```text
Edit this production sprite atlas for exact programmatic grid use. Preserve all 16 original objects in the same order and the same original voxel designs, colors, light, and transparent background. Correct ONLY their scale and placement. Canvas must be exactly square. Divide the canvas into exactly four equal columns and four equal rows, giving 16 equal SQUARE cells. Sprite centers must be at x=12.5%,37.5%,62.5%,87.5% and y=12.5%,37.5%,62.5%,87.5%. EACH entire sprite, including its ground tile and all extremities, MUST fit completely within the central 76% width AND central 76% height of its own cell. That means 12% transparent padding on ALL FOUR SIDES of each cell, including the outermost cells. Make the school, clinic, restaurant, cinema and fire station smaller to fit! Never let the bottom edge of a tile cross the 25%,50%,75% horizontal cell boundaries. Leave the transparent margins intact; do NOT crop the overall canvas to content. No grid, text or labels. This is a technical rearrangement for a game sprite sheet: every object must be usable by cropping exactly one quarter of the full image width and height, with NO neighboring object visible.
```
