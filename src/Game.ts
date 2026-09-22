import {canvas, ctx} from "./Canvas";
import {fps} from "./config.json";
import './Controls';
import {map} from "./Map";
import {camera} from "./Camera";
import {enemyManager} from "./EnemyManager";
import {munitionManager} from "./MunitionManager";
import {controls} from "./Controls";
import {towerPlacer} from "./TowerPlacer";
import './InterfaceManager';
import {interfaceManager} from "./InterfaceManager";
import {waveManager} from "./WavesManager";
import {submitRunScore} from "./leaderboard/LeaderboardUI";
import {readUsernameCookie} from "./leaderboard/LeaderboardStore";
import {gameLoop, GameSpeed} from "./agent/GameLoop";
import {GameActions} from "./agent/GameActions";
import {InertBattlefield} from "./agent/InertBattlefield";

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

        this.start()
    }

    recordReachedWave(wave: number = waveManager.waveCounter) {
        const username = readUsernameCookie();
        if (username) submitRunScore(username, wave);
    }

    start() {
        this.updateInterval = setInterval(this.updateLoop.bind(this), 1000 / fps);
        requestAnimationFrame(this.drawLoop.bind(this));
        waveManager.start();
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
            interfaceManager.showGameOver();
            waveManager.looping = false;
            // 结算时再同步一次，以覆盖输入用户名或停止波次循环的边界时刻。
            this.recordReachedWave();
        }, 100)
    }
}

export const game = new Game();

/**
 * Programmatic control surface (issue #2). Everything the AI is allowed to do
 * is reachable here without touching the mouse, which is what makes the game
 * AI-drivable and testable from the browser console:
 *
 *   promptDefense.actions.getState()
 *   promptDefense.actions.buildTower('canon', 10, 10)
 *   promptDefense.pause(); promptDefense.resume(); promptDefense.setSpeed(2)
 */
const actions = new GameActions(new InertBattlefield());

(window as any).promptDefense = {
    actions,
    loop: gameLoop,
    pause: () => gameLoop.pause(),
    resume: () => gameLoop.resume(),
    setSpeed: (speed: GameSpeed) => gameLoop.setSpeed(speed),
};
