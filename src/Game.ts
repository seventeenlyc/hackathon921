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
import {readUsernameCookie} from "./leaderboard/LeaderboardStore";
import {getSessionToken, fetchSharedLeaderboard} from "./leaderboard/LeaderboardClient";
import {cashManager} from "./CashManager";
import {Tower} from "./entities/towers/Tower";
import type {RunStats} from "./InterfaceManager";
import {gameLoop, GameSpeed} from "./agent/GameLoop";
import {GameActions} from "./agent/GameActions";
import {InertBattlefield} from "./agent/InertBattlefield";
import {strategyStore} from "./agent/StrategyStore";
import {AgentRuntime} from "./agent/AgentRuntime";
import {formatSnapshot} from "./agent/snapshot";
import {decisionLog} from "./DecisionLog";
import {queueStrategy, startRun} from "./StrategyQueue";
import {humanPlanner} from "./WavesManager";
import {playMode, switchPlayMode} from "./PlayMode";

// Settlement stats gathered across the run (see the result screen).
let runStartedAt: number | null = null;
let decisionsMade = 0;

class Game {
    private updateInterval: number = -1;
    private looping: boolean = true;

    constructor() {
        map.on('added', () => {
            enemyManager.updatePaths()
        });
        // Human-mode runs are not leaderboard entries: the board compares AI
        // strategies, so a hand-played wave would not be comparable (see §9).
        if (playMode === 'ai') {
            waveManager.onWaveReached = wave => this.recordReachedWave(wave);
        }

        // The run keeps going when the window loses focus — the player may want to
        // look elsewhere while the AI plays; the run ends only when the base falls.
        // Entering PLANNING is the moment a queued prompt is locked in: the AI
        // plans the upcoming wave with exactly this version (issue #17).
        gameLoop.onChange(state => {
            if (state === 'planning') strategyStore.lock();
            if (state === 'running' && runStartedAt === null) runStartedAt = Date.now();
        });

        this.start()
    }

    recordReachedWave(wave: number = waveManager.waveCounter) {
        const username = readUsernameCookie();
        if (username) submitRunScore(username, wave);
    }

    start() {
        this.updateInterval = setInterval(this.updateLoop.bind(this), 1000 / fps);
        requestAnimationFrame(this.drawLoop.bind(this));
        // The run itself is not started here: the game opens in IDLE so the player
        // can write the opening prompt first. `promptDefense.start()` (or the
        // strategy panel's Start button) begins the run, and the wave manager
        // opens a PLANNING window before wave 1.
    }

    updateLoop() {
        if (!gameLoop.isStepping()) return;

        // Fast mode advances the deterministic simulation more times per real
        // frame instead of changing the tick rate, so entity maths is untouched.
        for (let step = 0; step < gameLoop.speed; ++step) {
            camera.update();
            map.update();
            munitionManager.update()
            enemyManager.update()
            towerPlacer.update()
        }
    }

    drawLoop() {
        ctx.save();
        canvas.clear();
        camera.process(ctx);

        map.drawGrid(ctx);
        munitionManager.draw(ctx);
        enemyManager.draw(ctx);
        map.draw(ctx);
        towerPlacer.draw(ctx);
        ctx.restore();

        if (this.looping) {
            requestAnimationFrame(this.drawLoop.bind(this))
        }
    }

    gameOver() {
        setTimeout(() => {
            clearInterval(this.updateInterval);
            this.looping = false;
            waveManager.looping = false;

            const wave = waveManager.waveCounter;
            // 结算时再同步一次，以覆盖停止波次循环的边界时刻。人类模式不入榜。
            if (playMode === 'ai') this.recordReachedWave(wave);

            interfaceManager.showGameOver(this.collectStats(wave));

            // 名次以服务端为准，异步补齐；拿不到就保持 “—”。
            const username = readUsernameCookie();
            if (username && playMode === 'ai') {
                void fetchSharedLeaderboard(username).then(result => {
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
                    byType.set(cell.name, (byType.get(cell.name) || 0) + 1);
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
    onError: message => decisionLog.error(message),
});

// The AI plays through the same action port as the human console; the loop calls
// it once per PLANNING round (issue #25). In human mode there is no AI planner at
// all and the wave manager uses a fixed pause instead.
waveManager.setPlanner(playMode === 'ai' ? agentRuntime : humanPlanner);

/** Old inert `delayBetweenWaves`: human mode needs a real break between waves. */
const HUMAN_INTER_WAVE_MS = 7000;
waveManager.setInterWaveDelay(playMode === 'human' ? HUMAN_INTER_WAVE_MS : 0);

export const game = new Game();

// Human mode is the original inert experience: it plays as soon as it loads.
// AI mode stays in IDLE until the player writes a prompt and presses Start.
if (playMode === 'human') {
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
