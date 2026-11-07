# Subway Station and Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a buildable subway station whose train opens an original three-lane running game.

**Architecture:** Reuse the building catalog, map, and building sheet. Keep the free runner in a `subway` subpackage with separate simulation, Canvas renderer, and page lifecycle controller. Check station ownership through the existing town API; store personal bests locally by backend and account, without changing the town wallet.

**Tech Stack:** Native WeChat WXML/WXSS, Canvas 2D, CommonJS JavaScript, existing Go building import, Node test runner, WeChat wcc/wcsc.

---

### Task 1: Building and station entrance

**Files:** `backend/data/buildings.json`, `miniapp/utils/{assets,town-life,building-interior}.js`, `miniapp/templates/{building-interior,subway-platform}.wxml`, `miniapp/pages/index/{index.wxml,building-interior.wxss}`, `miniapp/images/town/subway-station.png`.

- [x] Append the building (preserve existing IDs/order) and map its original local illustration:

```json
{"name":"地铁站","description":"点击站台上的地铁，开启换道、跳跃和下滑的跑酷冒险","subject":"english","cost_bricks":15,"unlock_level":2,"image_url":"/images/town/subway-station.png"}
```

- [x] Render a dedicated platform with a tappable train, route line, free-entry label, and instructions. Route the guarded `onOpenSubwayRunner` handler to `/subway/pages/run/run`.
- [x] Verify all catalog buildings have distinct existing art and station taps navigate only from the station with no request in flight:

```sh
node --test scripts/building-test.cjs scripts/building-interior-test.cjs scripts/subway-test.cjs
```

### Task 2: Playable runner

**Files:** `miniapp/subway/utils/{runner,runner-renderer,runner-page}.js`, `miniapp/subway/pages/run/run.{js,json,wxml,wxss}`, `miniapp/app.json`.

- [x] Implement `createRun`, `controlRun`, `stepRun`, and `runView`: three lanes, jumping barriers, sliding under signs, dodging trains, collecting stars, three hearts, increasing speed, pause and restart. Spawn patterns always leave a clear lane; use small time steps for collision detection.
- [x] Draw the track, scenery, obstacles, stars, and original runner with Canvas; update only HUD data on a throttled schedule.
- [x] Wire touch swipes and four visible control buttons; load ownership with `GET /buildings/my-town`; handle loading, locked, retry, ready, running, paused, and finished states.
- [x] Cancel animation frames on hide/unload; resume only on explicit tap. Key local records by backend and user; ignore stale async callbacks after account changes or unload; recover gracefully from storage failures.

### Task 3: Verification and usage notes

**Files:** `scripts/subway-test.cjs`, `scripts/subway-preview.cjs`, `scripts/building-test.cjs`, `scripts/README.md`, `docs/town-building.md`, `README.md`.

- [x] Exercise collisions, safe moves, input boundaries, frame-rate behavior, spawn fairness, stars, replay, ownership, account isolation, pause/unload, canvas errors, and local record failures with deterministic tests.
- [x] Compile real WXML/WXSS and generate a local interactive preview using the product simulation/controller/renderer. Inspect station, gameplay, pause and result views at 375px and 320px widths.
- [x] Run the relevant regression suite and page registration check:

```sh
node --test scripts/subway-test.cjs scripts/building-test.cjs scripts/building-interior-test.cjs scripts/building-games-test.cjs scripts/town-layout-test.cjs scripts/page-loading-test.cjs
node scripts/subway-preview.cjs
git diff --check
```

- [x] Document build cost, controls, local scores, and the existing idempotent building-seed import needed for databases created before this addition. Preserve unrelated in-progress home and school changes.

## Verification result

- 67 related Node tests passed, including 14 runner/integration cases.
- Actual station and runner WXML/WXSS compiled with WeChat wcc/wcsc.
- Browser checks covered station-to-game navigation, buttons, pause/resume, collision result, restart, and 320px/375px layouts; narrow-screen control buttons remain at least 44px tall.
- Local development seed import added the station to `127.0.0.1:3306/littletown_db`; no user building was constructed or wallet changed.
- Interactive preview: `node scripts/subway-preview.cjs --serve 9436`. Screenshots are in ignored `output/subway-preview/`. Physical WeChat device verification remains outside this local check.

### Button regression follow-up — 2026-11-01

- Reproduced in WeChat DevTools 2.02.2609231 RC / base library 3.17.4: the native Canvas covered the start/pause cards while the four controls stayed disabled. Increasing the overlay z-index did not resolve it. Hiding Canvas exposed the cards, but its zero layout size prevented initialization.
- Keep Canvas mounted and show it only during a run; measure the surrounding stage for initialization. Bind swipe handlers to Canvas instead of the menu container so they do not intercept start/resume taps. Set top-bar button widths explicitly for native button defaults.
- Added a failing-then-passing regression for hidden Canvas initialization and resizing while paused. The browser preview now patches existing nodes and preserves a pressed button across HUD updates; its mouse-down/up regression covers all four actions and a 500 ms hold.
- Verified physical mouse clicks in the WeChat simulator: start, left, right, jump, slide, pause, resume and restart. A drag on the track still changes lanes. The simulator test used a temporary project copy with a station ownership fixture to avoid concurrent hot reloads; the game controller, renderer, WXML and WXSS matched the workspace. No town wallet writes were made.
- Rechecked the workspace project with its real station ownership: start, left movement and pause passed. All 68 relevant regression tests, the browser mouse checks and WXML/WXSS compilation passed. Removed the temporary project, disabled the authorized CLI service and restarted DevTools without the enable-port flag; the CLI port and both automation ports were confirmed closed.
