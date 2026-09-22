import {initialBalance} from '../config.json';
import {Rng} from './Rng';
import {Cash} from './Cash';
import {Enemies} from './Enemies';
import {Munitions} from './Munitions';
import {GameMap} from './GameMap';
import type {EngineWorld} from './world';
import {GameLoop} from '../agent/GameLoop';
import type {GameSpeed, GameState, Planner, StateListener} from '../agent/GameLoop';
import {SpawnSettings} from '../agent/SpawnSettings';
import {WaveScheduler} from './WaveScheduler';

/** The loop's states plus the terminal `over` state the engine adds itself. */
export type EngineState = GameState | 'over';

export interface GameEngineOptions {
    /** Seed for this run's random decisions. Same seed + same actions = same battle. */
    seed: number;
    /** Number of spawn lanes (the browser read this from `?spawners=`). Defaults to 2. */
    difficulty?: number;
    /** Fixed pause between waves, in simulated milliseconds. Human mode uses 7000; AI mode 0. */
    interWaveDelayMs?: number;
    /** Starting cash; defaults to the shared `config.json` value. */
    initialCash?: number;
}

/**
 * One self-contained game.
 *
 * Everything the battle needs — map, cash, enemies, munitions, wave loop and the
 * random generator — lives on this object rather than in module-level
 * singletons, so several engines can run side by side without sharing state and
 * the whole thing runs in a plain Node process with no DOM.
 *
 * The clock is explicit: the host calls `tick()` one simulation step at a time.
 * Pausing is simply not calling it; fast-forward is calling it more often. The
 * engine never reads the wall clock, which is what makes a run reproducible.
 */
export class GameEngine {
    readonly rng: Rng;
    readonly cash: Cash;
    readonly map: GameMap;
    readonly enemies: Enemies;
    readonly munitions: Munitions;
    readonly world: EngineWorld;
    readonly loop: GameLoop;
    readonly spawnSettings: SpawnSettings;
    readonly scheduler: WaveScheduler;
    readonly difficulty: number;

    private tickCount = 0;
    private over = false;
    private waveReachedCb: ((wave: number) => void) | null = null;
    private gameOverCb: (() => void) | null = null;
    private countdownCb: ((seconds: number) => void) | null = null;

    constructor(options: GameEngineOptions) {
        this.difficulty = options.difficulty === undefined ? 2 : options.difficulty;

        this.rng = new Rng(options.seed);
        this.cash = new Cash(options.initialCash === undefined ? initialBalance : options.initialCash);
        this.map = new GameMap(this.rng, this.difficulty);
        this.enemies = new Enemies();
        this.munitions = new Munitions();

        this.world = {
            map: this.map,
            enemies: this.enemies,
            munitions: this.munitions,
            cash: this.cash,
            damageBase: () => this.map.homeBase.handleDamage(),
        };

        this.map.setWorld(this.world);
        this.map.homeBase.onDestroyed = () => this.endGame();

        // Path changes (tower built, lane added) must re-route enemies already in
        // flight — the browser wired this in `Game`, the engine owns it here.
        this.map.on('added', () => this.enemies.updatePaths());

        this.loop = new GameLoop();
        this.spawnSettings = new SpawnSettings(
            count => this.map.setSpawnCount(count),
            () => this.map.enemyBases.length
        );
        this.scheduler = new WaveScheduler({
            rng: this.rng,
            map: this.map,
            enemies: this.enemies,
            world: this.world,
            loop: this.loop,
            interWaveDelayMs: options.interWaveDelayMs === undefined ? 0 : options.interWaveDelayMs,
            applyPendingSpawnCount: () => this.spawnSettings.applyPending(),
            onWaveReached: wave => {
                if (this.waveReachedCb) this.waveReachedCb(wave);
            },
            onCountdown: seconds => {
                if (this.countdownCb) this.countdownCb(seconds);
            },
        });
    }

    /** Ticks simulated so far. */
    get currentTick(): number {
        return this.tickCount;
    }

    get state(): EngineState {
        return this.over ? 'over' : this.loop.state;
    }

    get speed(): GameSpeed {
        return this.loop.speed;
    }

    get isOver(): boolean {
        return this.over;
    }

    /** The wave the scheduler is currently preparing or spawning. */
    get wave(): number {
        return this.scheduler.waveCounter;
    }

    isStepping(): boolean {
        return !this.over && this.loop.isStepping();
    }

    isIdle(): boolean {
        return this.loop.isIdle();
    }

    onChange(listener: StateListener) {
        this.loop.onChange(listener);
    }

    onWaveReached(cb: (wave: number) => void) {
        this.waveReachedCb = cb;
    }

    onGameOver(cb: () => void) {
        this.gameOverCb = cb;
    }

    onCountdown(cb: (seconds: number) => void) {
        this.countdownCb = cb;
    }

    /** Attach the planner (AI runtimes and the human no-op both implement `Planner`). */
    setPlanner(planner: Planner) {
        this.scheduler.setPlanner(planner);
    }

    /** Player intent: start the run from IDLE. Opens PLANNING before wave 1. */
    start() {
        this.loop.start();
        this.scheduler.start();
    }

    pause() {
        this.loop.pause();
    }

    resume() {
        this.loop.resume();
    }

    setSpeed(speed: GameSpeed) {
        this.loop.setSpeed(speed);
    }

    /** Queue a lane count for the next wave boundary; returns the clamped value. */
    requestSpawnCount(count: number): number {
        return this.spawnSettings.request(count);
    }

    /**
     * Advance the simulation by exactly one base tick.
     *
     * Order matches the browser update loop: grid (towers), munitions, enemies.
     * Spawns are fired at the END of the tick, so a freshly spawned enemy takes
     * its first step on the following tick — the same one-tick delay the async
     * spawn loop produced.
     */
    tick() {
        if (!this.isStepping()) return;

        this.tickCount += 1;
        this.map.update();
        this.munitions.update();
        this.enemies.update();
        this.scheduler.onTick(this.tickCount);
    }

    private endGame() {
        if (this.over) return;
        this.over = true;
        this.scheduler.stop();
        if (this.gameOverCb) this.gameOverCb();
    }
}
