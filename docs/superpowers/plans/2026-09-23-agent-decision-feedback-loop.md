# AI Decision Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 key defects in the agent decision loop: semantic separation of macro tactical summary vs action logs, language sync, invalid placement persistence feedback, frontline/outer candidate zone generation, and robust tool diagnostic error handling.

**Architecture:** Enhances server proxy prompt and schema with language constraints and coordinate-free macro tactical summaries; enhances candidate generation in snapshots with route-progress zones (frontline/midfield/base) and invalid cell filtering; implements client-side lifetime tracking of confirmed invalid placement cells with engine short-circuiting; decouples UI macro reasoning display from mechanical action logs; updates product concept documentation §7.

**Tech Stack:** TypeScript, Node.js `node:test`, HTML5 Canvas / Vite architecture.

**Spec:** `docs/superpowers/specs/2026-09-23-agent-decision-feedback-loop-design.md`

## Global Constraints

- Engine is the sole arbiter of deterministic physics, pathfinding, and placement rules (AGENTS.md).
- System prompt and player strategy remain strictly separated; player strategy is untrusted user text.
- No player-facing chain-of-thought (CoT); macro summaries must be concise (<= 120 chars) and contain no coordinate numbers.
- Lifetime tracking of invalid placement points (`BLOCKS_PATH`, `CELL_OCCUPIED`) persists across waves within a single match and resets on new match. `INSUFFICIENT_FUNDS` is strictly excluded from invalid points.
- DOM-free testability for all agent logic and server endpoints.

## Review Focus

1. **Coordinate leak in summary**: When model tries to put coordinates `(10, 5)` into `decision_summary`, server prompt and schema explicitly discourage it and runtime sanitizes/rejects coordinate recitation.
2. **Language mismatch**: When client language is set to `en`, summary must be requested in English, and language switch must clear stale summary in previous language.
3. **Transient resource rejection vs physical blockage**: `INSUFFICIENT_FUNDS` must not block a cell from future placements when cash becomes available later.
4. **Candidate zone coverage**: When an enemy path exists, candidate cells must provide options in `frontline` (0-35% of path), `midfield` (35-70%), and `base` (70-100%) rather than all clustering at the base.
5. **Protocol and tool failure differentiation**: Malformed JSON arguments or unknown tool names must trigger diagnostic error reporting rather than silently masking as "peaceful wait".

---

### Task 1: Server Agent Proxy Schema, Prompt, Lang & Diagnostics

**Files:**
- Modify: `server/src/agent.ts`
- Test: `server/tests/agent.test.ts`

**Interfaces:**
- Consumes: `validateAgentRequest(body: unknown): AgentValidationOk | AgentValidationError`
- Produces:
  - `lang?: 'zh' | 'en'` support in request validation and `composeAgentMessages`.
  - Updated `AGENT_SYSTEM_PROMPT` (priority override, language instruction, prohibition of coordinate numbers in summary).
  - Updated `DECISION_SUMMARY_PROPERTY` description.
  - Safe error diagnostics on tool argument parsing.

- [ ] **Step 1: Write the failing tests in `server/tests/agent.test.ts`**
  - Test `validateAgentRequest` accepts `lang: 'zh'` and `lang: 'en'`, defaults to `'zh'` when omitted, rejects invalid language values like `'fr'`.
  - Test `composeAgentMessages` includes language constraint instruction in system prompt.
  - Test `AGENT_SYSTEM_PROMPT` explicitly forbids coordinate mentions in `decision_summary` and prioritizes player's aggressive spend/frontline directives over default conservative behavior.
  - Test malformed tool arguments return a diagnostic flag or error rather than silent `{}`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test server/tests/agent.test.ts`

- [ ] **Step 3: Implement changes in `server/src/agent.ts`**
  - Add `lang?: 'zh' | 'en'` validation to `validateAgentRequest`.
  - Update `AGENT_SYSTEM_PROMPT` with language instructions and coordinate-free tactical assessment rules.
  - Update `DECISION_SUMMARY_PROPERTY` description.
  - Enhance `parseArguments` and `extractAgentActions` to report parse errors.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test server/tests/agent.test.ts`

- [ ] **Step 5: Commit Task 1**
  ```bash
  git add server/src/agent.ts server/tests/agent.test.ts
  git commit -m "feat(server): add lang support, macro summary constraints, and tool diagnostics"
  ```

---

### Task 2: Snapshot Candidate Generation with Zones and Invalid Cell Filtering

**Files:**
- Modify: `src/agent/snapshot.ts`
- Test: `tests/agent/snapshot.test.js`

**Interfaces:**
- Consumes: `createSnapshot(battlefield, options)`
- Produces:
  - `SnapshotOptions.invalidCells?: string[] | Set<string>`
  - Candidate cell property `zone?: 'frontline' | 'midfield' | 'base'`
  - Filtered `buildCandidates` and `pathShapingCandidates` excluding all invalid cells.
  - Balanced candidate quotas across `frontline`, `midfield`, and `base`.

- [ ] **Step 1: Write failing tests in `tests/agent/snapshot.test.js`**
  - Test that candidate cells in `invalidCells` are never included in `buildCandidates` or `pathShapingCandidates`.
  - Test that candidates along enemy route are tagged with `zone: 'frontline' | 'midfield' | 'base'`.
  - Test that `buildCandidates` includes candidates from frontline and midfield, not solely base.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/agent/snapshot.test.js`

- [ ] **Step 3: Implement candidate zone partitioning and invalid cell filtering in `src/agent/snapshot.ts`**
  - Calculate progression ratio `stepIndex / totalSteps` for route tiles.
  - Label candidates as `frontline` (ratio < 0.35), `midfield` (0.35 <= ratio < 0.70), or `base` (ratio >= 0.70).
  - Filter out candidate coordinates present in `options.invalidCells`.
  - Select candidate quotas ensuring frontline/midfield coverage.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/agent/snapshot.test.js`

- [ ] **Step 5: Commit Task 2**
  ```bash
  git add src/agent/snapshot.ts tests/agent/snapshot.test.js
  git commit -m "feat(agent): support zone-partitioned candidates and invalid cell filtering in snapshot"
  ```

---

### Task 3: Client AgentRuntime Feedback Loop & Summary Decoupling

**Files:**
- Modify: `src/agent/AgentRuntime.ts`
- Test: `tests/agent/agent-runtime.test.js`

**Interfaces:**
- Consumes: `ActionPort`, `StrategyStore`, `fetch`
- Produces:
  - `confirmedInvalidCells: Map<string, string>`
  - `resetInvalidCells(): void`
  - Removal of `actionPlanSummary` fallback coordinate recitation.
  - Direct transmission of `lang` and `invalidCells` to server request.
  - Short-circuit rejection of calls targeting known invalid cells.

- [ ] **Step 1: Write failing tests in `tests/agent/agent-runtime.test.js`**
  - Test that when `buildTower` returns `BLOCKS_PATH` or `CELL_OCCUPIED`, the cell is recorded in `confirmedInvalidCells`.
  - Test that when `buildTower` returns `INSUFFICIENT_FUNDS`, the cell is NOT recorded in `confirmedInvalidCells`.
  - Test that calling `buildTower` on a previously confirmed invalid cell is short-circuited by runtime without hitting `actions.buildTower`.
  - Test that request payload to server includes current `lang` (e.g. `'en'` or `'zh'`).
  - Test that when provider returns no summary, runtime outputs localized fallback placeholder and does NOT output coordinate action plan.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/agent/agent-runtime.test.js`

- [ ] **Step 3: Implement feedback tracking and summary decoupling in `src/agent/AgentRuntime.ts`**
  - Track `confirmedInvalidCells`.
  - Short-circuit invalid coordinate attempts.
  - Pass `lang` and `invalidCells` in request.
  - Abolish coordinate-reciting fallback in `actionPlanSummary`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/agent/agent-runtime.test.js`

- [ ] **Step 5: Commit Task 3**
  ```bash
  git add src/agent/AgentRuntime.ts tests/agent/agent-runtime.test.js
  git commit -m "feat(agent): track invalid cells across waves, pass lang, and decouple summary from coordinates"
  ```

---

### Task 4: UI & i18n Synchronization for Summary and Language

**Files:**
- Modify: `src/i18n.ts`
- Modify: `src/agent/DecisionTerminal.ts` (or relevant display components)

- [ ] **Step 1: Update i18n keys for summary placeholder**
  - Add `reasoning.summaryUnavailable` in `en` and `zh` translation dictionaries.

- [ ] **Step 2: Clear old language summary on language change**
  - In `DecisionTerminal` or listener, clear summary text display when language changes so stale summaries do not persist.

- [ ] **Step 3: Verify TypeScript compilation**
  Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit Task 4**
  ```bash
  git add src/i18n.ts src/agent/DecisionTerminal.ts
  git commit -m "feat(ui): add summary fallback i18n and clear stale summary on language toggle"
  ```

---

### Task 5: Revise Product Concept Document (§7)

**Files:**
- Modify: `docs/PRODUCT_CONCEPT.md`

- [ ] **Step 1: Update §7 and remove obsolete fallback decision**
  - Add confirmed decision: AI tactical assessment (`decision_summary`) is strictly macro intent, completely decoupled from mechanical action logs.
  - Coordinates are prohibited in summary text.
  - Language of summary strictly follows UI language.

- [ ] **Step 2: Commit Task 5**
  ```bash
  git add docs/PRODUCT_CONCEPT.md
  git commit -m "docs: update product concept §7 with decoupled macro summary decisions"
  ```

---

### Task 6: Full Verification and Checks

- [ ] **Step 1: Run linter and formatting checks**
  Run: `npm run lint` or `npx tsc --noEmit`
- [ ] **Step 2: Run all tests across backend and frontend**
  Run: `npm test` and `node --test server/tests/*.test.ts tests/agent/*.test.js`
- [ ] **Step 3: Run git diff check**
  Run: `git diff --check`
