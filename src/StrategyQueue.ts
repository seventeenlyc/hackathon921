import {gameLoop} from './agent/GameLoop';
import {effectiveWave, strategyStore, StrategyVersion} from './agent/StrategyStore';
import {waveManager} from './WavesManager';
import {getSessionUsername} from './leaderboard/SessionIdentity';
import {playMode} from './PlayMode';
import {runSync} from './leaderboard/RunSync';
import {audioManager} from './AudioManager';
import {cashManager} from './CashManager';
import {interfaceManager} from './InterfaceManager';
import {devController, DEV_MAX_START_WAVE, DEV_MAX_START_CASH} from './dev';

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

/**
 * Apply the dev starting wave/cash to the engine. Only safe while IDLE: once a
 * wave is generating the waveCounter must not be touched (see AGENTS.md).
 * Values are re-validated here on the engine side — client state is untrusted.
 */
function applyDevConfigIfIdle(): void {
    if (!devController.isUnlocked) return;
    if (!gameLoop.isIdle()) return;
    const cfg = devController.getConfig();
    if (!Number.isInteger(cfg.startWave) || cfg.startWave < 1 || cfg.startWave > DEV_MAX_START_WAVE) return;
    if (!Number.isInteger(cfg.startCash) || cfg.startCash < 0 || cfg.startCash > DEV_MAX_START_CASH) return;
    waveManager.waveCounter = cfg.startWave;
    cashManager.setBalance(cfg.startCash);
    interfaceManager.setWave(cfg.startWave);
}

// Any dev config change (unlock, or editing wave/cash) is reflected into the
// engine immediately while IDLE, so the prompt's fromWave and the wave display
// already read the chosen wave before the player presses start.
devController.onChange(applyDevConfigIfIdle);

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
    if (playMode === 'ai' && !getSessionUsername()) return;

    // Defensive: make sure any dev starting wave/cash is applied to the engine
    // before the run begins. The onChange subscriber already does this, but we
    // re-apply at the gate so a run can never start on stale engine state.
    applyDevConfigIfIdle();

    // Apply the opening prompt BEFORE the loop can plan wave 1, so the run never
    // starts on the previous/empty version. `activateForRun` returns null when
    // there is no prompt, in which case the run refuses to start (§5).
    const openingPrompt = strategyStore.activateForRun();
    if (!openingPrompt) return;

    audioManager.setWave(waveManager.waveCounter);
    audioManager.startMusic();
    // 开发对局不计入排行榜：客户端跳过 RunSync/成绩提交；服务端 dev_sessions
    // 表是最终保险——即便客户端伪造，POST /api/runs 也会被拒 403。
    if (playMode === 'ai' && !devController.isUnlocked) {
        const username = getSessionUsername()!;
        runSync.prepareRun(username, 'ai');
        // The opening version was activated while IDLE, before Game's PLANNING
        // listener can observe a version change. Record it explicitly per run.
        runSync.enqueuePrompt(username, openingPrompt);
    }
    gameLoop.start();
    void waveManager.start();
}
