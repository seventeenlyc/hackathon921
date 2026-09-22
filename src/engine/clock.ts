/**
 * The engine's single simulation clock.
 *
 * The browser build used to advance battle by a 30 Hz `setInterval` while wave
 * spawning drifted on `GameLoop.sleep()`'s wall-clock timer. That split is what
 * the backend migration has to remove: everything that moves the battle now
 * advances in whole ticks of `TICK_MS`, and wall-clock time is used only for
 * things that are genuinely about real time (model timeouts, connection grace).
 *
 * `fps` stays the number from `config.json` so the extracted engine keeps the
 * exact movement, reload and effect values of the browser build.
 */
import {fps} from '../config.json';

/** Base ticks per second. One tick is one simulation step. */
export const TICK_RATE = fps;

/** Duration of one base tick in milliseconds. */
export const TICK_MS = 1000 / fps;

/**
 * Convert a duration expressed in "old" wall-clock milliseconds to a whole
 * number of ticks, rounding to the nearest tick.
 *
 * The old wave loop waited `delay` ms with a 16 ms timer, so a spawn landed at
 * an arbitrary sub-tick moment. Rounding is the faithful whole-tick equivalent:
 * a 500 ms gap at 30 Hz becomes 15 ticks.
 */
export function msToTicks(ms: number): number {
    return Math.max(0, Math.round((ms * fps) / 1000));
}
