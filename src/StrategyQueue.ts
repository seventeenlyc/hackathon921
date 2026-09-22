import {gameControl} from './net/gameControl';
import {gameLoop} from './agent/GameLoop';
import {effectiveWave, strategyStore, StrategyVersion} from './agent/StrategyStore';

/**
 * Glue between the UI and the hosted game's prompt API.
 *
 * The server owns prompt versioning now; the local `StrategyStore` is kept as a
 * mirror so the panel's "queued / effective wave" line stays truthful.
 */

/** Wave a submission made right now would become active at. */
export function effectiveWaveForNow(): number {
    return effectiveWave(gameControl.session.wave, gameLoop.isIdle());
}

/** Queue `text` locally for the status line and submit it to the server. */
export function queueStrategy(text: string): StrategyVersion {
    const version = strategyStore.submit(text, effectiveWaveForNow());
    void gameControl.session.submitStrategy(text).catch(() => undefined);
    return version;
}

/**
 * Player-initiated start. A run cannot start without a prompt, and the hosted
 * game must exist first (main.ts opens it once a token is available).
 */
export function startRun(): void {
    if (!gameLoop.isIdle()) return;

    const pending = strategyStore.queued();
    const text = (pending ? pending.text : strategyStore.active().text).trim();
    if (!text) return;
    if (!gameControl.session.id) return;

    strategyStore.lock();
    void gameControl.session.start().catch(() => undefined);
}
