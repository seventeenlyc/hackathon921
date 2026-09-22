/**
 * Seeded, deterministic pseudo-random generator for a single game instance.
 *
 * The browser build called `Math.random()` directly (rock scatter, wave
 * composition), which made a run impossible to replay and let two runs share
 * hidden global state. Every random decision in the engine goes through this
 * instance instead, so "same seed + same actions" reproduces the same battle.
 *
 * Algorithm: mulberry32 — a small, fast, well-distributed 32-bit generator that
 * uses only integer math, so it produces identical sequences on every platform.
 */
export class Rng {
    private state: number;

    constructor(seed: number) {
        // Normalise to an unsigned 32-bit integer so any seed is reproducible.
        this.state = seed >>> 0;
    }

    /** Next float in [0, 1). */
    next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Integer in [0, maxExclusive). Equivalent to the old `randIndex`. */
    int(maxExclusive: number): number {
        return Math.floor(this.next() * maxExclusive);
    }

    /**
     * Integer in [min, max), matching the old `rand(min, max)` exactly —
     * including fractional bounds, which the wave generator relies on
     * (`rand(0, waveCounter / 10)`).
     */
    range(min: number, max: number): number {
        return Math.floor(this.next() * (max - min) + min);
    }

    /** True with probability `p`. Kept explicit so the port reads the same as `Math.random() < p`. */
    chance(p: number): boolean {
        return this.next() < p;
    }

    /**
     * True when the raw draw is strictly greater than `threshold`. The old wave
     * generator used `Math.random() > 0.6`; preserving that exact comparison
     * keeps the same wave shapes for the same seed.
     */
    above(threshold: number): boolean {
        return this.next() > threshold;
    }

    /** In-place Fisher-Yates shuffle, matching the old `shuffle` helper. */
    shuffle<T>(items: T[]): T[] {
        for (let i = items.length - 1; i > 0; --i) {
            const j = this.int(i + 1);
            const tmp = items[i];
            items[i] = items[j];
            items[j] = tmp;
        }
        return items;
    }

    /**
     * Current generator state. Exposed so a run can be serialised and resumed
     * (and so tests can prove two instances keep independent state); it is not
     * part of the simulation itself.
     */
    snapshot(): number {
        return this.state;
    }
}
