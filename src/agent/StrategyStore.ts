/**
 * Versioned store for the player's strategy prompt (issue #17,
 * docs/USER_STORY.md MVP 用户故事 4, docs/PRODUCT_CONCEPT.md §7).
 *
 * The rules live here rather than in the DOM or in a game singleton so they can
 * be unit-tested in a plain Node process:
 *
 * - editing is always allowed and never requires pausing;
 * - a submission is *queued*, so the wave in progress is never affected;
 * - the queue is locked when the loop enters PLANNING and becomes the version
 *   the AI plans with for the upcoming wave;
 * - several edits between two PLANNING boundaries overwrite one another (last
 *   write wins) while every version that ever took effect stays in history.
 */

export interface StrategyVersion {
    /** 0 is the initial (possibly empty) strategy; each submission gets the next number. */
    version: number;
    text: string;
    /** Wave from which this version is the one the AI plans with. */
    fromWave: number;
}

/**
 * Wave a submission made now will become active at.
 *
 * PLANNING precedes each wave (docs/PRODUCT_CONCEPT.md §7), so `currentWave`
 * already names the wave being planned/running and the next boundary is always
 * `currentWave + 1` — whether the player edits while RUNNING or while PLANNING.
 * While IDLE there is no wave in flight and the first boundary is wave 1 itself,
 * so the prompt the player writes before starting takes effect immediately.
 */
export function effectiveWave(currentWave: number, isIdle: boolean): number {
    return isIdle ? currentWave : currentWave + 1;
}

export type StrategyListener = (store: StrategyStore) => void;

export class StrategyStore {
    private current: StrategyVersion;
    private queuedVersion: StrategyVersion | null = null;
    private nextVersionNumber = 1;
    private readonly locked: StrategyVersion[];
    private readonly listeners: StrategyListener[] = [];

    constructor(initialText = '', initialWave = 1) {
        this.current = {version: 0, text: initialText, fromWave: initialWave};
        this.locked = [this.current];
    }

    /** The version the planner reads while the loop is in PLANNING. */
    active(): StrategyVersion {
        return this.current;
    }

    /** The submission waiting for the next PLANNING boundary, if any. */
    queued(): StrategyVersion | null {
        return this.queuedVersion;
    }

    /** Every version that has been active at least once, oldest first. */
    history(): StrategyVersion[] {
        return [...this.locked];
    }

    /** Observers are notified whenever the active or queued version changes. */
    onChange(listener: StrategyListener) {
        this.listeners.push(listener);
    }

    /**
     * Queue a submission for `fromWave`. Overwrites a previous, still-unlocked
     * submission so that the last edit before the boundary wins.
     */
    submit(text: string, fromWave: number): StrategyVersion {
        this.queuedVersion = {
            version: this.nextVersionNumber++,
            text,
            fromWave,
        };
        this.notify();
        return this.queuedVersion;
    }

    /**
     * Called when the loop enters PLANNING: freeze the queued submission as the
     * active version for the upcoming wave. A no-op when nothing is queued, so
     * it is safe to call on every PLANNING transition.
     */
    lock(): StrategyVersion {
        if (!this.queuedVersion) {
            return this.current;
        }

        this.current = this.queuedVersion;
        this.queuedVersion = null;
        this.locked.push(this.current);
        this.notify();
        return this.current;
    }

    /**
     * Apply the opening prompt at the moment the player presses Start, instead
     * of waiting for the first PLANNING notification.
     *
     * PLANNING locks the queue before wave 1 too, so this is usually a no-op
     * after that transition. Doing it here makes "apply the strategy, then
     * begin" explicit and means wave 1 can never plan with the previous/empty
     * version if that notification is missed (stale HMR module instance, a
     * listener that throws, etc.). Returns null when there is no prompt to run
     * with, so the caller can refuse to start.
     */
    activateForRun(): StrategyVersion | null {
        const pending = this.queuedVersion ? this.queuedVersion.text : this.current.text;
        if (pending.trim() === '') return null;
        return this.lock();
    }

    private notify() {
        this.listeners.forEach(listener => listener(this));
    }
}

export const strategyStore = new StrategyStore();
