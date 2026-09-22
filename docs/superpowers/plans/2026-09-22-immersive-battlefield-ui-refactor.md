# Immersive Battlefield UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the battlefield UI as a non-layout-shifting, edge-mounted control layer while removing every human-operated tower placement path and preserving AI-driven gameplay.

**Architecture:** Keep the Canvas and deterministic engine as the full-screen rendering surface. Add a small DOM controller that owns control-layer visibility, accessibility state, keyboard shortcuts, and focus return; keep the existing strategy, decision-log, leaderboard, pause, speed, and settings components mounted so drafts and live state survive hiding. Narrow `Controls` to map gestures plus guarded global shortcuts, then remove `TowerPlacer` from the game loop and interface initialization so human clicks cannot reach `Map`.

**Tech Stack:** TypeScript 5, Vite, HTML5 Canvas, Less, Node-based source/integration tests, browser validation with agent-browser.

**Spec:** `docs/UI_REFACTOR_DESIGN.md`

## Global Constraints

- Preserve the existing map, textures, enemies, towers, animation, deterministic game loop, and AI action port.
- Human UI input may observe and control strategy text, pause/resume, speed, leaderboard, and settings only; it must not build, upgrade, sell, preview, or target battlefield entities.
- Keep model/player text rendered as text, never as HTML; do not expose raw model reasoning.
- Do not add backend, model, tower, map, or prompt-system features in this change.
- Do not add runtime dependencies; keep `package-lock.json` consistent with `package.json`.
- Increment the frontend version from `0.1.7` to `0.1.8` in `package.json`, both root package-lock version fields, and the static `index.html` footer placeholder.
- Preserve the original license and author attribution links.
- Leave unrelated worktree changes outside `G:\CODE\hackathon921` untouched.

---

### Task 1: Add a testable control-layer visibility controller

**Files:**
- Create: `src/ControlLayer.ts`
- Create: `tests/control-layer.test.js`

**Interfaces:**
- `toggleVisibility(visibility: 'hidden' | 'visible'): 'hidden' | 'visible'`
- `isEditableTarget(target: EventTarget | null): boolean`
- `ControlLayer.show()`, `.hide()`, `.toggle()`, `.isVisible()`
- `controlLayer` singleton bound to `#control-layer`, `#canvas`, and `#controls-collapse`

- [ ] **Step 1: Write the failing unit test**

  Add a plain-Node test that transpiles the new module and asserts:

  ```js
  assert.strictEqual(toggleVisibility('hidden'), 'visible');
  assert.strictEqual(toggleVisibility('visible'), 'hidden');
  assert.strictEqual(isEditableTarget({tagName: 'TEXTAREA'}), true);
  assert.strictEqual(isEditableTarget({tagName: 'INPUT'}), true);
  assert.strictEqual(isEditableTarget({tagName: 'BUTTON'}), false);
  assert.strictEqual(isEditableTarget({tagName: 'DIV', isContentEditable: true}), true);
  ```

- [ ] **Step 2: Run the focused test and verify the expected failure**

  Run: `node tests/control-layer.test.js`

  Expected: FAIL because `src/ControlLayer.ts` and its exported helpers do not exist yet.

- [ ] **Step 3: Implement the minimal state helpers and DOM controller**

  Keep the visibility state independent from `GameState`. `show()` and `hide()` must set the `is-visible` class, `aria-hidden`, and `HTMLElement.inert`; `hide()` must set focus back to the canvas. `toggle()` must call exactly one of those methods. Bind `controls` double-click and guarded Enter/Escape shortcuts, plus the collapse button, without destroying any child form controls.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `node tests/control-layer.test.js`

  Expected: PASS with the helper assertions above and no DOM access required by the helper tests.

- [ ] **Step 5: Commit the isolated controller test and implementation**

  ```bash
  git add src/ControlLayer.ts tests/control-layer.test.js
  git commit -m "refactor: add battlefield control layer controller"
  ```

### Task 2: Isolate map gestures and remove the human tower-placement path

**Files:**
- Modify: `src/Controls.ts`
- Modify: `src/Camera.ts`
- Modify: `src/Game.ts`
- Modify: `src/InterfaceManager.ts`
- Delete: `src/TowerPlacer.ts`
- Modify: `tests/leaderboard-live.test.js`
- Modify: `tests/control-layer.test.js`

**Interfaces:**
- `Controls` emits `mousedown`, `mouseup`, `wheel:up`, `wheel:down`, and `doubleclick` only from the Canvas/map gesture surface; a mouseup after a Canvas drag is still delivered when released outside the Canvas.
- `Controls` does not emit navigation/control shortcuts when the event target is an input, textarea, select, or contenteditable element.
- `Camera` starts a drag only from a Canvas mousedown and no longer imports `TowerPlacer`.
- `Game` no longer updates or draws a `TowerPlacer`.

- [ ] **Step 1: Extend the focused tests with the input-boundary contract**

  Assert from source and helper behavior that `Controls.ts` has no window-wide map click emission, that editable targets are excluded from shortcut emission, and that `Game.ts`/`InterfaceManager.ts` contain no runtime `TowerPlacer` or tower-selection initialization.

- [ ] **Step 2: Run the focused tests to verify the regression is detected**

  Run: `node tests/control-layer.test.js && node tests/leaderboard-live.test.js`

  Expected: FAIL on the existing global click/tower-placer references.

- [ ] **Step 3: Implement the minimal input and engine changes**

  Attach map-start events to the Canvas, track whether a map drag started, and use a window-level mouseup only to close an active drag. Keep mouse coordinates updated while dragging outside the Canvas. Emit `doubleclick` from the Canvas for the visibility controller. Filter text-editing targets before emitting keyboard shortcuts. Remove `TowerPlacer` imports, update/draw calls, tower palette creation, and the file itself; do not alter `GameActions`, `InertBattlefield`, `Map.canBePlaced()`, or AI action validation.

- [ ] **Step 4: Run the focused tests to verify the input boundary**

  Run: `node tests/control-layer.test.js && node tests/leaderboard-live.test.js`

  Expected: PASS, including the existing wave/score lifecycle assertions and the new no-human-placement assertions.

### Task 3: Recompose the HTML and connect existing stateful views

**Files:**
- Modify: `index.html`
- Modify: `src/InterfaceManager.ts`
- Modify: `src/StrategyPanel.ts`
- Modify: `src/leaderboard/LeaderboardUI.ts`
- Modify: `tests/leaderboard-ui.test.js`

**Interfaces:**
- `#control-layer` contains stable mounts for status, strategy/chatbox, decision log, operation buttons, settings, and `#leaderboard-slot`.
- Existing IDs `wave`, `state`, `cash`, `strategy-input`, `strategy-apply`, `strategy-status`, `decision-log`, `decision-empty`, `pause`, `resume`, `speed`, `version`, and `spawner1`–`spawner4` remain available to their current modules.
- `LeaderboardPanel` mounts under `#leaderboard-slot` when present and retains a safe `#inert` fallback for non-game contexts.
- Submitting a non-empty strategy queues it through `queueStrategy()` and hides the control layer without clearing the textarea; resume hides the layer, pause does not.

- [ ] **Step 1: Add failing source-level layout and lifecycle assertions**

  Update the leaderboard UI test to require the new slot/fallback mount, add assertions that `index.html` contains the three edge regions and canvas keyboard label, and assert that tower palette/stats mounts are absent. Add assertions that the strategy submit path calls `controlLayer.hide()` only after a valid queued submission.

- [ ] **Step 2: Run the UI source tests and verify the expected failure**

  Run: `node tests/leaderboard-ui.test.js`

  Expected: FAIL because the current sidebar still owns the tower palette and the leaderboard has no slot-aware mount.

- [ ] **Step 3: Implement the new stable DOM layout and integrations**

  Create a Canvas overlay with: compact status panel at lower left, strategy/decision Chatbox at lower right, operation bar at upper right, and a collapsible settings region containing spawner links, version, source link, and original author attribution. Add an accessible collapse button, the first-view double-click hint, and a leaderboard disclosure. Keep all existing view instances mounted across hide/show transitions. Make pause/resume labels and visibility reflect the actual `GameLoop` state; planning must not gain a manual resume control.

- [ ] **Step 4: Run the UI source tests and build**

  Run: `node tests/leaderboard-ui.test.js && npm run build`

  Expected: PASS and a successful Vite build with no missing DOM IDs or TypeScript transform errors.

### Task 4: Implement the immersive overlay visual system and responsive behavior

**Files:**
- Modify: `src/styles/styles.less`
- Modify: `index.html`

**Interfaces:**
- The Canvas remains full-screen and its computed size is independent of control-layer visibility.
- Hidden controls use `visibility`, `pointer-events`, and `inert`/ARIA state rather than opacity alone; visible controls expose keyboard focus and focus-visible styling.
- Desktop layout uses lower-left status, lower-right Chatbox, and upper-right operations/settings; narrow screens stack status and Chatbox without covering the operation controls.

- [ ] **Step 1: Add source assertions for the visual contract**

  Extend `tests/leaderboard-ui.test.js` or add `tests/control-layer.test.js` assertions for `.controls.is-hidden`/`.control-layer`, `pointer-events: none`, `visibility: hidden`, `prefers-reduced-motion`, and narrow-screen layout rules.

- [ ] **Step 2: Run the visual-contract test to verify it fails against the old styles**

  Run: `node tests/control-layer.test.js`

  Expected: FAIL because the old sidebar has no overlay visibility contract or responsive edge layout.

- [ ] **Step 3: Replace the sidebar-only Less rules with the overlay system**

  Keep the established dark/green palette but use opaque translucent surfaces, restrained borders, compact status chips, scroll-contained decision history, textarea focus styles, and a single 150–200 ms transition. Add `@media (prefers-reduced-motion: reduce)` to remove transitions and `@media (max-width: 760px)` to stack the lower panels and keep the top operation controls reachable. Remove all tower-palette/stats styling.

- [ ] **Step 4: Run build and focused source tests**

  Run: `node tests/control-layer.test.js && node tests/leaderboard-ui.test.js && npm run build`

  Expected: PASS with generated CSS and JavaScript artifacts.

### Task 5: Version, browser verification, regression suite, and delivery

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`
- Modify: `docs/UI_REFACTOR_DESIGN.md` only if implementation notes or verified limitations need recording

- [ ] **Step 1: Bump the frontend version consistently**

  Change the project version from `0.1.7` to `0.1.8` in `package.json`, both root package-lock locations, and the static footer placeholder in `index.html`; do not change dependency versions.

- [ ] **Step 2: Run the full required local checks**

  Run:

  ```bash
  npm ci
  npm run lint
  npx tsc --noEmit
  npm run test
  git diff --check
  ```

  Expected: `npm ci`, TypeScript, tests, and diff check pass. `npm run lint` is expected to be unavailable unless a lint script is added by the repository; report that precisely rather than treating it as passed.

- [ ] **Step 3: Start the built app and perform browser interaction checks**

  Run: `npm run dev -- --host 127.0.0.1`

  Verify in a browser at desktop and narrow viewport sizes: initial strategy input is reachable; valid strategy submission preserves text and hides controls; double-click/Enter toggles controls without changing wave, cash, entities, or game state; panel clicks and text editing do not pan/zoom; pause then collapse remains paused; resume hides and resumes; decision log and leaderboard update while hidden; settings and Game Over remain reachable; focus returns to the Canvas after Escape; reduced-motion removes transitions.

- [ ] **Step 4: Inspect the final diff and stage only task files**

  Run:

  ```bash
  git status --short
  git diff --check
  git diff --stat
  git diff --name-only
  ```

  Confirm `docs/UI_REFACTOR_DESIGN.md` remains the user-provided document, no build output or credentials is staged, and no unrelated file is included.

- [ ] **Step 5: Commit, push, open/update the PR, and verify remote state**

  Stage explicit paths only, commit with a concise refactor message, push `agent/refactor-ui` to `origin` with upstream tracking, create or update a Ready-for-review PR against `zuohaisu/hackathon921:main`, and verify the remote commit and PR state. The PR body must include Summary, Validation, Risk / Safety Boundaries, and Known Limitations, including the unavailable lint script or any browser checks that could not run.
