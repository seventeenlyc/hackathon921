/**
 * Wave-boundary narrative director (issue #100).
 *
 * Decides *whether* and *when* a story scene plays, independently of the DOM and
 * of the engine internals, so the trigger rules are unit-testable:
 *
 *  - every scene plays at most once per run (`reset()` starts a new run);
 *  - `requiresClear` scenes wait for a truly cleared field with the base still
 *    standing, and are skipped if the defense falls first;
 *  - the scene runs inside the caller's freeze (`hold`), so simulation time,
 *    spawning, item timers and the AI planning trigger stay paused while the
 *    player reads.
 *
 * `WavesManager` calls `beforeWave()` at the top of every wave iteration; the
 * port implementation is wired in `Game.ts`.
 */

import type {NarrativeScene} from './NarrativeScript';

/** How often the clear wait re-checks the battlefield (scaled by game speed). */
export const NARRATIVE_CLEAR_POLL_MS = 250;

export interface NarrativeOverlayPort {
    /** Resolves when the player has advanced past / skipped the scene. */
    play(scene: NarrativeScene): Promise<void>;
}

export interface NarrativeDirectorPorts {
    /** Freeze the simulation, run `hold`, then resume. */
    hold(hold: () => Promise<void>): Promise<void>;
    /** Delay that only elapses while the simulation is stepping. */
    sleep(ms: number): Promise<void>;
    hasLivingEnemies(): boolean;
    baseAlive(): boolean;
    /** False once the run is over (game over / shutdown). */
    stillRunning(): boolean;
}

export class NarrativeDirector {
    private played = new Set<string>();

    constructor(
        private readonly scenes: readonly NarrativeScene[],
        private readonly ports: NarrativeDirectorPorts,
        private readonly overlay: NarrativeOverlayPort,
    ) {
    }

    /** A fresh run may replay every scene. */
    reset(): void {
        this.played.clear();
    }

    hasPlayed(id: string): boolean {
        return this.played.has(id);
    }

    /** The not-yet-played scene gated on this wave boundary, if any. */
    sceneBefore(wave: number): NarrativeScene | null {
        return this.scenes.find(scene => scene.beforeWave === wave && !this.played.has(scene.id)) ?? null;
    }

    /**
     * Called at the top of a wave iteration. Boundary scenes play immediately;
     * clear-gated scenes wait for the previous wave to be wiped out first, and
     * never play after the base has fallen.
     */
    async beforeWave(wave: number): Promise<void> {
        const scene = this.sceneBefore(wave);
        if (!scene) return;

        if (scene.requiresClear && !(await this.waitForClear())) return;

        // Mark played before presenting: skip / close / a lost run must never
        // re-trigger the same scene.
        this.played.add(scene.id);

        try {
            await this.ports.hold(() => this.overlay.play(scene));
        } catch (error) {
            // A view failure must never stall the deterministic run: surface it
            // and let the next wave proceed. The scene stays marked played so it
            // is not retried forever.
            console.error('[narrative] scene failed to display', scene.id, error);
        }
    }

    private async waitForClear(): Promise<boolean> {
        while (this.ports.stillRunning() && this.ports.baseAlive() && this.ports.hasLivingEnemies()) {
            await this.ports.sleep(NARRATIVE_CLEAR_POLL_MS);
        }

        return this.ports.stillRunning() && this.ports.baseAlive();
    }
}
