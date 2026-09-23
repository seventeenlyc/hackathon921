# 固定路线推进、天然机油与模式排行榜实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 按波次自动启用 1–4 条出生路线，加入 AI / 人类模式都可用的天然机油，并提供 AI、人类和总排行榜。

**Architecture:** 纯函数决定波次路线数，Map 从第 1 波起保证全部四个出生点有路可走。天然机油由无 DOM 状态机管理，模拟只在 RUNNING 步进，塔读取统一攻速倍率。排行榜继续以服务端 run / wave event 为成绩来源，在 run 创建时固定模式，再由客户端选择 AI、人类或总榜。

**Tech Stack:** TypeScript、Vite、HTML5 Canvas、Node.js 22 内置 `node:sqlite`、SQLite、现有 Node 测试与本地浏览器验收；不增加运行时依赖。

**Spec:** `docs/superpowers/specs/2026-09-23-wave-lanes-oil-mode-leaderboards-design.md`

## Global Constraints

- 路线数：第 1–50 波 1 路，第 51–100 波 2 路，第 101–150 波 3 路，第 151 波起 4 路。
- 路线在波次边界更新，顺序为更新路线、AI 观察并规划、开始出兵；四个出生点从第 1 波起都必须可达。
- 天然机油售价 2000 cash，使己方正攻击间隔炮塔攻速提高 50%，持续 5 秒；效果结束后冷却 10 秒。持续和冷却按模拟时间计算，暂停与 PLANNING 冻结，游戏加速会加快计时。
- 天然机油在 AI 和人类挑战可用，仅 RUNNING 时可用；不可叠加。UI 使用简易色块图标。
- AI 榜按 AI 最佳成绩；人类榜按人类最佳成绩；总榜按昵称与模式各自最佳记录合并，波次降序、首次达成时间升序，最多 10 条。
- 总榜可让相同昵称分别以 AI 与人类标志出现；昵称大小写不敏感，同模式归并。AI Prompt 历史入口只用于 AI 成绩。
- 旧数据库与旧本地成绩没有模式时均视为 AI；`GET /api/leaderboard` 不带模式时仍返回 AI 榜。
- 成绩仍以服务端保存的 run / wave event 为准；run 创建时写入模式，后续波次不能更改模式。服务端不重演浏览器对局。
- 保留 AI 只通过 `GameActions` 影响战场、无真实 provider key 进入前端、用户名安全转义和 SQLite 参数化查询等现有不变量。
- 不引入运行时 npm 依赖；更新 `docs/PRODUCT_CONCEPT.md` 与 `AGENTS.md` 阶段例外；每个 PR 将版本 `0.1.21` 递增为 `0.1.22` 并同步 lockfile 与静态页脚占位。

---

### Task 1: 添加无 DOM 的波次路线计划

**Files:**
- Create: `src/agent/SpawnRoutes.ts`
- Create: `tests/agent/spawn-routes.test.js`
- Modify: `package.json` (`test:agent` invokes the new suite and drops the retired arbitrary-lane settings test).
- Modify: `tsconfig.test.json` (compile `SpawnRoutes.ts`).
- Delete: `tests/agent/spawn-settings.test.js` after its route-schedule coverage has been replaced.

**Interfaces:**
- Produces: `spawnCountForWave(wave: number): number`, `allSpawnPointsReachable(points: Array<{i: number; j: number}>, pathExists: (i: number, j: number) => boolean): boolean`, and `canPlaceTowerAt(i: number, j: number, points: Array<{i: number; j: number}>): boolean`.
- `spawnCountForWave` rejects non-positive or non-integer waves with `RangeError`; valid waves use the exact boundaries in Global Constraints.

- [x] **Step 1: Write the failing boundary and route predicate tests**

```js
const assert = require('assert');
const {spawnCountForWave, allSpawnPointsReachable, canPlaceTowerAt} = require('../../.test-build/agent/SpawnRoutes.js');

for (const [wave, count] of [[1, 1], [50, 1], [51, 2], [100, 2], [101, 3], [150, 3], [151, 4], [999, 4]]) {
    assert.strictEqual(spawnCountForWave(wave), count, `wave ${wave}`);
}
assert.throws(() => spawnCountForWave(0), RangeError);
assert.throws(() => spawnCountForWave(1.5), RangeError);
const points = [{i: 4, j: 26}, {i: 56, j: 4}, {i: 56, j: 26}, {i: 4, j: 4}];
const checked = [];
assert.strictEqual(allSpawnPointsReachable(points, (i, j) => { checked.push([i, j]); return true; }), true);
assert.deepStrictEqual(checked, points.map(({i, j}) => [i, j]));
assert.strictEqual(allSpawnPointsReachable(points, (i, j) => !(i === 56 && j === 26)), false);
assert.strictEqual(canPlaceTowerAt(4, 26, points), false);
assert.strictEqual(canPlaceTowerAt(20, 12, points), true);
```

In the same step, add `node tests/agent/spawn-routes.test.js` to `test:agent` and remove `node tests/agent/spawn-settings.test.js`; delete the old test file because its freely selectable lane behavior is retired and the new boundary suite replaces that coverage.

- [x] **Step 2: Run the test and verify it fails because the module is absent**

Run: `npm run test:agent`
Expected: compilation or module resolution fails for `SpawnRoutes.js`.

- [x] **Step 3: Implement the three pure route functions**

Implement the boundaries with ordered checks (`wave <= 50`, `<= 100`, `<= 150`, else 4), reachability as `points.every(point => pathExists(point.i, point.j))`, and `canPlaceTowerAt` as false exactly when a candidate's coordinates match a reserved spawn point. Throw `RangeError('INVALID_WAVE')` unless the wave is an integer >= 1. Add `SpawnRoutes.ts` to `tsconfig.test.json`.

- [x] **Step 4: Run the focused suite and verify the cases pass**

Run: `npm run test:agent`
Expected: all agent tests, including `spawn-routes.test.js`, pass.

- [x] **Step 5: Commit this independently testable route rule**

```powershell
git add src/agent/SpawnRoutes.ts tests/agent/spawn-routes.test.js
git add package.json tsconfig.test.json tests/agent/spawn-settings.test.js
git commit -m "Add wave-based spawn route schedule"
```

### Task 2: Keep all future spawn points reachable

**Files:**
- Modify: `src/Map.ts`
- Create: `tests/map-spawn-routes.test.js` using the existing test harness's CommonJS module stubs for `window`, `enemyManager`, and terrain randomness.
- Modify: `src/agent/InertBattlefield.ts` only if its map candidate enumeration bypasses `Map.canBePlaced()`.

**Interfaces:**
- Consumes: `allSpawnPointsReachable` from Task 1.
- `Map.canBePlaced(i, j)` remains the shared placement gate for human placement, AI actions, and terrain generation.
- `Map.setSpawnCount(count)` must return the requested count; a partial count is an invariant failure and must throw `Error('SPAWN_ROUTE_UNREACHABLE')` instead of silently starting fewer lanes.

- [x] **Step 1: Add a failing Map placement test for a future spawn point**

In `tests/map-spawn-routes.test.js`, stub imports so a fresh `Map` can be constructed with no DOM; assert it begins with one active base, `canBePlaced` returns false for each of `Map.SPAWN_POINTS`, and when the pathfinder reports no route from the fourth point it rejects an otherwise empty candidate cell. Assert a non-blocking ordinary cell remains placeable.

Add `node tests/map-spawn-routes.test.js` to the main `test` script in `package.json` in this step.

- [x] **Step 2: Run the new Map test and verify it fails before Map integration**

Run: `node tests/map-spawn-routes.test.js`
Expected: current `Map` starts with two lanes and allows inactive spawn cells as ordinary build cells, so the one-lane and reserved-cell assertions fail.

- [x] **Step 3: Make placement validate all four routes and make lane activation fail loudly**

Initialize `enemyBases` with only `SPAWN_POINTS[0]`. In `canBePlaced`, immediately reject when `canPlaceTowerAt(i, j, Map.SPAWN_POINTS)` is false; otherwise temporarily mark the candidate cell blocked, require `allSpawnPointsReachable(Map.SPAWN_POINTS, (i, j) => Boolean(this.pathFind(i, j)))` and retain `enemyManager.canAllReachBase()`, then restore the candidate cell. In `setSpawnCount`, clear a Rock occupying a newly enabled point, but if a non-empty cell prevents activation, throw `SPAWN_ROUTE_UNREACHABLE`; never return a lower lane count. Keep path-cache invalidation and the existing `added` event so active enemies recalculate paths.

- [x] **Step 4: Run the agent tests and verify the route predicate and existing path-shaping checks pass**

Run: `npm run test:agent`
Run: `node tests/map-spawn-routes.test.js`
Expected: all agent tests pass; map test proves all inactive and active spawn coordinates stay reserved and a blocked future route rejects placement.

- [x] **Step 5: Commit the map reachability invariant**

```powershell
git add src/Map.ts src/agent/InertBattlefield.ts tests/map-spawn-routes.test.js package.json
git commit -m "Reserve paths for future spawn routes"
```

### Task 3: Apply routes at wave boundaries and remove manual lane controls

**Files:**
- Modify: `src/WavesManager.ts`
- Modify: `src/Map.ts`
- Delete: `src/SpawnQueue.ts`
- Delete: `src/agent/SpawnSettings.ts`
- Delete: `src/QueryParamsManager.ts` (only after confirming `rg` finds no other imports)
- Modify: `src/PlayMode.ts`
- Modify: `src/InterfaceManager.ts`
- Modify: `src/i18n.ts`
- Modify: `index.html`
- Modify: `src/styles/styles.less`
- Modify: `tests/agent/play-mode.test.js`
- Modify: `tests/leaderboard-live.test.js` if it asserts old spawn-queue integration.

**Interfaces:**
- Consumes: `spawnCountForWave` and the strict `Map.setSpawnCount` from Tasks 1–2.
- Wave start sequence: `map.setSpawnCount(spawnCountForWave(this.waveCounter))`, then `gameLoop.holdForPlanning(...)`, then generate/spawn the wave.
- `modeUrl(url, mode)` removes legacy `spawners` before writing `mode`, so the old query can no longer affect a run or survive mode switching.

- [x] **Step 1: Update tests for deterministic wave transitions and ignored legacy query strings**

In `tests/agent/play-mode.test.js`, change the `modeUrl` case that starts with `?mode=ai&spawners=3` to assert that the returned URL has `mode=human` and `searchParams.has('spawners') === false`. Add a WaveManager boundary test with a fake map and planner that records calls; for wave 51 assert route count 2 is applied before planner invocation.

- [x] **Step 2: Run `npm run test:agent` and verify the old URL behavior or missing boundary hook fails the new assertions**

Expected: at least the `spawners` query assertion fails before implementation.

- [x] **Step 3: Wire route schedule before planning and remove manual selection surfaces**

Replace `applyPendingSpawnCount()` in `WavesManager.start()` with `map.setSpawnCount(spawnCountForWave(this.waveCounter))`. Remove spawner event wiring/rendering from `InterfaceManager`, the Settings row and status element from `index.html`, and `.spawner` styling plus obsolete translations. Remove SpawnQueue/SpawnSettings imports and modules when unused. Remove `Map`'s `QueryParamsManager` dependency and start at one active route. Make `modeUrl` delete `spawners` as described.

- [x] **Step 4: Run agent and existing leaderboard integration tests**

Run: `npm run test:agent`
Run: `node tests/leaderboard-store.test.js`
Expected: route boundary, mode-switch URL, leaderboard live-wave tests pass; no manual spawner UI references remain (`rg -n "spawner[1-4]|spawner-status|requestSpawnCount|applyPendingSpawnCount|getDifficulty" src index.html`).

- [x] **Step 5: Commit the fixed route progression UI and engine behavior**

```powershell
git add src/WavesManager.ts src/Map.ts src/SpawnQueue.ts src/agent/SpawnSettings.ts src/QueryParamsManager.ts src/PlayMode.ts src/InterfaceManager.ts src/i18n.ts index.html src/styles/styles.less tests/agent/play-mode.test.js tests/leaderboard-live.test.js
git add tsconfig.test.json
git commit -m "Progress spawn routes automatically by wave"
```

### Task 4: Add the DOM-free Natural Oil state machine

**Files:**
- Create: `src/items/NaturalOil.ts`
- Create: `tests/agent/natural-oil.test.js`
- Modify: `package.json` (`test:agent` invokes the new item suite).
- Modify: `tsconfig.test.json` (compile `NaturalOil.ts`).

**Interfaces:**
- Produces `NaturalOilController`, `NaturalOilState`, `OilActivationResult`, and singleton `naturalOilController`.
- `activate(isRunning: boolean, cash: CashPort): OilActivationResult`, where `CashPort` has `canWithdraw(amount: number): boolean` and `withdraw(amount: number): boolean`.
- `update(deltaMs: number, isRunning: boolean): void`; inactive simulation (`isRunning === false`) leaves all timers unchanged.
- `attackSpeedMultiplier` is `1.5` only during `active`, otherwise `1`.
- State is `{kind:'ready'} | {kind:'active'; remainingMs:number} | {kind:'cooldown'; remainingMs:number}`. Failures are `NOT_RUNNING`, `ALREADY_ACTIVE`, `COOLDOWN`, or `INSUFFICIENT_FUNDS`.

- [x] **Step 1: Write failing DOM-free activation and timer tests**

```js
const assert = require('assert');
const {NaturalOilController} = require('../../.test-build/items/NaturalOil.js');
function cash(balance) {
    return {balance, canWithdraw(n) { return this.balance >= n; }, withdraw(n) {
        if (!this.canWithdraw(n)) return false;
        this.balance -= n;
        return true;
    }};
}
const oil = new NaturalOilController();
const wallet = cash(4000);
assert.deepStrictEqual(oil.activate(false, wallet), {ok: false, reason: 'NOT_RUNNING'});
assert.deepStrictEqual(oil.activate(true, cash(1999)), {ok: false, reason: 'INSUFFICIENT_FUNDS'});
assert.deepStrictEqual(oil.activate(true, wallet), {ok: true});
assert.strictEqual(wallet.balance, 2000);
assert.strictEqual(oil.attackSpeedMultiplier, 1.5);
assert.deepStrictEqual(oil.activate(true, wallet), {ok: false, reason: 'ALREADY_ACTIVE'});
oil.update(4999, false);
assert.strictEqual(oil.state.kind, 'active');
oil.update(4999, true);
assert.strictEqual(oil.state.kind, 'active');
oil.update(1, true);
assert.deepStrictEqual(oil.state, {kind: 'cooldown', remainingMs: 10000});
assert.strictEqual(oil.attackSpeedMultiplier, 1);
oil.update(9999, true);
assert.strictEqual(oil.state.kind, 'cooldown');
oil.update(1, true);
assert.strictEqual(oil.state.kind, 'ready');
assert.deepStrictEqual(oil.activate(true, wallet), {ok: true}, 'the item can be reused after cooldown');
assert.strictEqual(wallet.balance, 0);
```

In the same step, add `node tests/agent/natural-oil.test.js` to `test:agent` before running the red test.

- [x] **Step 2: Run `npm run test:agent` and verify failure because the module is absent**

- [x] **Step 3: Implement constants, structured results, state transitions, and cash port**

Set `NATURAL_OIL_COST = 2000`, `NATURAL_OIL_ACTIVE_MS = 5000`, `NATURAL_OIL_COOLDOWN_MS = 10000`; only charge after confirming RUNNING, ready state, and sufficient funds. Active duration must finish before cooldown starts. A single update larger than a phase's remaining time must carry its excess into the next phase without extending total elapsed time. Add `NaturalOil.ts` to `tsconfig.test.json`.

- [x] **Step 4: Run agent tests and verify active/cooldown timers and failed activations**

Run: `npm run test:agent`
Expected: all existing agent tests and the new Natural Oil tests pass without `document` or `window`.

- [x] **Step 5: Commit the isolated item rules**

```powershell
git add src/items/NaturalOil.ts tests/agent/natural-oil.test.js package.json tsconfig.test.json
git commit -m "Add Natural Oil activation state machine"
```

### Task 5: Apply the oil multiplier to tower attack intervals

**Files:**
- Modify: `src/items/NaturalOil.ts`
- Modify: `src/entities/towers/Tower.ts`
- Modify: `tests/agent/natural-oil.test.js`

**Interfaces:**
- `Tower.update()` reads the exported `attackSpeedMultiplier` provider from `naturalOilController` and advances `countdown` by `frameDuration * multiplier`.
- Only towers with `reloadDurationMs > 0` receive the effect; damage, aim, and SlowTower's zero interval are unchanged.

- [x] **Step 1: Add a regression assertion for actual scaled attack-clock progress**

Export `attackClockDelta(frameDurationMs: number, reloadDurationMs: number, multiplier: number): number` from `NaturalOil.ts`; extend the DOM-free suite with `assert.strictEqual(attackClockDelta(16, 200, 1.5), 24)` and `assert.strictEqual(attackClockDelta(16, 200, 1), 16)`. `Tower.update()` must call this helper; SlowTower remains unchanged because it does not call `super.update()`.

- [x] **Step 2: Run `npm run test:agent` and verify the attack-clock helper is missing**

- [x] **Step 3: Implement the attack-clock helper and consume it in Tower.update**

Keep damage and tower upgrade logic unchanged. The buff changes elapsed firing interval only; do not mutate each tower's `reloadDurationMs`, so new towers and upgrades use the same active multiplier.

- [x] **Step 4: Run agent tests and verify the active multiplier contract**

Run: `npm run test:agent`
Expected: active/cooldown transitions and multiplier tests pass; `npx tsc --noEmit` reports no import-cycle or type errors.

- [x] **Step 5: Commit attack speed integration**

```powershell
git add src/items/NaturalOil.ts src/entities/towers/Tower.ts tests/agent/natural-oil.test.js
git commit -m "Apply Natural Oil attack speed to towers"
```

### Task 6: Add the clickable Natural Oil item UI in both modes

**Files:**
- Modify: `index.html`
- Modify: `src/InterfaceManager.ts`
- Modify: `src/Game.ts`
- Modify: `src/CashManager.ts`
- Modify: `src/i18n.ts`
- Modify: `src/styles/styles.less`
- Modify: `package.json` (`test` invokes the new item UI test).
- Create or modify: `tests/natural-oil-ui.test.js`

**Interfaces:**
- `CashManager.withdraw(amount): boolean` returns false without changing balance, and true after a successful withdrawal.
- `Game.updateLoop()` calls `naturalOilController.update(1000 / fps, gameLoop.state === 'running')` once per simulation step, inside the existing speed loop.
- `InterfaceManager` binds `#natural-oil` click to `naturalOilController.activate(gameLoop.state === 'running', cashManager)` and renders its state, remaining seconds, price, and failure reason as text.

- [x] **Step 1: Write a failing UI harness assertion for item visibility, price, and disabled states**

In `tests/natural-oil-ui.test.js`, use the existing UI test DOM harness to assert `#natural-oil` exists below `#towers-wrapper`, contains the visible label `天然机油` and `2000`, and becomes disabled during active and cooldown states. Also assert click before RUNNING leaves cash and multiplier unchanged.

Also assert `update(16, false)` leaves both phases unchanged and the same real-time frame advances 16 ms at x1 versus 64 ms at x4. Add `node tests/natural-oil-ui.test.js` and `node tests/map-spawn-routes.test.js` to the main `test` script.

- [x] **Step 2: Run `node tests/natural-oil-ui.test.js` and verify it fails because the element is absent**

- [x] **Step 3: Add the color-block button and connect simulation, wallet, and accessible status text**

Place a small colored square inside the button under the tower palette; use a `span`/CSS color block rather than adding an image. Keep the text label and `aria-live` state outside the decorative block. Advance controller time only inside Game's running simulation steps, so pause and PLANNING do not count and x2/x4/x8 do.

- [x] **Step 4: Run UI and agent suites and inspect both play-mode layouts in a browser**

Run: `node tests/natural-oil-ui.test.js`
Run: `npm run test:agent`
Expected: both AI and human mode show the item; the click succeeds only during RUNNING, charges exactly 2000 once, and reports active / cooldown state. Browser inspection confirms the icon is below the tower choices and does not cover the canvas.

- [x] **Step 5: Commit the Natural Oil UI and game wiring**

```powershell
git add index.html src/InterfaceManager.ts src/Game.ts src/CashManager.ts src/i18n.ts src/styles/styles.less tests/natural-oil-ui.test.js
git add package.json
git commit -m "Add clickable Natural Oil game item"
```

### Task 7: Add persistent AI / human mode to server runs and migrations

**Files:**
- Modify: `server/src/store.ts`
- Modify: `server/tests/store.test.ts`
- Modify: `server/tests/prompt-store.test.ts`

**Interfaces:**
- Produces `export type PlayMode = 'ai' | 'human'` and `export type LeaderboardMode = PlayMode | 'total'`.
- `createRun(id: string, username: string, now: number, mode: PlayMode = 'ai'): void` validates and persists the mode.
- `RunRecord` includes `mode: PlayMode`; `LeaderboardEntry` includes `mode: PlayMode`.
- `top(limit: number, mode: LeaderboardMode = 'ai'): LeaderboardEntry[]`; `rankOf(username: string, mode: LeaderboardMode = 'ai'): number | null`; `bestWaveOf(username: string, mode: PlayMode = 'ai'): number | null`.
- `recordWave` uses the run's persisted mode when calculating `bestWave`; it accepts no caller-supplied mode.

- [x] **Step 1: Add failing store tests for migration defaults, mode split, total merge, and mode-specific prompts**

Add tests that construct a legacy `runs` table without a `mode` column, call `migrate()`, and assert old rows read as AI. Create Alice's AI run at wave 12 and human run at wave 16; assert `top(10,'ai')` gives AI/12, `top(10,'human')` gives human/16, and total contains both rows with distinct modes. Add two users tied at one wave with different timestamps and assert earlier time sorts first. Add ten-plus unique mode records and assert `top(10,'total')` returns exactly ten. Assert an AI prompt-history query never selects a human run.

- [x] **Step 2: Run `npm run test:server` and verify migration or mode-aware methods fail**

- [x] **Step 3: Migrate mode with default AI and implement parameterized mode-aware aggregation**

Add `mode TEXT NOT NULL DEFAULT 'ai'` to new tables and an `ALTER TABLE runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'ai'` migration when absent. Extend `getRun` and run creation. Keep SQL values parameterized. Group AI/human by `lower(username)` within a mode; total groups by `(lower(username), mode)` so the same nickname may occupy two rows. Use maximum wave, earliest event time at that maximum, then display name for deterministic ties. Filter Prompt history to AI runs only.

- [x] **Step 4: Run server tests and verify all old AI rules still pass**

Run: `npm run test:server`
Expected: migration remains idempotent, legacy tests default to AI, and leaderboard/prompt tests pass.

- [x] **Step 5: Commit mode-aware server storage**

```powershell
git add server/src/store.ts server/tests/store.test.ts server/tests/prompt-store.test.ts
git commit -m "Store leaderboard mode on each run"
```

### Task 8: Validate mode at the HTTP boundary and expose three boards

**Files:**
- Modify: `server/src/http.ts`
- Modify: `server/tests/api.test.ts`
- Modify: `server/src/validate.ts` only if a shared strict mode parser is appropriate.

**Interfaces:**
- `POST /api/runs` accepts `{mode:'ai'|'human'}`; a missing field defaults to `ai`; any other value returns `400 {error:'INVALID_MODE'}`.
- `GET /api/leaderboard?mode=ai|human|total&limit=N` selects the requested board. Missing `mode` means `ai`; invalid mode returns `400 {error:'INVALID_MODE'}`.
- Each entry includes `mode`; `me` includes `{username, rank, wave, mode}`. In total mode, `me` is the viewer's higher-ranked record among their AI and human results.

- [x] **Step 1: Add failing API tests for run mode validation and board selection**

Update `openRun(deps, username, mode = 'ai')` to send JSON `{mode}`. Assert omitted mode stays AI, human mode appears only in the human query, total returns both mode rows, and `POST /api/runs` plus `GET /api/leaderboard` reject `mode:'robot'` with status 400 and `INVALID_MODE`.

- [x] **Step 2: Run `npm run test:server` and verify the mode validation assertions fail**

- [x] **Step 3: Implement strict HTTP mode parsing and mode-aware response shaping**

Pass validated mode to `createRun`; never accept mode from wave events. Keep the no-parameter GET response byte-semantically equivalent for existing AI clients except for the added `mode:'ai'` entry metadata. Compute total `me` from both mode ranks, choosing the better rank and carrying that entry's wave and mode.

- [x] **Step 4: Run server tests and verify default AI compatibility**

Run: `npm run test:server`
Expected: all API success and rejection paths pass; old requests without a mode still create and query AI records.

- [x] **Step 5: Commit the API mode contract**

```powershell
git add server/src/http.ts server/src/validate.ts server/tests/api.test.ts
git commit -m "Expose mode-specific leaderboard endpoints"
```

### Task 9: Carry mode through client sessions, run sync, and offline records

**Files:**
- Modify: `src/leaderboard/LeaderboardClient.ts`
- Modify: `src/leaderboard/RunSync.ts`
- Modify: `src/leaderboard/LeaderboardStore.ts`
- Modify: `tests/leaderboard-client.test.js`
- Modify: `tests/leaderboard-sync.test.js`
- Modify: `tests/leaderboard-store.test.js`

**Interfaces:**
- Client exports the same `PlayMode` and `LeaderboardMode` string unions (import shared source type if the current build permits it).
- `ensureRunResult(username, mode: PlayMode = 'ai')`, `ensureRun(username, mode: PlayMode = 'ai')`, `RunSync.prepareRun(username, mode)`, `enqueueWave(username, wave, mode)`, and `fetchSharedLeaderboard(username, mode: LeaderboardMode = 'ai', limit = 10)`.
- `RemoteEntry.mode` is `'ai' | 'human'`; local `LeaderboardEntry.mode` is also `'ai' | 'human'`; missing stored mode decodes as `'ai'`.
- Local `entriesForBoard(entries: LeaderboardEntry[], mode: LeaderboardMode): LeaderboardEntry[]` filters AI/human views or returns the mode-aware union for total; `dedupeByUser` keys by lowercase username plus play mode.
- `SessionState` remembers the mode for its run; `ensureRunResult` only reuses a run when both username and mode match. Prompt writes explicitly request the AI run.

- [x] **Step 1: Add failing client/sync/storage tests for fixed run mode and legacy local data**

Assert mocked run-creation requests send `mode:'human'` when requested; wave sync for that run does not send a mode override. Assert `RunSync` keeps separate run promises for AI and human under the same nickname. Load a stored legacy entry without `mode` and assert it becomes AI; submit same-name AI and human entries and assert both remain in mode-aware storage and `entriesForBoard(entries,'total')` returns both.

- [x] **Step 2: Run the focused leaderboard client, sync, and store tests and verify they fail**

Run: `node tests/leaderboard-client.test.js`
Run: `node tests/leaderboard-sync.test.js`
Run: `node tests/leaderboard-store.test.js`

- [x] **Step 3: Persist mode when opening a run and make local aggregation mode-aware**

Send mode only on `POST /api/runs`; let server run state own the mode thereafter. Key RunSync's in-flight run by lowercase username plus mode, and carry mode on queued waves. Track the run mode in `SessionState`, create a new server run instead of reusing an ID if the requested mode differs, and force prompt writes to the AI run. Decode legacy entries as AI; deduplicate by lowercase username plus mode; implement `entriesForBoard` for AI, human, and total; preserve wave-descending / earlier-time ordering.

- [x] **Step 4: Run focused tests and check client/server types**

Run: `node tests/leaderboard-client.test.js`
Run: `node tests/leaderboard-sync.test.js`
Run: `node tests/leaderboard-store.test.js`
Run: `npx tsc --noEmit`
Expected: AI default and legacy local migration tests pass; no mode can be changed on a wave event.

- [x] **Step 5: Commit mode-aware client synchronization and fallback**

```powershell
git add src/leaderboard/LeaderboardClient.ts src/leaderboard/RunSync.ts src/leaderboard/LeaderboardStore.ts tests/leaderboard-client.test.js tests/leaderboard-sync.test.js tests/leaderboard-store.test.js
git commit -m "Sync AI and human leaderboard runs separately"
```

### Task 10: Gate human challenge with a nickname and record human runs

**Files:**
- Modify: `src/main.ts`
- Modify: `src/Game.ts`
- Modify: `src/StrategyQueue.ts`
- Modify: `src/leaderboard/LeaderboardUI.ts`
- Modify: `tests/human-mode.test.js`
- Modify: `tests/leaderboard-live.test.js`

**Interfaces:**
- `UsernameGate` is shown in both modes. After valid nickname confirmation, establish session; AI waits for its normal strategy Start action, while human calls the exported `startHumanRun(username)` once.
- `startHumanRun(username: string): void` prepares a human run, starts `gameLoop`, and starts `waveManager`; it has no AI strategy dependency.
- `Game.recordReachedWave(wave)` calls `submitRunScore(username, wave, playMode)`; game-over final sync and rank lookup use the same mode.
- `submitRunScore(username, wave, mode: PlayMode = 'ai')` writes a local best under the same mode key and enqueues the server wave with that mode through Task 9's `RunSync.enqueueWave` API.
- AI `startRun()` continues to prepare an AI run only after the opening prompt is valid.

- [x] **Step 1: Add failing human-mode tests for nickname gate, delayed start, and recorded waves**

Assert human mode does not start waves before `UsernameGate` completes; valid confirmation creates a human run and then starts the loop; human `onWaveReached` and game-over submit wave sync with `mode:'human'`. Assert AI still does not start until a strategy is activated and still creates an AI run.

- [x] **Step 2: Run `node tests/human-mode.test.js` and `node tests/leaderboard-live.test.js` and verify the current human auto-start/no-record behavior fails**

- [x] **Step 3: Move human startup behind nickname confirmation and submit both modes**

Remove the module-load human auto-start from `Game.ts`; export the one-time human start function. Update the gate callback to call it for human mode and leave AI in IDLE. Remove the AI-only guards around reached-wave submission and game-over rank fetch, passing the immutable page mode to RunSync and leaderboard fetch. Leave prompt history writes exclusive to AI.

- [x] **Step 4: Run human and live leaderboard suites**

Run: `node tests/human-mode.test.js`
Run: `node tests/leaderboard-live.test.js`
Expected: human run begins only after nickname confirmation and its wave events are stored as human; AI behavior remains unchanged.

- [x] **Step 5: Commit human leaderboard participation**

```powershell
git add src/main.ts src/Game.ts src/StrategyQueue.ts src/leaderboard/LeaderboardUI.ts tests/human-mode.test.js tests/leaderboard-live.test.js
git commit -m "Record human challenge runs on the leaderboard"
```

### Task 11: Add leaderboard cycling, mode flags, and local / remote rendering

**Files:**
- Modify: `src/leaderboard/LeaderboardUI.ts`
- Modify: `src/leaderboard/LeaderboardClient.ts`
- Modify: `src/leaderboard/LeaderboardStore.ts`
- Modify: `index.html`
- Modify: `src/i18n.ts`
- Modify: `src/styles/styles.less`
- Modify: `tests/leaderboard-ui.test.js`
- Modify: `tests/leaderboard-store.test.js`

**Interfaces:**
- `leaderboardPanel.refresh(mode?: LeaderboardMode)` queries the current board mode and renders entries using `textContent` / existing safe text helpers.
- Starting board follows `playMode`: AI cycle `ai -> human -> total -> ai`; human cycle `human -> ai -> total -> human`.
- Every entry visibly carries an AI or human flag; AI entries retain the Prompt history action; human entries do not.
- Each view shows the viewer's rank for that view; total view shows the higher-ranked of the viewer's two mode records with its flag.

- [x] **Step 1: Add failing DOM tests for initial board, full cycle, flags, and Prompt history actions**

With the existing fake DOM harness, instantiate an AI panel and assert initial mode AI, then click the one board-toggle button three times and expect human, total, AI. Instantiate in human mode and expect human, AI, total, human. Render same-name AI and human rows and assert two rows and two different flags; assert only the AI row contains Prompt history. Assert user-provided names are rendered as text and never assigned to `innerHTML`.

- [x] **Step 2: Run `node tests/leaderboard-ui.test.js` and verify new mode/cycle assertions fail**

- [x] **Step 3: Add one toggle button and mode-aware remote/local rendering**

Initialize the visible mode from immutable `playMode`, maintain the required cycle order, fetch the selected server board with the token, and use mode-aware local fallback if unavailable. Render mode flags and board labels through text nodes. Preserve existing safe username and Prompt dialog behavior, hiding the dialog control for human rows.

- [x] **Step 4: Run leaderboard UI, history, client, and storage suites**

Run: `node tests/leaderboard-ui.test.js`
Run: `node tests/leaderboard-history.test.js`
Run: `node tests/leaderboard-client.test.js`
Run: `node tests/leaderboard-store.test.js`
Expected: both cycles, both mode flags, top ten, current rank and AI-only Prompt history pass.

- [x] **Step 5: Commit board switching and safe mode-aware rendering**

```powershell
git add src/leaderboard/LeaderboardUI.ts src/leaderboard/LeaderboardClient.ts src/leaderboard/LeaderboardStore.ts index.html src/i18n.ts src/styles/styles.less tests/leaderboard-ui.test.js tests/leaderboard-store.test.js
git commit -m "Add human and combined leaderboard views"
```

### Task 12: Update product rules and stage exception

**Files:**
- Modify: `docs/PRODUCT_CONCEPT.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-09-23-wave-lanes-oil-mode-leaderboards-design.md`

- [x] **Step 1: Locate the conflicting human-score and unresolved leaderboard statements**

Run: `rg -n "人类模式|排行榜后端|未决问题|spawner|天然机油|路线" docs/PRODUCT_CONCEPT.md AGENTS.md docs/superpowers/specs/2026-09-23-wave-lanes-oil-mode-leaderboards-design.md`
Expected: the current product text excludes human scores and the current stage exception permits only leaderboard backend work.

- [x] **Step 2: Record the implementation status and exact exception scope**

Update §9 with per-mode best records, combined ordering, flags, nickname-gated human run, and run-fixed mode; add the exact lane schedule and oil timings to the appropriate gameplay section. Remove only unresolved items settled by this spec. In `AGENTS.md`, expand the stage exception to the fixed route schedule, Natural Oil, and mode leaderboards under this design, while keeping every other #6 restriction unchanged. Set the already-confirmed spec status to implementation in progress.

- [x] **Step 3: Review both docs against the approved spec and all remaining unresolved questions**

Run: `git diff --check`
Expected: no whitespace errors; unresolved questions unrelated to this design remain unresolved.

- [x] **Step 4: Commit confirmed product and scope decisions**

```powershell
git add docs/PRODUCT_CONCEPT.md AGENTS.md docs/superpowers/specs/2026-09-23-wave-lanes-oil-mode-leaderboards-design.md
git commit -m "Record route, item, and leaderboard rules"
```

### Task 13: Update version and complete integration verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html` static `#version` placeholder

- [x] **Step 1: Add and run focused behavior tests before full integration**

Run: `npm run test:agent`
Run: `npm run test:server`
Run: `npm run test`
Expected: all focused and full suites pass; if `npm run lint` is absent, report it as unavailable rather than passing.

- [x] **Step 2: Increment only the patch version and synchronize all occurrences**

Change `0.1.21` to `0.1.22` in `package.json`, both root `version` occurrences in `package-lock.json`, and the static `#version` text in `index.html`. Do not alter dependency versions.

- [x] **Step 3: Run the required repository checks**

Run: `npm ci`
Run: `npm run lint`
Run: `npx tsc --noEmit`
Run: `npm run test`
Run: `npm run test:server`
Run: `git diff --check`
Expected: report exact output for every command; if a script is missing or an environment blocks it, state that explicitly.

- [x] **Step 4: Verify browser behavior and inspect the final diff**

Run the local app and inspect: wave 1 begins with one route; transitions before waves 51, 101, and 151 show 2, 3, and 4 routes; all future spawn points remain reachable after terrain and tower placement; oil costs 2000, speeds towers for five simulated seconds, then cools down for ten; board toggle follows both required cycles; human and AI rows carry correct flags; AI-only Prompt history remains available; human game waits for nickname. Inspect `git diff --stat`, staged file list, `git diff --check`, and search changed files for secrets and generated artifacts.

- [x] **Step 5: Commit the version and any final focused fixes, then push and open a Ready for review PR**

Stage explicit task paths only, confirm `git diff --cached --name-only` contains no unrelated paths, commit with an imperative behavior summary, push `agent/feat-lanes-oil-mode-leaderboards` to `origin`, open a Ready for review PR against the detected default branch, and track required CI to completion. Do not merge, approve, deploy, or delete the worktree.

## Self-review

- Spec coverage: Tasks 1–3 cover route boundaries, future-path safety, enemy path refresh, manual-control removal, and legacy query handling. Tasks 4–6 cover price, both-mode use, RUNNING gate, simulation-time duration/cooldown, attack-speed effect, non-stacking, and UI. Tasks 7–11 cover database migration, fixed run mode, AI/human/total top ten and rank, local legacy records, nickname-gated human starts, board cycles, labels, and AI-only Prompt history. Task 12 updates product truth and the #6 exception; Task 13 covers versioning, verification, browser review, and PR delivery.
- Placeholder scan: no unresolved markers or unspecified implementation steps remain. Each test-first task includes a concrete failing assertion and command; each implementation step names exact behavior and file boundary.
- Type consistency: server `PlayMode`/`LeaderboardMode`, `RunRecord.mode`, `LeaderboardEntry.mode`, client `RemoteEntry.mode`, local `LeaderboardEntry.mode`, and run-sync signatures use the same `ai | human` / `ai | human | total` values; server run mode is fixed at creation and never supplied to wave sync.
