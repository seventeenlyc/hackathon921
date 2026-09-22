import {canvas, ctx} from "./Canvas";
import {fps} from "./config.json";
import './Controls';
import {map} from "./Map";
import {camera} from "./Camera";
import {enemyManager} from "./EnemyManager";
import {munitionManager} from "./MunitionManager";
import {controls} from "./Controls";
import './InterfaceManager';
import {interfaceManager} from "./InterfaceManager";
import {waveManager} from "./WavesManager";
import {submitRunScore} from "./leaderboard/LeaderboardUI";
import {readUsernameCookie} from "./leaderboard/LeaderboardStore";
import {getSessionToken} from "./leaderboard/LeaderboardClient";
import {gameLoop, GameSpeed} from "./agent/GameLoop";
import {GameActions} from "./agent/GameActions";
import {InertBattlefield} from "./agent/InertBattlefield";
import {strategyStore} from "./agent/StrategyStore";
import {AgentRuntime} from "./agent/AgentRuntime";
import {formatSnapshot} from "./agent/snapshot";
import {decisionLog} from "./DecisionLog";
import {queueStrategy, startRun} from "./StrategyQueue";

class Game {
    private updateInterval: number = -1;
    private looping: boolean = true;

    constructor() {
        map.on('added', () => {
            enemyManager.updatePaths()
        });
        waveManager.onWaveReached = wave => this.recordReachedWave(wave);

        // Focus is a gate separate from the player's PAUSED state; losing focus
        // freezes the sim and spawning, regaining it continues (issue #17).
        controls.on('focusin', () => gameLoop.setFocused(true));
        controls.on('focusout', () => gameLoop.setFocused(false));
        gameLoop.setFocused(controls.tabHasFocus());

        // Entering PLANNING is the moment a queued prompt is locked in: the AI
        // plans the upcoming wave with exactly this version (issue #17).
        gameLoop.onChange(state => {
            if (state === 'planning') strategyStore.lock();
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
        ctx.restore();

        if (this.looping) {
            requestAnimationFrame(this.drawLoop.bind(this))
        }
    }

    gameOver() {
        setTimeout(() => {
            clearInterval(this.updateInterval);
            this.looping = false;
            interfaceManager.showGameOver();
            waveManager.looping = false;
            // 结算时再同步一次，以覆盖输入用户名或停止波次循环的边界时刻。
            this.recordReachedWave();
        }, 100)
    }
}

const actions = new GameActions(new InertBattlefield());

const agentRuntime = new AgentRuntime({
    actions,
    store: strategyStore,
    fetchImpl: (input, init) => fetch(input, init),
    // The server requires a valid session; the leaderboard client owns it.
    getToken: () => getSessionToken(),
    onDecision: entry => decisionLog.add(entry),
    onError: message => decisionLog.error(message),
});

// The AI plays through the same action port as the human console; the loop calls
// it once per PLANNING round (issue #25).
waveManager.setPlanner(agentRuntime);

export const game = new Game();

/**
 * Programmatic control surface (issue #2). Everything the AI is allowed to do
 * is reachable here without touching the mouse, which is what makes the game
 * AI-drivable and testable from the browser console:
 *
 *   promptDefense.actions.getState()
 *   promptDefense.actions.buildTower('canon', 10, 10)
 *   promptDefense.start(); promptDefense.pause(); promptDefense.resume()
 *   promptDefense.setSpeed(2)
 */
(window as any).promptDefense = {
    actions,
    loop: gameLoop,
    strategy: strategyStore,
    agent: agentRuntime,
    start: () => startRun(),
    pause: () => gameLoop.pause(),
    resume: () => gameLoop.resume(),
    setSpeed: (speed: GameSpeed) => gameLoop.setSpeed(speed),
    setStrategy: (text: string) => queueStrategy(text),
    // Debug view (issue #4): what the AI actually observed this round.
    state: () => actions.getState(),
    stateText: () => formatSnapshot(actions.getState()),
};
