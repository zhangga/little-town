# Subway Chase and Starcoin Implementation Plan

> **For agentic workers:** Execute the tasks inline in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished three-lane chase with skateboards, springboards, coins, stars, a capture animation and a persistent exchange/shop.

**Architecture:** Keep the simulation platform-independent and retain the native Canvas menu fixes. Add a server-owned starcoin wallet with issued run sessions, bounded result validation and idempotent transactions. Keep pending settlements and shop requests scoped to backend/account so retries never award or spend twice.

**Tech Stack:** WeChat WXML/WXSS and Canvas 2D, CommonJS, Go/Gin/GORM/MySQL, Node test runner.

### 1. Gameplay

- [ ] Replace three hearts in `miniapp/subway/utils/runner.js` with an 8-second chase window: barrier/sign collision stumbles, a second collision during pursuit captures, train/truck collision captures immediately. A skateboard absorbs one hit; give one free activation each run and spawn extra boards. Springboards launch a higher jump that clears vehicles. Add coin trails, stars and a temporary coin magnet. Freeze play during the 2.2-second capture/carry animation, then show the result.
- [ ] Update `scripts/subway-test.cjs` for protected vehicle impacts, pursuit recovery, consecutive stumbles, capture timing, spring jumps, collectible height, safe procedural lanes and pause/unload behavior. Run `node --test scripts/subway-test.cjs`.

### 2. Wallet and shop

- [ ] Add `backend/internal/models/subway.go`, `services/subway.go`, `handlers/subway.go`; register migrations and authenticated `/subway`, `/subway/start`, `/subway/finish`, `/subway/purchase`, `/subway/equip` routes. Lock the user row for wallet writes and persist run/purchase request IDs.
- [ ] Award one starcoin per collected coin and five per star, bounded by elapsed time/distance, 500 per run and 1000 per day. Exchange 50 for 10 town coins or 100 for one brick. Sell sunset/aurora board skins for 120/180; free mint board is initially equipped. A skin never changes protection strength.
- [ ] Test replayed/concurrent settlement, account isolation, fabricated quantities, expiry, insufficient balance, duplicate purchases and atomic exchanges against a dedicated MySQL test database. Run `go test ./...` and the MySQL suite.

### 3. Controller and visual experience

- [ ] Add `miniapp/subway/utils/runner-economy.js` for retryable start/settlement/shop operations, using the existing API and account identity. Attach pending settlements before accepting another run; persist them before sending. Preserve original request IDs on network errors.
- [ ] Rework `runner-renderer.js` with colorful perspective city blocks, tracks, bright trains, coin trails, skateboard trails, floating pickups, runner poses and a visible chaser who lifts/carries the runner at the end.
- [ ] Redesign `pages/run/run.wxml` and `.wxss`: arcade title card, compact live score/coin/chase HUD, large touch controls plus board button, result receipt and starcoin shop with explicit prices/balances. Keep Canvas hidden on menus and measure `.run-stage`; bind gestures only to Canvas.
- [ ] Update station copy and expose the starcoin shop from the mall. Extend the preview fixture to exercise settlement, spending, equipping and retry states without production writes.

### 4. Verification

- [ ] Compile actual WXML/WXSS via `node scripts/subway-preview.cjs`, run browser input checks at 375px and 320px, inspect running/captured/shop scenes and test touch gestures.
- [ ] Run relevant integration suites and `git diff --check`; document endpoints, rates, limits and the validation boundary (bounded client results, not authoritative gameplay replay).
