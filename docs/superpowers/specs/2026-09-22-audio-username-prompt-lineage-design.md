# Audio, Session Nicknames, and Best-Run Prompt Lineage

## Status

Approved design. This change extends the existing shared leaderboard and the existing strategy-application flow on `upstream/main`.

## Goal

Add placeholder background music and sound-effect hooks, make nickname entry session-only so every browser refresh asks again while server-side runs and scores remain, and let a leaderboard visitor inspect the complete Prompt chain for the selected player's highest-scoring run.

## Existing boundaries

- `src/StrategyPanel.ts` and `src/agent/StrategyStore.ts` already define the user-facing “应用策略” flow and the version/effective-wave rules.
- `server/src/store.ts` already persists `runs` and append-only `wave_events` in Node 22 SQLite.
- `src/leaderboard/LeaderboardClient.ts` keeps the current token and run only in module memory, but `LeaderboardStore.ts` still persists the nickname in a cookie.
- `src/leaderboard/LeaderboardUI.ts` currently renders leaderboard rows as text-only list items.
- The browser must treat nickname and Prompt content as untrusted input; server validation and `textContent` rendering remain mandatory.

## Decisions

### Best-run scope

Selecting a leaderboard user opens the Prompt history belonging to the run that produced that user's best wave. The server chooses the run using the existing ranking rule: highest recorded wave first, then the earliest server-recorded time at that wave. Prompt history from lower-scoring runs is not shown in this view.

### Prompt version semantics

Only Prompt versions that become active at a `PLANNING` boundary are persisted. A Prompt typed or applied while another version is queued can be overwritten by the last edit before the boundary and is therefore not part of the public chain. Each persisted node contains the `StrategyVersion.version`, its text, and `fromWave`.

### Linked-list persistence

SQLite stores one singly linked list per run. `prompt_nodes.prev_id` points to the previously active node, and `runs.prompt_head_id` points to the newest node. The server traverses backward from the head and returns the chain oldest-first. Inserts and the head-pointer update occur in one transaction.

### Nickname lifetime

Nicknames are held only in JavaScript memory for the current page lifetime. The cookie is removed; no replacement nickname cookie or nickname localStorage key is introduced. Refreshing the page therefore shows the nickname gate again and obtains a new signed session token. Existing runs, wave events, Prompt nodes, and leaderboard best scores remain in SQLite.

### Public Prompt visibility

The best-run Prompt chain is public to anyone who can read the shared leaderboard. Prompt text is returned as data and rendered as plain text. There is no account-level ownership or private-history mode in this change.

### Audio behavior

`AudioManager` owns three optional assets: looping background music, a wave-reached effect, and a game-over effect. The first user gesture that confirms the nickname or starts the run unlocks background playback. Missing or blocked audio is non-fatal and never pauses or fails the game. Placeholder asset paths are committed so real media can be added without changing game logic.

## Server design

### Schema migration

Extend the existing SQLite migration. The startup migration first checks `PRAGMA table_info(runs)` and executes the `ALTER TABLE` only when `prompt_head_id` is absent; the table and index statements use `IF NOT EXISTS`.

```sql
-- Run only when PRAGMA table_info(runs) has no prompt_head_id row.
ALTER TABLE runs ADD COLUMN prompt_head_id TEXT;

CREATE TABLE IF NOT EXISTS prompt_nodes (
    id         TEXT PRIMARY KEY,
    run_id     TEXT NOT NULL REFERENCES runs(id),
    prev_id    TEXT REFERENCES prompt_nodes(id),
    version    INTEGER NOT NULL,
    prompt     TEXT NOT NULL,
    from_wave  INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (run_id, version)
);
CREATE INDEX IF NOT EXISTS idx_prompt_nodes_run ON prompt_nodes(run_id, version);
```

The migration must be idempotent for fresh and existing databases. If the column already exists, the guarded migration skips the `ALTER TABLE` and startup continues without error.

### Write API

`POST /api/runs/:runId/prompts` requires the run's signed session token and accepts `{ version, prompt, fromWave }`.

The server validates:

- token is valid and belongs to the run's nickname;
- Prompt is a trimmed non-empty string within the existing `MAX_STRATEGY_LENGTH` limit;
- version is a positive integer and is greater than the run's last persisted version;
- `fromWave` is an integer in the supported wave range and is not earlier than the run's last recorded wave;
- the run is not expired.

On success, the server allocates an opaque node ID, inserts it with `prev_id` equal to the current head, updates `runs.prompt_head_id`, and returns `{ recorded: true, version, fromWave }`. Rejections use structured codes such as `RUN_NOT_FOUND`, `INVALID_SESSION`, `PROMPT_INVALID`, `PROMPT_VERSION_NOT_INCREASING`, `PROMPT_WAVE_INVALID`, and `RUN_EXPIRED`.

### Read API

`GET /api/leaderboard/:username/prompts` is public. It validates the path nickname with the same server sanitizer, resolves the user's best run, traverses that run's linked list, and returns:

```json
{
  "username": "Luna",
  "runId": "opaque-id",
  "wave": 37,
  "prompts": [
    {"version": 1, "prompt": "...", "fromWave": 1, "createdAt": 0},
    {"version": 2, "prompt": "...", "fromWave": 5, "createdAt": 0}
  ]
}
```

Missing leaderboard data returns a normal empty result; malformed or overlong nicknames return `400`. The response never returns a different user's run by accepting an arbitrary run ID from the browser.

### Run creation and client synchronization

The client creates the run before starting the first wave, so the opening Prompt can be associated with `fromWave: 1`. When `StrategyStore.lock()` promotes a queued version, the client sends that version to the current run. Wave reporting continues to use the existing monotonic server evidence. Network failures leave the local game playable, show a lineage-sync failure through the existing status/error path, and never fabricate a server history entry.

## Client design

### Session nickname changes

- Remove `USERNAME_COOKIE`, `readUsernameCookie`, and `writeUsernameCookie` usage.
- `UsernameGate` stores the accepted name in an in-memory session holder and does not write browser persistence.
- AI mode always opens the gate on page load; human mode keeps its current no-nickname behavior.
- `Game`, `LeaderboardPanel`, and `LeaderboardClient` read the in-memory username/session state.
- Local `localStorage` leaderboard entries remain only as offline display fallback; they never restore the nickname or overwrite server truth.

### Prompt lineage client API

Extend `LeaderboardClient` with `ensureRun()` and `recordPromptVersion()`. Add a single synchronization hook at the strategy activation boundary so queued edits that never become active are not recorded. The existing `StrategyStore.history()` remains the local in-memory history used by the game and tests.

`LeaderboardPanel` adds a keyboard-accessible button for each displayed username. Selecting it fetches the public best-run history, opens a modal/detail panel, and renders each Prompt with `textContent`, version, and effective wave. Loading, empty, HTTP failure, and close states are explicit and do not block the simulation.

### Audio API

Create `src/AudioManager.ts` with `startMusic()`, `stopMusic()`, `playWaveReached()`, and `playGameOver()`. It creates/reuses HTML audio elements, sets the music loop, catches autoplay and asset errors, and exposes no game-state mutation. Hook it to the nickname/start gesture, `Game.recordReachedWave`, and `Game.gameOver`.

Add placeholder files under `public/audio/` with stable names for the three assets. The build must include them, while the manager treats an absent or invalid media file as a no-op.

## UI and safety

- Prompt history uses a dedicated modal or panel with a close button and focusable controls.
- Usernames and Prompt text are inserted with `textContent`; no new untrusted `innerHTML` interpolation is allowed.
- Prompt history is public by product decision, so the UI labels it clearly as the selected user's best run.
- The server remains the authority for run ownership, version ordering, wave bounds, TTL, and best-run selection.

## Verification

Add or update tests for:

1. SQLite migration idempotence and linked-list insertion/traversal.
2. Prompt write authorization, validation, monotonic version checks, expired runs, and rollback behavior.
3. Best-run selection and public read behavior, including lower-scoring runs not leaking into the response.
4. Client nickname reset semantics: no cookie write/read and a fresh gate after module reload.
5. Client strategy activation synchronization and offline failure reporting.
6. Leaderboard row click, modal close/loading/empty states, and XSS-safe Prompt rendering.
7. Audio hooks and non-fatal autoplay/media failures.

Run the repository checks from `AGENTS.md`: `npm ci`, `npm run lint` if present, `npx tsc --noEmit`, `npm run test`, `npm run test:server`, and `git diff --check`. The existing Windows `setTimeout` typing failure in `npx tsc --noEmit` must be reported separately if it remains unrelated to this change.

## Files expected to change

- Modify: `server/src/db.ts`, `server/src/store.ts`, `server/src/http.ts`, `server/src/validate.ts`, `server/src/main.ts` if ID generation wiring is needed.
- Modify: `src/leaderboard/LeaderboardClient.ts`, `src/leaderboard/LeaderboardStore.ts`, `src/leaderboard/LeaderboardUI.ts`, `src/main.ts`, `src/Game.ts`, `src/agent/StrategyStore.ts` or its activation glue.
- Create: `src/AudioManager.ts`, placeholder files under `public/audio/`.
- Modify: `public/index.html` or existing UI template/styles as required by the current Vite entry, and `src/styles/styles.less`.
- Add: focused client and server tests under `tests/` and `server/tests/`.
- Modify: `docs/PRODUCT_CONCEPT.md` and deployment/API notes if the new public endpoint requires operational documentation.
