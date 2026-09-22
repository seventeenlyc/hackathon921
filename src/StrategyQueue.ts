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
    return effectiveWave(waveManager.waveCounter, gameLoop.state === 'planning');
}

/** Queue `text` for the boundary it can still affect. */
export function queueStrategy(text: string): StrategyVersion {
    return strategyStore.submit(text, effectiveWaveForNow());
}
