# Bento Restaurant Implementation Plan

> **For agentic workers:** Use the available collaboration agents to implement the backend and page presentation in parallel; the primary agent owns the shared contract, client state, integration and verification. The user has already requested execution.

**Goal:** Complete a free bento-making, resident-order, recipe and three-signature-menu loop with persistent resident memories.

**Architecture:** A kitchen subpackage contains the page and pure bento helpers, keeping the almost-full main package small. An authenticated restaurant service checks restaurant ownership, serializes mutations under the existing user-row lock, persists dishes/memories, and uses request IDs to make retries safe. Existing supplies and old admission receipts remain available.

**Tech Stack:** Native WeChat WXML/WXSS/JavaScript, Go/Gin/GORM/MySQL, node:test, Go tests and native WXML/WXSS compiler previews.

## Shared contract

All paths are relative to `/api/v1`. Every successful call returns the complete restaurant state. Empty lists are `[]`.

```js
// GET /restaurant
const dish = {
  name: '小熊春游便当', box_shape: 'square', box_color: 'peach', decoration: 'none',
  portions: [{ ingredient: 'rice', x: 32, y: 32, style: 'bear' }]
}
const state = {
  recipes: [{ id: 'recipe-id', dish, served_count: 0, first_taster: '', last_feedback: '' }],
  signature_ids: [],
  residents: [{ id: 'abu', name: '阿布', icon: '👦', preference: 'corn', visits: 0,
    last_dish_name: '', last_feedback: '',
    order: { id: 'abu-0', kind: 'wish', text: '我喜欢玉米，今天想吃一份玉米便当。', preferred_ingredient: 'corn', recipe_id: '' } }],
  recent_services: [],
  // Only supplied after the corresponding write; replay returns the same result.
  saved_recipe_id: '',
  service_result: null
}
// POST /restaurant/recipes (create or update a recipe)
const save = { request_id: 'bento-request-id-001', recipe_id: '', dish }
// PUT /restaurant/signatures (zero to three owned recipe IDs)
const menu = { request_id: 'bento-request-id-002', recipe_ids: ['recipe-id'] }
// POST /restaurant/serve
const serve = { request_id: 'bento-request-id-003', resident_id: 'abu', order_id: 'abu-0', recipe_id: '', dish }
// service_result / recent_services item
const result = { request_id: 'bento-request-id-003', resident_id: 'abu', resident_name: '阿布',
  dish, recipe_id: '', feedback: '你还记得我喜欢玉米！', preferred: true }
```

Allowed ingredients: `rice`, `egg`, `broccoli`, `corn`, `carrot`, `strawberry`. One to eight portions; repeated ingredients allowed. Coordinates are percentages, finite and within 15..85; round boxes additionally constrain portion centres to radius 35 about (50,50). Styles: `plain` for all; `bear` for rice; `star` for egg. Box shapes: `square`, `round`. Colors: `peach`, `mint`, `sunshine`. Decorations: `none`, `sesame`, `flower`, `star`. Names: 1–16 Unicode characters, trimmed, no control characters. Maximum 24 saved recipes. Recipe IDs are opaque strings. No new currency or charges.

Residents are `abu` / 阿布 / 👦 / corn, `taotao` / 桃桃 / 👧 / strawberry, `lin` / 林奶奶 / 👵 / broccoli. Any valid bento can be served; preferences improve specific feedback, not rewards. Orders alternate wishes, signatures and surprises based on visit history; available signature recipes produce named repeat orders. Signature orders require the displayed saved composition; client offers loading that recipe. Orders do not expire with time and have no waiting penalty. Request replay checks the complete semantic payload before returning the saved result; an order may only be served once.

## Task 1: Backend state, mutations and routes

Files: create `backend/internal/models/restaurant.go`, `backend/internal/services/restaurant.go`, `backend/internal/handlers/restaurant.go` and focused tests; modify `backend/internal/database/database.go`, `backend/internal/router/router.go`.

- [x] Validate dish input and constrain signatures/recipe ownership. Example regression:
  ```go
  // Reject unknown food, off-board/NaN coordinates and bear-shaped carrots;
  // accept repeated corn and preserve exact valid composition on reload.
  ```
- [x] Persist recipe snapshots, resident visits and recent service memories, and deduplicate all writes by user + request ID. Lock the user before loading or mutating restaurant state. Verify restaurant ownership for reads and writes.
- [x] Validate stale orders and cross-user references, cap saved recipes at 24 and signatures at 3. Preserve first-taster/history when updating recipes.
- [x] Run `cd backend && go test ./...`; run MySQL lifecycle/concurrency tests only with an isolated `littletown_test_` database.

## Task 2: Pure bento model and page state

Files: create `miniapp/kitchen/utils/bento.js`, `miniapp/kitchen/utils/restaurant-page.js`, `miniapp/kitchen/pages/restaurant/restaurant.js`, `scripts/restaurant-test.cjs`.

- [x] Implement immutable adding, moving, shaping, removing, clipping into round boxes, naming suggestions and dish presentation. Store canonical IDs, not presentation labels.
- [x] Implement select-then-tap and drag placement using board-relative touch coordinates. Keep recipe identity only while its saved composition matches; editing a saved recipe supports explicit update or save-as-new.
- [x] Implement loading, order selection, serving, saving, signature replacement and replay/recovery. Store draft and pending write under backend + user ID; never re-send an ambiguous write with a new request ID. Serialize writes and guard disposed pages.
- [x] Test full create/serve/save/signature/reorder flow, editing isolation, coordinate bounds, rapid taps, lost responses, draft recovery and account isolation using node:test.

## Task 3: Page presentation and entry point

Files: create `miniapp/kitchen/pages/restaurant/restaurant.wxml`, `.wxss`, `.json` and `miniapp/kitchen/templates/bento.wxml`; modify `miniapp/app.json`, `miniapp/templates/building-interior.wxml`, `miniapp/utils/building-interior.js`, `miniapp/pages/index/building-interior.wxss`.

- [x] Create a warm cream/terracotta/green kitchen with three resident tables, an actual movable bento, six food baskets, box and decoration controls, naming and serve/save actions, recipe book and three-slot signature board.
- [x] Keep loading/error/empty/pending/result states navigable on 320px and 375px screens. Provide tap placement alongside dragging and readable resident wishes, selections and disabled actions.
- [x] Add a prominent free kitchen entry in the restaurant lobby, preserving meal supplies and old ticket replay. Register the kitchen subpackage.

## Task 4: Integration and review

Files: add `scripts/restaurant-preview.cjs`, update `docs/town-life.md` and `docs/api.md` with the new flow and endpoints.

- [x] Run `node --test scripts/*test.cjs` and `cd backend && go test ./...`.
- [x] Compile real kitchen WXML/WXSS and inspect representative scenes in narrow and regular viewports, including full bento, named signature order, recipe book, result and pending/error states.
- [x] Review the final diff for data loss, request replay and cross-account errors. Document exact validation and any untested device/deployment limitations.

## Completion evidence

- Implemented the kitchen subpackage and authenticated restaurant aggregate, with no currency changes.
- `node --test scripts/*test.cjs`: 197 passing tests, including 16 restaurant tests.
- `cd backend && go test ./...`: passed. The isolated MySQL 8.4 restaurant lifecycle/concurrency test also passed, including receipt rollback and edited-recipe memory adoption; temporary test databases were removed.
- Native kitchen and index WXML/WXSS compilation passed. Eleven kitchen states at 320px and 375px passed 22 layout checks; final template uses stable integer portion slots and preserves all six visible foods.
- Review fixes cover request recovery, storage failures, exact coordinates, cancelled gestures, stale callbacks after A→B→A account changes, pending button state and touch-target size.
- No production deployment or WeChat real-device acceptance was performed. Browser previews use deterministic mock state and are static layout checks.
