import {STRATEGY_KEYS, t} from '../i18n';

/**
 * Starter strategies for players who don't know what to write yet
 * (docs/PRODUCT_CONCEPT.md §6, docs/USER_STORY.md MVP 用户故事 2).
 *
 * They are deliberately different in *approach* rather than optimised: the point
 * of an example is to make the causality "my words change the AI's behaviour"
 * visible, so "ring the base" and "line the whole path" must look different on
 * screen. Keep each one short enough to read at a glance.
 *
 * The text lives in `i18n.ts` so the examples follow the UI language; this module
 * only owns the selection.
 */

/** Keys of the built-in examples, in order. */
export {STRATEGY_KEYS};

/** Pick one example, translated. `rand` is injectable so tests are deterministic. */
export function randomStrategy(rand: () => number = Math.random): string {
    const index = Math.floor(rand() * STRATEGY_KEYS.length);
    // Survive a `rand()` that returns exactly 1, which a Math.random() contract
    // forbids but an injected test double might not.
    const safe = Math.min(Math.max(index, 0), STRATEGY_KEYS.length - 1);
    return t(STRATEGY_KEYS[safe]);
}
