# 去掉建筑地块底座

使用内置 imagegen，编辑模式，transparent_background: true。

成品：
- `miniapp/images/town/voxel-atlas.png`，1024×1024，4×4 图集。
- `miniapp/images/resident/home-atlas.png`，1024×1024，2×2 图集。

最终生成源图：`output/imagegen/town-grounded-source.png`、`output/imagegen/home-grounded-source.png`。

底座移除由 imagegen 完成。接入时用 Sharp 分切、等比例缩放、排列成精确等分图集，并做保留 alpha 的 PNG 调色板压缩；不改绘物体。建筑帧最长边 210px，底部对齐单格 y=229px；住宅帧最长边 432px，底部对齐单格 y=472px。原图集中的砖块、金币和工具图标保持原样。

## 建筑底座移除提示词

```text
Use case: precise-object-edit. Asset type: transparent game sprite atlas, edited for an existing town map.
Edit target: the provided 4 by 4 voxel sprite atlas. Remove the thick diamond-shaped grass-and-soil platform from beneath EVERY building and landscape object, exposing genuine transparent alpha in its place so the objects can sit directly on a continuous lawn in the game. Remove ALL rectangular/diamond outer lawn platforms, brown soil sides, floating slabs, detached platform shadows, and raised tile edges. Preserve the actual buildings including foundation walls, entrance steps and small paved thresholds; preserve trees, flowers, crates, bench, fountain, stadium playing field and architectural details. The park and trees must become separate natural objects on transparent ground, not an island. Keep the blank plot's wooden stake if needed, but remove its entire platform; this frame is not used on the map. Keep brick, coin, tool icons unchanged. Keep the flag but remove its lawn platform.
Invariants: retain exact original designs, warm voxel style, colors, isometric viewing angle, orientation, object scale and placement, and the exact 4-column by 4-row atlas ordering. Every object must remain fully contained within its original square cell with transparent gutters and no neighbors crossing cell boundaries. Same square canvas and overall layout, no added objects, no missing buildings, no text, no labels, no grid lines. New transparent areas replace removed terrain. No new lawn patches, no oval or rectangular bases, no solid background, no drawn checkerboard. Shadows only subtle contact shadows immediately touching the objects, never offset floating shadows. This is removal of terrain platforms only, not a redesign.
```

## 住宅底座移除提示词

```text
Use case: precise-object-edit. Asset type: transparent 2 by 2 voxel home sprite atlas for an existing game.
Edit target: the provided home atlas. Remove the entire thick square diamond-shaped grass-and-soil platform underneath all three houses AND the flower planter. Replace those grass surfaces and brown soil slab sides with genuine transparent alpha, so each house sits directly on the game's continuous grass texture. Preserve houses, foundation walls, entrance steps, small stepping stones, flower pots, mailbox, hedges, balcony, porch and the fourth cell's wooden planter and watering can. Remove all hard-edged lawn islands, floating terrain slabs, raised ground edges, and detached platform shadows. Preserve subtle contact shadows only directly touching the remaining objects.
Invariants: exact original warm voxel designs, colors, lighting, isometric orientation, scale, placement and four-cell order. Top left starter cottage, top right upgraded cottage, bottom left two-storey house, bottom right flower planter. Keep square canvas split exactly into 2 columns and 2 rows; every complete object within original cell with transparent gutters. No object crosses cell boundaries. Do not crop canvas, add text, draw checkerboard or fill the transparent background. No new lawn bases, no brown earth platforms, no background scenery. This is removing terrain platforms only, not a redesign.
```

## 建筑排列调整提示词

```text
Use case: precise-object-edit. Technical layout correction ONLY for the provided transparent 4x4 game sprite atlas. Keep every terrain-free object, its design, colors, voxel style and transparent background. Do NOT reintroduce any grass ground tiles, brown soil slabs or platforms.
Reposition and resize each of the 16 objects so each is COMPLETELY within the CENTRAL 72% width AND 72% height of its own equal square cell. Leave at least 14% of a cell empty transparent on ALL FOUR sides. Canvas exactly square, exact 4 columns x 4 rows. The centers are at x=12.5%,37.5%,62.5%,87.5% and y=12.5%,37.5%,62.5%,87.5%. At a 1280 canvas size cells are 320x320: first object MUST fit x45..275 y45..275, second x365..595 y45..275, and so on. Nothing, including bushes, steps, flowers and tiny pixels, can touch or cross a cell edge. Keep buildings reasonably similar scale; fit the entire stadium and school within these limits. Row order: school/shop/clinic/park; restaurant/cinema/library/police; firestation/stadium/unused wooden stake/trees; bricks/coins/tools/flag. NO extra objects, no labels, no grid, no checkerboard, no opaque background. Clean alpha around objects with no isolated speckles. Treat original object silhouettes as complete independent sprites, reduce each as needed, and retain full empty gutters. Do not crop canvas to artwork.
```

## 住宅排列调整提示词

```text
Use case: precise-object-edit. Technical layout correction ONLY for the provided transparent 2x2 home atlas. Keep the exact four terrain-free house/planter designs, colors, voxel style, details, and genuine transparency. Do NOT add any grass platform or soil slab.
Canvas exactly square, split into EXACTLY 2 columns and 2 rows of equal square cells. Place the full object inside the CENTRAL 80% of its own cell in width AND height, leaving at least 10% transparent margin on ALL FOUR sides. Object centers x25%,75% and y25%,75%. At1280x1280, top left whole cottage fits x64..576,y64..576; top right fits x704..1216,y64..576; bottom left entire tall house including chimney/porch/hedges/steps fits x64..576,y704..1216; bottom right full flower planter fits x704..1216,y704..1216. Crucial: the bottom-left house currently extends above the halfway boundary: make it smaller and lower so its chimney is below y704 and absolutely no pixel of it appears in either top cell. Do not move anything from its original cell. Maintain comfortable consistent visual scale. No grids, labels, text, extra sprites, speckles, checkerboard or opaque background. No piece of any sprite may touch or cross a cell boundary; keep full transparent gutters; don't crop canvas to art.
```
