# 商场与室内家具素材

使用内置 image_gen 工具生成。风格参考原有 `miniapp/images/town/voxel-atlas.png` 和 `miniapp/images/resident/home-atlas.png`；保留原有全部住宅升级造型。透明源图在此目录，生产 PNG 由 `scripts/pack-home-art.cjs` 分切并缩放。

## mall

```text
Use case: stylized-concept. Asset type: a single production isometric building sprite for the existing Little Town game.
Input image 1 is the ORIGINAL TOWN ATLAS, style reference only. Input image 2 is the ORIGINAL HOME ATLAS, style reference only. Match those references closely: richly rendered chunky voxel / oak wooden-block toys, cream plaster, golden oak trim, saturated orange terracotta details, blue glass, softly beveled block edges, warm upper-left lighting, contact shadows and subtle ambient occlusion. This is NOT flat vector art, NOT line art, NOT thin outlined illustration.
Create ONE charming two-storey neighborhood shopping mall, an expanded companion to the green-and-white awning shop in the first reference. Recognizable two levels, broad glass entrance, small shop windows, chunky green-and-white awning, oak pillars, orange roof trim, a modest glass skylight attached to the roof, a few potted shrubs and flowers. Friendly believable miniature architecture, clear silhouette at small map scale. Same isometric camera and orientation as the references. Complete isolated building centered in a square canvas, occupies about 78% of width and height with generous transparent gutters. No characters, no text, no signs with letters, no lawn tile, no soil block, no pedestal, no separate ground slab, no background scene. GENUINE transparent alpha background. Only subtle contact shadow at the feet of the building. One asset, not a collage.
```

## furniture

```text
Use case: stylized-concept. Asset type: one production FURNITURE SPRITE ATLAS for the existing Little Town game.
Input images 1 and 2 are STYLE REFERENCES ONLY: original town and home sprites. Match their warm polished dimensional wooden-block / voxel rendering, softly beveled chunky edges, golden oak, cream plaster, tactile soft colors and warm upper-left light. No flat vector style, no drawn black outlines. These are ordinary REAL HOME FURNITURE items, built as miniature collectible toy furniture in that existing style.
Create a transparent atlas with EXACTLY 4 columns by 3 rows, 12 equal SQUARE cells. Prefer a 1536 by 1152 canvas. Every cell has ONE complete isolated object, within the central 76 percent of its cell width and height, ample empty transparent margins on all four sides. Never overlap cells. Same isometric camera as the reference, consistent visual scale. No cell borders, no grid, no labels, no text, no floor, no platforms, no grass, no room, no background, no characters.
Exact row-major order:
row 1: (1) simple oak dining chair with CONNECTED seat, back and four legs; (2) cream two-seat sofa with sage cushions and two warm orange throw pillows; (3) flat-screen television on a low oak console with a still green mountain landscape on screen; (4) warm floor lamp with cream fabric shade and brass/oak stand.
row 2: (5) leafy green houseplant in terracotta flowerpot; (6) cozy single bed with cream pillow, sage green quilt, oak bedframe and connected headboard; (7) tall two-door oak wardrobe; (8) flat round woven rug with sage and tan rings.
row 3: (9) small oak writing desk with a blank open sketchbook and pencil cup; (10) oak bookcase filled with colored books; (11) oak dining table with a ceramic teacup and plate; (12) small mint-green two-door refrigerator.
Genuine transparent alpha. Subtle contact shadows only. All 12 objects complete and instantly recognizable, no extras, no watermarks.
```

## room

```text
Use case: style-transfer. Asset type: isometric room shell sprite, transparent, for a walkable 7x7 furniture placement game.
Input image 1 is the EDIT TARGET: current empty room shell. Images 2 and 3 are STYLE REFERENCES: original voxel town atlas and original home atlas.
Change ONLY the rendering style and materials of the empty room shell so it looks like the inside of those original homes: creamy plaster walls, warm oak beams and floorboards, chunky softly beveled wooden-block construction, sculpted 3D game render, warm daylight, subtle ambient occlusion. No flat vector art, no thin outline drawing. Keep the SAME floor diamond shape, camera angle, wall positions, canvas aspect ratio 700:560 and geometry: floor corners at approximate normalized coordinates top(50%,33.6%), right(90%,61.1%), bottom(50%,88.6%), left(10%,61.1%). Wall top rear corner at(50%,5%), left(10%,32.5%), right(90%,32.5%). The back walls meet at the same center corner. Keep all floor space EMPTY for furniture overlays, with seven by seven subtle floor divisions and no perspective convergence. Keep a window in the left wall, a small simple botanical picture on the right wall, a small flat sage welcome mat near the front left part of the floor. Do not add furniture or people. Retain exact empty floor footprint and composition, no camera rotation or extra walls, no roof. True transparent background outside the shell. No text, no labels, no external grass/dirt base or floating ground shadow. This image will be overlaid with separately rendered furniture and animated character.
```
