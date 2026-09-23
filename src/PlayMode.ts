/**
 * Which controller drives a run (docs/PRODUCT_CONCEPT.md §5).
 *
 * - `ai` (default): the player writes a Prompt and the AI places every tower.
 * - `human`: the original inert game — the player places towers with the mouse
 *   and the AI is not called at all.
 *
 * A run is controlled by exactly one side, so switching modes restarts the game
 * instead of leaving a half-AI, half-human run in flight. The choice is kept in
 * localStorage and can be forced per-link with `?mode=human`.
 */

export type PlayMode = 'ai' | 'human';

const STORAGE_KEY = 'promptDefense.mode';

function safeStorage(): Storage | null {
    try {
        // Access can throw in private mode / sandboxed iframes.
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (e) {
        return null;
    }
}

/** `?mode=` wins so a demo link can force a mode; otherwise the saved choice. */
export function readPlayMode(search: string, store: Storage | null): PlayMode {
    const match = /[?&]mode=(ai|human)(?:&|$)/.exec(search || '');
    if (match) return match[1] as PlayMode;

    try {
        const stored = store ? store.getItem(STORAGE_KEY) : null;
        if (stored === 'ai' || stored === 'human') return stored;
    } catch (e) {
        // Unreadable storage just means "no saved choice".
    }
    return 'ai';
}

/** Best-effort persistence; the URL param still carries the choice across reloads. */
export function writePlayMode(mode: PlayMode, store: Storage | null = safeStorage()): void {
    try {
        if (store) store.setItem(STORAGE_KEY, mode);
    } catch (e) {
        // Ignored: switching still works through `?mode=`.
    }
}

export function otherMode(mode: PlayMode): PlayMode {
    return mode === 'ai' ? 'human' : 'ai';
}

/** The URL to reload into `mode`, discarding the obsolete lane override. */
export function modeUrl(href: string, mode: PlayMode): string {
    const url = new URL(href);
    url.searchParams.delete('spawners');
    url.searchParams.set('mode', mode);
    return url.toString();
}

export const playMode: PlayMode = readPlayMode(
    typeof location !== 'undefined' ? location.search : '',
    safeStorage()
);

/** Switch modes and restart the game in the chosen one. */
export function switchPlayMode(mode: PlayMode = otherMode(playMode)): void {
    writePlayMode(mode);
    if (typeof location === 'undefined') return;
    location.assign(modeUrl(location.href, mode));
}
