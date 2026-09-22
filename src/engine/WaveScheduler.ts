import {TICK_RATE, msToTicks} from './clock';
import type {GameLoop, Planner} from '../agent/GameLoop';
import type {EngineWorld} from './world';
import type {GameMap} from './GameMap';
import type {Enemies} from './Enemies';
import type {Rng} from './Rng';
import type {Base} from './entities/Base';
import type {Enemy} from './entities/Enemy';
import {
    ArmoredEnemy,
    BossEnemy,
    FastEnemy,
    HealerEnemy,
    SimpleEnemy,
} from './entities/enemies';

interface WaveGroup {
    enemyClass: new (base: Base, world: EngineWorld) => Enemy;
    enemySpecsMultiplier?: { [k: string]: number };
    quantity: number;
    delay: number;
}

type Wave = WaveGroup[];

interface SpawnEvent {
    dueTick: number;
    enemyClass: WaveGroup['enemyClass'];
    multiplier: WaveGroup['enemySpecsMultiplier'];
    base: Base;
}

export interface WaveSchedulerDeps {
    rng: Rng;
    map: GameMap;
    enemies: Enemies;
    world: EngineWorld;
    loop: GameLoop;
    /** Human mode's fixed pause between waves; 0 in AI mode. */
    interWaveDelayMs: number;
    /** Applies a queued lane change at the boundary, before the planner sees the map. */
    applyPendingSpawnCount: () => boolean;
    onWaveReached: (wave: number) => void;
    /** Optional: whole-second countdown for a host that renders it. */
    onCountdown?: (seconds: number) => void;
}

type Phase = 'idle' | 'countdown' | 'planning' | 'spawning' | 'stopped';

/** Immediate planner, used until a real one is attached. */
const immediatePlanner: Planner = {plan: () => Promise.resolve()};

/**
 * The tick-driven wave loop.
 *
 * The browser build drove waves with an async `while` loop that awaited
 * `GameLoop.sleep(delay)`, i.e. real elapsed time. That is exactly what made
 * spawning drift independently of the 30 Hz simulation and would break the
 * moment the engine ran on a server. Here the whole cycle is expressed in ticks:
 * spawning is a queue of "spawn this enemy at tick N" events, the inter-wave
 * pause is a tick countdown, and the only asynchronous step left is the planner,
 * which is allowed to freeze the clock because an LLM call is not simulation.
 *
 * Wave generation reads the seeded `Rng`, and the order of the random draws is
 * kept identical to the original so the same seed produces the same waves.
 */
export class WaveScheduler {
    public waveCounter = 1;
    public looping = true;

    private readonly deps: WaveSchedulerDeps;
    private planner: Planner = immediatePlanner;
    private phase: Phase = 'idle';
    private started = false;

    private spawnQueue: SpawnEvent[] = [];
    private spawnIndex = 0;
    private spawnEndTick = 0;
    private lastTick = 0;

    private countdownTicks = 0;
    private countdownSeconds = 0;

    constructor(deps: WaveSchedulerDeps) {
        this.deps = deps;
    }

    /** Attach the AI/human planner. Called before `start()`. */
    setPlanner(planner: Planner) {
        this.planner = planner;
    }

    /** True while a wave's enemies are still being scheduled out. */
    isSpawning(): boolean {
        return this.phase === 'spawning';
    }

    start() {
        if (this.started) return;
        this.started = true;
        this.beginWaveCycle();
    }

    stop() {
        this.looping = false;
        this.phase = 'stopped';
        this.spawnQueue = [];
        this.spawnIndex = 0;
    }

    /** Advance the wave loop by one simulation tick. Called at the end of `GameEngine.tick()`. */
    onTick(tick: number) {
        this.lastTick = tick;
        if (!this.looping) return;

        if (this.phase === 'countdown') {
            this.countdownTicks -= 1;

            const seconds = Math.ceil(Math.max(0, this.countdownTicks) / TICK_RATE);
            if (seconds !== this.countdownSeconds) {
                this.countdownSeconds = seconds;
                if (this.deps.onCountdown) this.deps.onCountdown(seconds);
            }

            if (this.countdownTicks <= 0) {
                this.beginPlanning();
            }
            return;
        }

        if (this.phase === 'spawning') {
            while (this.spawnIndex < this.spawnQueue.length && this.spawnQueue[this.spawnIndex].dueTick <= tick) {
                this.spawn(this.spawnQueue[this.spawnIndex]);
                this.spawnIndex += 1;
            }

            // The old loop fired onWaveReached after the trailing delay of the
            // last group, not right after its last enemy.
            if (this.spawnIndex >= this.spawnQueue.length && tick >= this.spawnEndTick) {
                this.endWave();
            }
        }
    }

    private beginWaveCycle() {
        if (!this.looping) return;

        // Lane changes land here, before the planner, so the AI's snapshot for the
        // upcoming wave already reflects the new route.
        this.deps.applyPendingSpawnCount();

        if (this.deps.interWaveDelayMs > 0 && this.waveCounter > 1) {
            this.phase = 'countdown';
            this.countdownTicks = msToTicks(this.deps.interWaveDelayMs);
            this.countdownSeconds = Math.ceil(this.countdownTicks / TICK_RATE);
            if (this.deps.onCountdown) this.deps.onCountdown(this.countdownSeconds);
            return;
        }

        this.beginPlanning();
    }

    private beginPlanning() {
        this.phase = 'planning';
        this.countdownTicks = 0;

        // holdForPlanning flips the loop to PLANNING (so the host stops ticking)
        // and back to RUNNING once the planner resolves. A late resolve after a
        // stop() must not schedule a wave.
        void this.deps.loop.holdForPlanning(this.planner).then(() => {
            if (!this.looping) {
                this.phase = 'stopped';
                return;
            }
            this.startWave();
        });
    }

    private startWave() {
        const wave = this.generateWave();
        const queue: SpawnEvent[] = [];
        let due = this.lastTick;

        for (let i = 0; i < wave.length; ++i) {
            const {enemyClass, enemySpecsMultiplier, quantity, delay} = wave[i];
            const gap = msToTicks(delay);

            // Mirrors the original nested loop exactly, including float quantities
            // (the loop simply runs one extra time for a fractional bound).
            for (let j = 0; j < quantity; ++j) {
                for (let k = 0; k < this.deps.map.enemyBases.length; ++k) {
                    queue.push({
                        dueTick: due,
                        enemyClass,
                        multiplier: enemySpecsMultiplier,
                        base: this.deps.map.enemyBases[k],
                    });
                }
                due += gap;
            }
        }

        this.spawnQueue = queue;
        this.spawnIndex = 0;
        this.spawnEndTick = due;
        this.phase = 'spawning';
    }

    private endWave() {
        this.deps.onWaveReached(this.waveCounter);
        this.waveCounter += 1;
        this.spawnQueue = [];
        this.spawnIndex = 0;
        this.beginWaveCycle();
    }

    private spawn(event: SpawnEvent) {
        this.deps.enemies.add(this.enemyFactory(event.enemyClass, event.multiplier, event.base));
    }

    private enemyFactory(
        enemyClass: WaveGroup['enemyClass'],
        enemySpecsMultiplier: WaveGroup['enemySpecsMultiplier'],
        base: Base
    ): Enemy {
        const enemy = new enemyClass(base, this.deps.world);

        if (enemySpecsMultiplier) {
            for (const [specKey, specMultiplier] of Object.entries(enemySpecsMultiplier)) {
                (enemy as any)[specKey] *= specMultiplier;
            }
        }
        return enemy;
    }

    /**
     * Wave composition. Ported one-to-one from `WavesManager.generateWave`; the
     * random draws happen in the same order as the original.
     */
    private generateWave(): Wave {
        const wave: Wave = [];
        const ratio = 1 + this.waveCounter / 10;
        const rng = this.deps.rng;

        if (this.waveCounter % 8 === 0) {
            wave.push({
                enemyClass: BossEnemy,
                enemySpecsMultiplier: {life: ratio},
                quantity: this.waveCounter / 10,
                delay: 350,
            });

            if (rng.above(0.6)) {
                wave.push({
                    enemyClass: HealerEnemy,
                    enemySpecsMultiplier: {life: ratio},
                    quantity: 1 + rng.range(0, this.waveCounter / 10),
                    delay: 350,
                });
            }
        } else if (this.waveCounter < 4) {
            wave.push({
                enemyClass: SimpleEnemy,
                enemySpecsMultiplier: {life: ratio},
                quantity: 9 + this.waveCounter,
                delay: 500,
            });
        } else {
            if (rng.above(0.7)) {
                wave.push({
                    enemyClass: FastEnemy,
                    enemySpecsMultiplier: {
                        life: ratio,
                        speed: Math.min(1 + this.waveCounter / 30, 1.7),
                    },
                    quantity: 2 + this.waveCounter / 5,
                    delay: 200,
                });
            }

            if (rng.above(0.6)) {
                const quantity = 10 + this.waveCounter;
                const split = rng.range(0, quantity / 3);

                for (let i = 0; i < split; ++i) {
                    wave.push({
                        enemyClass: ArmoredEnemy,
                        enemySpecsMultiplier: {
                            life: ratio,
                            speed: Math.min(1 + this.waveCounter / 30, 1.5),
                        },
                        quantity: quantity / split,
                        delay: Math.max(500 - this.waveCounter, 100),
                    });

                    wave.push({
                        enemyClass: HealerEnemy,
                        enemySpecsMultiplier: {
                            life: ratio,
                            speed: Math.min(1 + this.waveCounter / 30, 1.5),
                        },
                        quantity: 1,
                        delay: Math.max(400 - this.waveCounter, 100),
                    });
                }
            } else {
                wave.push({
                    enemyClass: ArmoredEnemy,
                    enemySpecsMultiplier: {
                        life: ratio,
                        speed: Math.min(1 + this.waveCounter / 30, 1.5),
                    },
                    quantity: 10 + this.waveCounter,
                    delay: Math.max(500 - this.waveCounter, 100),
                });
            }
        }

        return wave;
    }
}
