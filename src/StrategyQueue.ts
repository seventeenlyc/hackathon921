import {gameLoop} from './agent/GameLoop';
import {effectiveWave, strategyStore, StrategyVersion} from './agent/StrategyStore';
import {waveManager} from './WavesManager';

/**
 * Glue between the live game and the versioned strategy store.
 *
 * It exists so the wave arithmetic has exactly one home: the input panel and the
 * programmatic control surface both queue through here instead of each deciding
 * when a submission takes effect.
 */

/** Wave a submission made right now would become active at. */
export function effectiveWaveForNow(): number {
    return effectiveWave(waveManager.waveCounter, gameLoop.isIdle());
}

/** Queue `text` for the boundary it can still affect. */
export function queueStrategy(text: string): StrategyVersion {
    return strategyStore.submit(text, effectiveWaveForNow());
}

/**
 * Player-initiated start of the run. The game stays frozen in IDLE until this is
 * called, which is what gives the player time to write the opening prompt; the
 * wave manager then opens a PLANNING window before wave 1, so the AI plays from
 * the very first wave rather than only from wave 2 onwards.
 *
 * Without a prompt there is nothing for the AI to play, so the run refuses to
 * start (docs/PRODUCT_CONCEPT.md §5).
 */
export function startRun(): void {
    if (!gameLoop.isIdle()) return;

    const pending = strategyStore.queued();
    const text = (pending ? pending.text : strategyStore.active().text).trim();
    if (!text) return;

    gameLoop.start();
    void waveManager.start();
}
