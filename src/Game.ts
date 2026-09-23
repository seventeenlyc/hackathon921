import {canvas, ctx} from "./Canvas";
import {fps} from "./config.json";
import './Controls';
import {map} from "./Map";
import {camera} from "./Camera";
import {enemyManager} from "./EnemyManager";
import {munitionManager} from "./MunitionManager";
import {towerPlacer} from "./TowerPlacer";
import './InterfaceManager';
import {interfaceManager} from "./InterfaceManager";
import {waveManager} from "./WavesManager";
import {submitRunScore} from "./leaderboard/LeaderboardUI";
import {getSessionUsername} from "./leaderboard/SessionIdentity";
import {runSync} from "./leaderboard/RunSync";
import {audioManager} from "./AudioManager";
import {getSessionToken, fetchSharedLeaderboard} from "./leaderboard/LeaderboardClient";
import {cashManager} from "./CashManager";
import {Tower} from "./entities/towers/Tower";
import type {RunStats} from "./InterfaceManager";
import {t} from "./i18n";
import {gameLoop, GameSpeed} from "./agent/GameLoop";
import {GameActions} from "./agent/GameActions";
import {InertBattlefield} from "./agent/InertBattlefield";
import {strategyStore} from "./agent/StrategyStore";
import {AgentRuntime} from "./agent/AgentRuntime";
import {formatSnapshot} from "./agent/snapshot";
import {decisionLog} from "./DecisionLog";
import {DecisionSummary} from "./DecisionSummary";
import {queueStrategy, startRun} from "./StrategyQueue";
import {humanPlanner} from "./WavesManager";
import {playMode, switchPlayMode} from "./PlayMode";
import {naturalOilController} from "./items/NaturalOil";
import {tacticalItemsController} from "./items/TacticalItems";

// Settlement stats gathered across the run (see the result screen).
let runStartedAt: number | null = null;
let decisionsMade = 0;
function createDecisionSummary(): DecisionSummary | null {
    if (typeof document === 'undefined') return null;
    const panel = document.getElementById('decision-summary-panel');
    const status = document.getElementById('decision-summary-status');
    const content = document.getElementById('decision-summary');
    return panel && status && content ? new DecisionSummary(panel, status, content) : null;
}
const decisionSummary = createDecisionSummary();

class Game {
    private updateInterval: number = -1;
    private looping: boolean = true;
    private lastSoundWave = 0;
    private gameOverScheduled = false;

    constructor() {
        tacticalItemsController.setContext({
            enemyManager,
            homeBase: map.homeBase,
        });
        map.on('added', () => {
            enemyManager.updatePaths()
        });
        // Human-mode runs are not leaderboard entries: the board compares AI
        // strategies, so a hand-played wave would not be comparable (see §9).
        waveManager.onWaveReached = wave => this.recordReachedWave(wave);

        // The run keeps going when the window loses focus — the player may want to
        // look elsewhere while the AI plays; the run ends only when the base falls.
        // Entering PLANNING is the moment a queued prompt is locked in: the AI
        // plans the upcoming wave with exactly this version (issue #17).
        gameLoop.onChange(state => {
            if (state === 'planning') {
                if (playMode === 'ai') decisionSummary?.setThinking(t('reasoning.status.planning'));
                const before = strategyStore.active().version;
                const active = strategyStore.lock();
                const username = getSessionUsername();
                if (username && active.version !== before && active.text.trim()) {
                    runSync.enqueuePrompt(username, active);
                }
            }
            if (state === 'running' && runStartedAt === null) runStartedAt = Date.now();
        });

        this.start()
    }

    recordReachedWave(wave: number = waveManager.waveCounter) {
        if (wave > this.lastSoundWave) {
            this.lastSoundWave = wave;
            audioManager.playWaveReached();
            audioManager.setWave(wave + 1);
        }
        const username = getSessionUsername();
        if (username) submitRunScore(username, wave, playMode);
    }

    start() {
        this.updateInterval = window.setInterval(this.updateLoop.bind(this), 1000 / fps);
        requestAnimationFrame(this.drawLoop.bind(this));
        // The run itself is not started here: the game opens in IDLE so the player
        // can write the opening prompt first. `promptDefense.start()` (or the
        // strategy panel's Start button) begins the run, and the wave manager
        // opens a PLANNING window before wave 1.
    }

    updateLoop() {
        // Camera input remains live while the simulation is idle or paused, so
        // players can inspect the whole map before starting a run.
        camera.update();
        if (!gameLoop.isStepping()) return;

        // Fast mode advances the deterministic simulation more times per real
        // frame instead of changing the tick rate, so entity maths is untouched.
        for (let step = 0; step < gameLoop.speed; ++step) {
            naturalOilController.update(1000 / fps, gameLoop.state === 'running');
            tacticalItemsController.update(1000 / fps, gameLoop.state === 'running');
            map.update();
            munitionManager.update()
            enemyManager.update()
            if (playMode === 'human') towerPlacer.update();
        }
        interfaceManager.updateNaturalOil();
    }

    drawLoop() {
        ctx.save();
        canvas.clear();
        camera.process(ctx);

        map.drawGrid(ctx);
        munitionManager.draw(ctx);
        enemyManager.draw(ctx);
        map.draw(ctx);
        if (playMode === 'human') towerPlacer.draw(ctx);
        ctx.restore();

        if (this.looping) {
            requestAnimationFrame(this.drawLoop.bind(this))
        }
    }

    gameOver() {
        if (this.gameOverScheduled) return;
        this.gameOverScheduled = true;
        window.setTimeout(() => {
            clearInterval(this.updateInterval);
            this.looping = false;
            waveManager.looping = false;
            audioManager.playGameOver();

            const wave = waveManager.waveCounter;
            // 结算时再同步一次，以覆盖停止波次循环的边界时刻。
            this.recordReachedWave(wave);
            runSync.retryPending();

            interfaceManager.showGameOver(this.collectStats(wave));

            // 名次以服务端为准，异步补齐；拿不到就保持 “—”。
            const username = getSessionUsername();
            if (username) {
                void fetchSharedLeaderboard(username, playMode).then(result => {
                    interfaceManager.setResultRank(result && result.me ? result.me.rank : null);
                });
            }
        }, 100)
    }

    private collectStats(wave: number): RunStats {
        const byType = new Map<string, number>();
        let total = 0;

        for (let i = 0; i < map.grid.length; ++i) {
            for (let j = 0; j < map.grid[i].length; ++j) {
                const cell = map.grid[i][j];
                if (cell instanceof Tower) {
                    total += 1;
                    // Group by the stable protocol type, not the localized display
                    // name, so the breakdown is consistent across languages.
                    byType.set(cell.towerType, (byType.get(cell.towerType) || 0) + 1);
                }
            }
        }

        return {
            wave,
            towers: {
                total,
                byType: Array.from(byType.entries())
                    .map(([type, count]) => ({type, count}))
                    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
            },
            cash: cashManager.getBalance(),
            decisions: decisionsMade,
            durationMs: runStartedAt === null ? 0 : Date.now() - runStartedAt,
            rank: null,
        };
    }
}

const actions = new GameActions(new InertBattlefield());
// Keep the module boundary tolerant of lightweight test doubles from the
// leaderboard suite while the real TowerPlacer receives the same validated
// action port as the AI runtime.
if (typeof towerPlacer.setActions === 'function') towerPlacer.setActions(actions);

const agentRuntime = new AgentRuntime({
    actions,
    store: strategyStore,
    fetchImpl: (input, init) => fetch(input, init),
    // The server requires a valid session; the leaderboard client owns it.
    getToken: () => getSessionToken(),
    onDecision: entry => {
        decisionLog.add(entry);
        decisionsMade += 1;
    },
    onSummary: summary => {
        if (summary) decisionSummary?.setSummary(summary, t('reasoning.status.ready'));
        else decisionSummary?.setUnavailable(t('reasoning.status.unavailable'));
    },
    onError: message => {
        decisionSummary?.setUnavailable(t('reasoning.status.unavailable'));
        decisionLog.error(message);
    },
});

// The AI plays through the same action port as the human console; the loop calls
// it once per PLANNING round (issue #25). In human mode there is no AI planner at
// all and the wave manager uses a fixed pause instead.
waveManager.setPlanner(playMode === 'ai' ? agentRuntime : humanPlanner);

/** Old inert `delayBetweenWaves`: human mode needs a real break between waves. */
const HUMAN_INTER_WAVE_MS = 7000;
waveManager.setInterWaveDelay(playMode === 'human' ? HUMAN_INTER_WAVE_MS : 0);

export const game = new Game();

export function startHumanRun(username: string): void {
    if (!gameLoop.isIdle()) return;
    audioManager.startMusic();
    runSync.prepareRun(username, 'human');
    gameLoop.start();
    void waveManager.start();
}

/**
 * Programmatic control surface (issue #2). Everything the AI is allowed to do
 * is reachable here without touching the mouse, which is what makes the game
 * AI-drivable and testable from the browser console:
 *
 *   promptDefense.actions.getState()
 *   promptDefense.actions.buildTower('canon', 10, 10)
 *   promptDefense.start(); promptDefense.pause(); promptDefense.setMode('human')
 *   promptDefense.setSpeed(2)
 */
(window as any).promptDefense = {
    actions,
    loop: gameLoop,
    strategy: strategyStore,
    agent: agentRuntime,
    mode: playMode,
    setMode: (mode: 'ai' | 'human') => switchPlayMode(mode),
    start: () => startRun(),
    pause: () => gameLoop.pause(),
    resume: () => gameLoop.resume(),
    setSpeed: (speed: GameSpeed) => gameLoop.setSpeed(speed),
    setStrategy: (text: string) => queueStrategy(text),
    // Debug view (issue #4): what the AI actually observed this round.
    state: () => actions.getState(),
    stateText: () => formatSnapshot(actions.getState()),
};
