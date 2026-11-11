# Subway Chase and Starcoin Implementation Plan

> **For agentic workers:** Execute the tasks inline in this session. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver a polished three-lane chase with skateboards, springboards, coins, stars, a capture animation and a persistent exchange/shop.

**Architecture:** Keep the simulation platform-independent and retain the native Canvas menu fixes. Add a server-owned starcoin wallet with issued run sessions, bounded result validation and idempotent transactions. Keep pending settlements and shop requests scoped to backend/account so retries never award or spend twice.

**Tech Stack:** WeChat WXML/WXSS and Canvas 2D, CommonJS, Go/Gin/GORM/MySQL, Node test runner.

### 1. Gameplay

- [x] Replace three hearts in `miniapp/subway/utils/runner.js` with an 8-second chase window: barrier/sign collision stumbles, a second collision during pursuit captures, train/truck collision captures immediately. A skateboard absorbs one hit; give one free activation each run and spawn extra boards. Springboards launch a higher jump that clears vehicles. Add coin trails, stars and a temporary coin magnet. Freeze play during the 2.2-second capture/carry animation, then show the result.
- [x] Update `scripts/subway-test.cjs` for protected vehicle impacts, pursuit recovery, consecutive stumbles, capture timing, spring jumps, collectible height, safe procedural lanes and pause/unload behavior. Run `node --test scripts/subway-test.cjs`.

### 2. Wallet and shop

- [x] Add `backend/internal/models/subway.go`, `services/subway.go`, `handlers/subway.go`; register migrations and authenticated `/subway`, `/subway/start`, `/subway/finish`, `/subway/purchase`, `/subway/equip` routes. Lock the user row for wallet writes and persist run/purchase request IDs.
- [x] Award one starcoin per collected coin and five per star, bounded by elapsed time/distance, 500 per run and 1000 per day. Exchange 50 for 10 town coins or 100 for one brick. Sell sunset/aurora board skins for 120/180; free mint board is initially equipped. A skin never changes protection strength.
- [x] Test replayed/concurrent settlement, account isolation, fabricated quantities, expiry, insufficient balance, duplicate purchases and atomic exchanges against a dedicated MySQL test database. Run `go test ./...` and the MySQL suite.

### 3. Controller and visual experience

- [x] Add `miniapp/subway/utils/runner-economy.js` for retryable start/settlement/shop operations, using the existing API and account identity. Attach pending settlements before accepting another run; persist them before sending. Preserve original request IDs on network errors.
- [x] Rework `runner-renderer.js` with colorful perspective city blocks, tracks, bright trains, coin trails, skateboard trails, floating pickups, runner poses and a visible chaser who lifts/carries the runner at the end.
- [x] Redesign `pages/run/run.wxml` and `.wxss`: arcade title card, compact live score/coin/chase HUD, large touch controls plus board button, result receipt and starcoin shop with explicit prices/balances. Keep Canvas hidden on menus and measure `.run-stage`; bind gestures only to Canvas.
- [x] Update station copy and expose the starcoin shop from the mall. Extend the preview fixture to exercise settlement, spending, equipping and retry states without production writes.

### 4. Verification

- [x] Compile actual WXML/WXSS via `node scripts/subway-preview.cjs`, run browser input checks at 375px and 320px, inspect running/captured/shop scenes and test touch gestures.
- [x] Run relevant integration suites and `git diff --check`; document endpoints, rates, limits and the validation boundary (bounded client results, not authoritative gameplay replay).


## Verification — 2026-11-07

- 78 Node tests passed across subway, buildings, interiors, building games, town layout and page lifecycle.
- `go test ./...` passed. Dedicated MySQL `TestSubway` tests passed with concurrent settlement/exchange, account ownership, daily rollover, limits and request replay; authenticated route tests passed.
- Real WXML/WXSS compilation passed. Browser checks at 375×812 and 320×568 passed for five controls, swipes, pause/resume, shop exchange/equip, capture/carry, settlement and restart. Start/game/result/shop screens were visually inspected.
- WeChat DevTools automation passed with actual Canvas, five control buttons, pause/resume/end, production controller connected to the local Go API, successful collection settlement and shop open/close; no runtime exceptions. This is DevTools verification, not a physical phone test.
- Preview renderer now preserves Canvas bitmap dimensions during HUD DOM updates. Native menu safety remains: hidden Canvas outside running/capture, stage-based sizing, and gestures bound only to Canvas.
- Local server was still the old debugger binary and returned 404 for `/subway`. Restarted the local service with current code and the existing backend `.env`; readiness and authenticated routes confirmed. Local runtime files/log/PID are under ignored `output/subway-preview/`.
- Temporary WeChat automation (9421) and CLI service (34394) were closed; Security settings visibly confirms service port off. Local preview listener was also stopped.
