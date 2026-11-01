# Subway Station and Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a buildable subway station whose train opens an original three-lane running game.

**Architecture:** Reuse the building catalog, map, and building sheet. Keep the free runner in a `subway` subpackage with separate simulation, Canvas renderer, and page lifecycle controller. Check station ownership through the existing town API; store personal bests locally by backend and account, without changing the town wallet.

**Tech Stack:** Native WeChat WXML/WXSS, Canvas 2D, CommonJS JavaScript, existing Go building import, Node test runner, WeChat wcc/wcsc.

---

### Task 1: Building and station entrance

**Files:** `backend/data/buildings.json`, `miniapp/utils/{assets,town-life,building-interior}.js`, `miniapp/templates/{building-interior,subway-platform}.wxml`, `miniapp/pages/index/{index.wxml,building-interior.wxss}`, `miniapp/images/town/subway-station.png`.

- [ ] Append the building (preserve existing IDs/order) and map its original local illustration:

```json
{"name":"地铁站","description":"点击站台上的地铁，开启换道、跳跃和下滑的跑酷冒险","subject":"english","cost_bricks":15,"unlock_level":2,"image_url":"/images/town/subway-station.png"}
```

- [ ] Render a dedicated platform with a tappable train, route line, free-entry label, and instructions. Route the guarded `onOpenSubwayRunner` handler to `/subway/pages/run/run`.
- [ ] Verify all catalog buildings have distinct existing art and station taps navigate only from the station with no request in flight:

```sh
node --test scripts/building-test.cjs scripts/building-interior-test.cjs scripts/subway-test.cjs
```

### Task 2: Playable runner

**Files:** `miniapp/subway/utils/{runner,runner-renderer,runner-page}.js`, `miniapp/subway/pages/run/run.{js,json,wxml,wxss}`, `miniapp/app.json`.

- [ ] Implement `createRun`, `controlRun`, `stepRun`, and `runView`: three lanes, jumping barriers, sliding under signs, dodging trains, collecting stars, three hearts, increasing speed, pause and restart. Spawn patterns always leave a clear lane; use small time steps for collision detection.
- [ ] Draw the track, scenery, obstacles, stars, and original runner with Canvas; update only HUD data on a throttled schedule.
- [ ] Wire touch swipes and four visible control buttons; load ownership with `GET /buildings/my-town`; handle loading, locked, retry, ready, running, paused, and finished states.
- [ ] Cancel animation frames on hide/unload; resume only on explicit tap. Key local records by backend and user; ignore stale async callbacks after account changes or unload; recover gracefully from storage failures.

### Task 3: Verification and usage notes

**Files:** `scripts/subway-test.cjs`, `scripts/subway-preview.cjs`, `scripts/building-test.cjs`, `scripts/README.md`, `docs/town-building.md`, `README.md`.

- [ ] Exercise collisions, safe moves, input boundaries, frame-rate behavior, spawn fairness, stars, replay, ownership, account isolation, pause/unload, canvas errors, and local record failures with deterministic tests.
- [ ] Compile real WXML/WXSS and generate a local interactive preview using the product simulation/controller/renderer. Inspect station, gameplay, pause and result views at 375px and 320px widths.
- [ ] Run the relevant regression suite and page registration check:

```sh
node --test scripts/subway-test.cjs scripts/building-test.cjs scripts/building-interior-test.cjs scripts/building-games-test.cjs scripts/town-layout-test.cjs scripts/page-loading-test.cjs
node scripts/subway-preview.cjs
git diff --check
```

- [ ] Document build cost, controls, local scores, and the existing idempotent building-seed import needed for databases created before this addition. Preserve unrelated in-progress home and school changes.
