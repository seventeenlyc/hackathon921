/**
 * Decision cadence for AI-driven play (issue #17).
 *
 * The deterministic simulation only advances while `state === 'running'` and the
 * tab has focus. `PAUSED` is player-initiated and only leaves via an explicit
 * `resume()`; `PLANNING` is engine-initiated at a wave boundary and leaves when
 * the planner resolves — the player never intervenes there.
 *
 * See `docs/PRODUCT_CONCEPT.md` §7 for the confirmed rules. This module is
 * deliberately dependency-free so it can be unit-tested without a DOM and so the
 * LLM runtime can later be attached as the planner without touching the engine.
 */

export type GameState = 'running' | 'paused' | 'planning';
export type GameSpeed = 1 | 2;

export type StateListener = (state: GameState) => void;

export interface Planner {
    /** Runs while frozen in PLANNING. Resolving it lets the engine start the next wave. */
    plan(): Promise<void>;
}

const TICK_MS = 16;

export class GameLoop {
    private _state: GameState = 'running';
    private _speed: GameSpeed = 1;
    private _focused = true;
    private listeners: StateListener[] = [];

    get state(): GameState {
        return this._state;
    }

    get speed(): GameSpeed {
        return this._speed;
    }

    /** True only when the simulation is allowed to advance. */
    isStepping(): boolean {
        return this._state === 'running' && this._focused;
    }

    onChange(listener: StateListener) {
        this.listeners.push(listener);
    }

    setSpeed(speed: GameSpeed) {
        this._speed = speed;
    }

    /**
     * Tab focus is a separate gate from PAUSED: losing focus freezes everything
     * (including spawning) and regaining it continues, without demanding a manual
     * resume. Only an explicit pause() makes the player's PAUSED sticky.
     */
    setFocused(focused: boolean) {
        this._focused = focused;
    }

    /** Player-initiated. Ignored unless the game is actually running. */
    pause() {
        if (this._state === 'running') this.setState('paused');
    }

    /** Only the player resumes a pause — never automatic. */
    resume() {
        if (this._state === 'paused') this.setState('running');
    }

    /**
     * Engine-initiated freeze at a wave boundary. Runs the planner, then hands
     * control back so the engine can start the next wave. If the planner throws,
     * the loop still returns to RUNNING (the run must not stall); the error is
     * re-thrown for the caller/runtime to surface.
     */
    async holdForPlanning(planner: Planner): Promise<void> {
        this.setState('planning');
        try {
            await planner.plan();
        } finally {
            if (this._state === 'planning') this.setState('running');
        }
    }

    /**
     * Delay that only elapses while the game is stepping, and runs `speed` times
     * faster in fast mode. Replaces the old focus-aware `asyncSleep` so spawning
     * honours PAUSED / PLANNING / speed exactly like the simulation does.
     */
    sleep(ms: number): Promise<void> {
        return new Promise(resolve => {
            let remaining = ms;
            let last = Date.now();

            const id = setInterval(() => {
                const now = Date.now();
                const elapsed = now - last;
                last = now;

                if (!this.isStepping()) return;

                remaining -= elapsed * this._speed;

                if (remaining <= 0) {
                    clearInterval(id);
                    resolve();
                }
            }, TICK_MS);
        });
    }

    private setState(state: GameState) {
        if (this._state === state) return;
        this._state = state;
        this.listeners.forEach(listener => listener(state));
    }
}

export const gameLoop = new GameLoop();
