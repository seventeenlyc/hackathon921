# Human Mode, Deployable Towers, and Random Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the reference site's deployable tower palette, restartable AI/human play-mode switch, and random strategy examples to the immersive battlefield UI without allowing AI or human input to bypass engine validation.

**Architecture:** Reuse the upstream `PlayMode` and `StrategyLibrary` seams, then scope the original placement controller to human mode. Human placement will invoke the existing `GameActions.buildTower()` action port and use structured failures for feedback; AI mode will keep its existing planner and prompt-only controls. The battlefield remains deterministic and the mode switch reloads a fresh run through a URL parameter.

**Tech Stack:** TypeScript, Vite, HTML5 Canvas, Less, Node assertion tests, GitHub PR #37.

**Spec:** `docs/UI_REFACTOR_DESIGN.md` plus the approved interaction design in the user thread and the upstream `docs/PRODUCT_CONCEPT.md` §§5–6.

## Global Constraints

- Keep AI actions behind `src/agent/GameActions.ts`; do not put model calls in the frame loop.
- Human mode restarts the run and is selected by `?mode=human`; AI is the default mode.
- Random strategy fills the prompt only; it does not call the model until the existing Apply/Start action.
- Human-mode runs do not submit leaderboard scores; AI-mode scores retain the existing server-validated path.
- Preserve the existing immersive overlay, accessibility, untrusted-input rendering, GPL-3.0 attribution, and responsive layout.
- Increment the frontend version from `0.1.8` to `0.1.9` and keep `package-lock.json` and the static footer synchronized.

---

### Task 1: Lock mode and strategy behavior with DOM-free tests

**Files:**
- Modify: `tests/agent/play-mode.test.js`
- Modify: `tests/agent/strategy-library.test.js`
- Modify: `tests/agent/game-actions.test.js`
- Create: `tests/human-mode.test.js`
- Test compile: `tsconfig.test.json`

**Interfaces:**
- Consumes: `readPlayMode`, `modeUrl`, `randomStrategy`, and `GameActions.buildTower`.
- Produces: regression coverage for query/storage precedence, strategy selection, structured placement failures, and the UI's mode/random/tower mounts.

- [ ] **Step 1: Write the failing tests**

  Assert that `mode=human` wins over storage, a generated strategy is one of the shipped examples, human placement rejects occupied/path-blocking/insufficient-funds cells through `GameActions`, and `index.html` contains `mode`, `strategy-random`, `towers-wrapper`, and `towers-stats` while `StrategyPanel.ts` calls `randomStrategy()`.

- [ ] **Step 2: Run the focused tests to verify the new assertions fail**

  Run: `npm run test:agent` and `node tests/human-mode.test.js`

  Expected: the new UI and human placement assertions fail before their production wiring exists.

- [ ] **Step 3: Keep the tests focused on observable behavior**

  Use the existing injected fake battlefield for action failures and source-level DOM assertions only for static mounts/input boundaries; do not weaken existing tests or assert private implementation details.

- [ ] **Step 4: Re-run the focused tests after implementation tasks**

  Run: `npm run test:agent && node tests/human-mode.test.js`

  Expected: all mode, strategy, action, and UI boundary tests pass.

### Task 2: Wire the reference play modes into the current game loop

**Files:**
- Modify: `src/Game.ts`
- Modify: `src/WavesManager.ts`
- Modify: `src/StrategyQueue.ts`
- Modify: `src/InterfaceManager.ts`
- Modify: `src/main.ts`
- Use: `src/PlayMode.ts`

**Interfaces:**
- Consumes: `playMode`, `switchPlayMode`, `humanPlanner`, `startRun`, and the existing `GameActions`/leaderboard seams.
- Produces: a fresh AI or human run with exactly one controller, AI planning disabled in human mode, and mode-aware UI visibility/button labels.

- [ ] **Step 1: Verify the failing mode integration assertions**

  Confirm the focused tests fail for missing mode class/button behavior and that human-mode source assertions cannot yet find the no-AI planner branch.

- [ ] **Step 2: Implement the minimal mode wiring**

  Apply `mode-ai`/`mode-human` to `#inert`, configure `waveManager` with `AgentRuntime` only in AI mode and `humanPlanner` plus the seven-second inter-wave countdown in human mode, start human runs automatically, and keep AI runs behind the prompt Start action.

- [ ] **Step 3: Keep the mode switch restart-only**

  Set the button label/title from `otherMode(playMode)` and call `switchPlayMode(target)` so the existing URL/localStorage precedence controls the next fresh run.

- [ ] **Step 4: Run focused integration checks**

  Run: `npx tsc --noEmit && npm run test:agent && node tests/human-mode.test.js`

  Expected: type checking and mode behavior pass without changing deterministic engine ownership.

### Task 3: Restore human placement through the validated action port

**Files:**
- Modify: `src/TowerPlacer.ts`
- Modify: `src/Controls.ts`
- Modify: `src/Game.ts`
- Modify: `src/InterfaceManager.ts`
- Modify: `src/agent/GameActions.ts`
- Modify: `tests/agent/game-actions.test.js`
- Modify: `tests/control-layer.test.js`

**Interfaces:**
- Consumes: Canvas-local click/mouse coordinates, `TOWER_CATALOG`, and `GameActions.buildTower`.
- Produces: human-only hover preview, Esc cancellation, click-to-place, and structured snackbar feedback with no placement listener active in AI mode.

- [ ] **Step 1: Add a failing action-port test**

  Assert that the human placement seam delegates a legal build and surfaces `CELL_OCCUPIED`, `BLOCKS_PATH`, and `INSUFFICIENT_FUNDS` without mutating the fake battlefield on failure.

- [ ] **Step 2: Add Canvas click semantics without global click forwarding**

  Emit `click` only from the Canvas input boundary after a non-drag pointer release; keep editable targets ignored and preserve camera drag behavior.

- [ ] **Step 3: Route human placement through `GameActions`**

  Keep the ghost tower and red invalid-cell preview in `TowerPlacer`, but execute placement with `actions.buildTower(type, i, j)` and stop placement after a successful build. Use the returned `message` for user feedback and do not write cash/map state directly from the controller.

- [ ] **Step 4: Instantiate the controller only for human mode and render only while active**

  Pass the shared `GameActions` instance into the human controller, update/draw it from the game only in human mode, and leave AI mode without map-placement side effects.

- [ ] **Step 5: Run the focused input/action tests**

  Run: `node tests/control-layer.test.js && npx tsc --noEmit && npm run test:agent`

  Expected: input boundary, action validation, path protection, and all agent tests pass.

### Task 4: Add the palette, random strategy controls, and responsive styling

**Files:**
- Modify: `index.html`
- Modify: `src/InterfaceManager.ts`
- Modify: `src/StrategyPanel.ts`
- Modify: `src/styles/styles.less`
- Use: `src/agent/StrategyLibrary.ts`
- Modify: `tests/leaderboard-ui.test.js`
- Modify: `tests/human-mode.test.js`

**Interfaces:**
- Consumes: tower constructors/metadata, `randomStrategy()`, and the mode class on `#inert`.
- Produces: accessible `RANDOM STRATEGY`, mode switch, deployable-tower cards, stats panel, active/disabled states, and mobile-safe overlay layout.

- [ ] **Step 1: Add a failing UI assertion for the three new controls**

  Assert that the HTML contains the exact reference controls and that the strategy panel binds both random and apply buttons without using unsafe HTML for player/model text.

- [ ] **Step 2: Implement the random strategy interaction**

  Bind the button to `randomStrategy()`, fill the textarea, clear warning state, and re-render; keep network/model execution behind the existing Apply/Start handler.

- [ ] **Step 3: Render five tower cards and safe stats**

  Use the existing tower catalog/constructors and texture manager to render previews. Render name, description, cost, aim radius, damage/reload/DPS through text nodes or trusted static metadata; cards call `towerPlacer.place()` only in human mode.

- [ ] **Step 4: Style and scope the new panels**

  Extend the current overlay with the mode button, random strategy action, tower disclosure, selected/invalid states, and `mode-human`/`mode-ai` visibility rules while preserving reduced-motion and narrow-screen behavior.

- [ ] **Step 5: Run focused UI/build checks**

  Run: `node tests/leaderboard-ui.test.js && node tests/human-mode.test.js && npm run build`

  Expected: the production bundle builds and all new mounts/interactions are present.

### Task 5: Validate the complete browser flow and deliver the PR

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`
- Modify: `src/styles/styles.less`
- Modify: tests changed by Tasks 1–4

- [ ] **Step 1: Run the complete required checks**

  Run: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, and `git diff --check`.

  Expected: all available checks pass; if `lint` is absent, report the exact missing-script result.

- [ ] **Step 2: Exercise the browser flows**

  Verify AI mode random strategy fill/Start, control hide/reopen, switch to human mode, tower palette visibility, legal and rejected placement, Esc cancellation, switch back to AI, and that no AI proxy request is made in human mode.

- [ ] **Step 3: Review the final diff and version**

  Confirm only the approved feature files are staged, `0.1.9` appears in package metadata and the static footer, no secrets/generated artifacts are included, and the user-provided untracked `docs/UI_REFACTOR_DESIGN.md` remains untouched.

- [ ] **Step 4: Commit, push, and update PR #37**

  Use explicit file paths, push `agent/refactor-ui` to `origin`, update the existing upstream PR body with Summary, Validation, Risk / Safety Boundaries, and Known Limitations, then verify the remote head and CI status without merging.
