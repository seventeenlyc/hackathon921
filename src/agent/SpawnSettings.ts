/**
 * Queues spawn-route changes so they land on a wave boundary (issue #40).
 *
 * Applying a change immediately would be worse than useless: the current wave
 * already had its PLANNING window, so the AI would never see the new lane and it
 * would stand undefended. Instead a request is queued and applied at the next
 * boundary, *before* the planner runs, so that same thinking round covers it.
 *
 * Dependency-free so the queueing rules can be unit-tested without a DOM.
 */

export const MIN_SPAWNS = 1;
export const MAX_SPAWNS = 4;

export function clampSpawnCount(count: number): number {
    if (!Number.isFinite(count)) return MIN_SPAWNS;
    return Math.max(MIN_SPAWNS, Math.min(MAX_SPAWNS, Math.floor(count)));
}

export class SpawnSettings {
    private pending: number | null = null;

    constructor(
        private readonly applyCount: (count: number) => number,
        private readonly readCount: () => number
    ) {
    }

    /** The number of lanes currently on the map. */
    get applied(): number {
        return this.readCount();
    }

    /** What the player asked for; equals `applied` when nothing is queued. */
    get requested(): number {
        return this.pending === null ? this.applied : this.pending;
    }

    /** True while a request is waiting for the next wave boundary. */
    get isPending(): boolean {
        return this.pending !== null && this.pending !== this.applied;
    }

    /** Queue a lane count for the next boundary. Returns the clamped value. */
    request(count: number): number {
        const next = clampSpawnCount(count);
        this.pending = next === this.readCount() ? null : next;
        return next;
    }

    /**
     * Wave-boundary hook. Returns true when a queued change was applied; the
     * actual count is whatever the map accepted (a tower can block a lane).
     */
    applyPending(): boolean {
        if (this.pending === null) return false;
        const count = this.pending;
        this.pending = null;
        this.applyCount(count);
        return true;
    }
}
