# 人物与宠物四方向素材

工具：内置 imagegen，透明背景；人物以现有角色图集为参考，宠物为新生成素材。

成品：
- `miniapp/images/resident/walk-directions.png`，1024×1024，174,714 字节，4×4 图集。行：日常、建造师、园丁、探险家；列：向下正面、向上背面、向左侧面、向右侧面。
- `miniapp/images/resident/pet-directions.png`，1024×512，112,734 字节，4×2 图集。行：小狗、小猫；列序同上。

原始输出：`output/imagegen/resident-directions-source.png`、`output/imagegen/pet-directions-source.png`。

接入时用 Sharp 分切、按同一角色统一比例缩放、排列为精确的 256px 方格，并压缩为保留透明 alpha 的调色板 PNG。各帧脚底对齐到单格 y=224px；同一行共用比例，避免转身时忽大忽小。未改绘人物或动物。

## 人物提示词

```text
Use case: identity-preserve.
Asset type: transparent four-direction character sprite atlas for an existing miniature town game.
Input image is the character identity, outfit, and rendering reference. Make a NEW directional atlas preserving these same four original warm rounded 3D cartoon child outfit variants. Replace the gesture columns with directional views. Exact layout: 4 columns by 4 rows, square canvas. Every complete full-body character isolated with transparent gutters.
Column 1: FRONT view, body and face point straight toward the viewer, for walking DOWN the screen.
Column 2: BACK view, body faces directly away from the viewer, back of head and back of clothing visible, NO face or eyes visible, for walking UP the screen.
Column 3: LEFT profile, head, nose, chest and toes all point to the LEFT edge of the canvas.
Column 4: RIGHT profile, head, nose, chest and toes all point to the RIGHT edge of the canvas.
Row 1: same curly brown-haired child, sage green jacket, cream shorts and white shoes, orange backpack as in reference.
Row 2: same builder child with yellow hardhat, cream shirt, blue overalls, brown boots.
Row 3: same gardener child with straw hat and green band, yellow shirt, green overalls, brown boots.
Row 4: same explorer child with teal cap, cream safari jacket, orange neckerchief, blue trousers and brown shoes.
Each is relaxed mid-stride with a small natural separation of feet and arms, no waving, no jumping, no raised arms. Same body size, head proportions, clothing colors, camera elevation and lighting across directions. Do not turn the head back toward the viewer in the back or profile views. This is anatomical turning of the whole character, not rotation of a flat front image. Full body including hats, backpacks and feet must fit within the central 74% of cell height and 64% of cell width, with all feet on the same baseline inside each row. Keep the exact row and column order. Clean genuine alpha transparency outside each character, no speckles, floor, base, scenery, text, labels, checkerboard, arrows or grid. Readable at 40 screen pixels high.
```

## 宠物提示词

```text
Use case: stylized-concept.
Asset type: game sprite atlas with 8 complete pet sprites, transparent background, exactly 4 columns by 2 rows of equal square cells, wide 2:1 canvas.
Create original warm rounded 3D cartoon miniature pets matching a charming children's village game with softly shaded clay-like characters. Row 1 is the SAME small tan-and-cream puppy with floppy ears and short curved tail in four directional views. Row 2 is the SAME small ginger-and-cream tabby cat with upright tail in four directional views. Cute natural animal proportions, all four legs, coherent body size, simple readable silhouettes at 24 screen pixels. These are whole-body walking pets, not floating pet heads or emoji.
Column 1 FRONT: head and body facing toward viewer, walking DOWN screen, face visible.
Column 2 BACK: head and whole body facing away from viewer, walking UP screen, back of head and rump and tail visible, NO face looking back and no visible eyes.
Column 3 LEFT: entire body in side profile, nose, head, chest and feet pointing toward LEFT edge of canvas.
Column 4 RIGHT: entire body in side profile, nose, head, chest and feet pointing toward RIGHT edge of canvas.
Slightly elevated game camera identical in all cells. Natural quiet mid-stride stance with small separation of paws. Keep tan/cream markings for puppy and ginger/cream stripe pattern for cat consistent across all views. Retain the animals' three-dimensional upright orientation; don't rotate a flat image. Each full pet including ears and tail fits within central 76% width and 76% height of its cell. Equal cell size, generous fully transparent gutters, no overlaps. Same scale across all four views of each pet. No collar, leash, clothes, toys, scenery, ground tiles, floor, drop shadow, text, numbers, arrows, grid or checkerboard. Crisp clean genuine transparent alpha outside the animals, no speckles.
```
