import {enemyManager} from "./EnemyManager";
import {BossEnemy} from "./entities/enemies/BossEnemy";
import {map} from "./Map";
import {rand} from "./tools/helphers";
import {interfaceManager} from "./InterfaceManager";
import {Enemy} from "./entities/enemies/Enemy";
import {Base} from "./entities/terrain/Base";
import {SimpleEnemy} from "./entities/enemies/SimpleEnemy";
import {ArmoredEnemy} from "./entities/enemies/ArmoredEnemy";
import {FastEnemy} from "./entities/enemies/FastEnemy";
import {HealerEnemy} from "./entities/enemies/HealerEnemy";
import {gameLoop, Planner} from "./agent/GameLoop";
import {earlyWaveReliefFactor, waveLifeRatio, waveSpeedMultiplier} from "./tools/enemyScaling";
import {spawnCountForWave} from "./agent/SpawnRoutes";

interface WaveGroup {
    enemyClass: { new(base: Base): Enemy },
    enemySpecsMultiplier?: { [k: string]: any }
    quantity: number,
    delay: number
}

type Wave = WaveGroup[]

/**
 * Fallback planner, used only until the agent runtime plugs in via setPlanner.
 * It waits a short real moment so the PLANNING state is visible in the UI.
 *
 * It must use a plain timer, not `gameLoop.sleep`: the loop is frozen while
 * planning, so a `gameLoop.sleep` here would never elapse.
 */
const idlePlanner: Planner = {
    plan: () => new Promise(resolve => setTimeout(resolve, 500))
};

/**
 * Human mode: nobody plans, so the boundary resolves immediately. The pause
 * between waves is handled by `interWaveDelayMs`, not by a fake "thinking" time.
 */
export const humanPlanner: Planner = {
    plan: () => Promise.resolve()
};

/**
 * Story hook (issue #100). `Game.ts` supplies a `NarrativeDirector`; tests can
 * supply a light double. A null hook means "no narrative", which keeps the wave
 * loop identical to before for every caller that does not opt in.
 */
export interface WaveNarrative {
    beforeWave(wave: number): Promise<void>;
}

class WavesManager {
    public waveCounter = 1
    public looping = true;
    public onWaveReached: ((wave: number) => void) | null = null;
    public onWaveStarted: ((wave: number) => void) | null = null;
    private planner: Planner = idlePlanner;
    private started = false;
    private narrative: WaveNarrative | null = null;
    /** Breathing room between waves in human mode; 0 in AI mode. */
    private interWaveDelayMs = 0;

    constructor() {
    }

    /** The agent runtime plugs in here. */
    setPlanner(planner: Planner) {
        this.planner = planner;
    }

    /** Story scenes plug in here (issue #100). */
    setNarrative(narrative: WaveNarrative | null) {
        this.narrative = narrative;
    }

    /**
     * In human mode there is no AI latency to separate waves, so the caller gives
     * the player a fixed pause instead (the old `delayBetweenWaves`).
     */
    setInterWaveDelay(ms: number) {
        this.interWaveDelayMs = Math.max(0, ms);
    }

    /**
     * Drives the run. Called only when the player starts (docs/PRODUCT_CONCEPT.md
     * §7 IDLE); the guard makes a double start harmless.
     *
     * Every wave begins with a PLANNING window, including wave 1 — that is what
     * lets the AI act from the first wave instead of only from wave 2 onwards.
     */
    async start() {
        if (this.started) return;
        this.started = true;

        while (this.looping) {
            // Apply this wave's routes before planning so the agent sees them.
            map.setSpawnCount(spawnCountForWave(this.waveCounter));

            // Story beat for this boundary (issue #100). It runs while the
            // simulation is frozen, before the inter-wave countdown and before
            // PLANNING, so neither elapses behind the dialogue. `beforeWave`
            // itself decides whether a scene applies and whether it must wait
            // for the previous wave to be cleared.
            if (this.narrative) {
                await this.narrative.beforeWave(this.waveCounter);
                if (!this.looping) break;
            }

            // Human mode: a fixed pause between waves, since there is no AI think
            // time to create one. It elapses only while stepping, so PAUSE freezes
            // it like everything else. The countdown mirrors the original inert
            // `delayBetweenWaves` display.
            if (this.interWaveDelayMs > 0 && this.waveCounter > 1) {
                let remaining = Math.ceil(this.interWaveDelayMs / 1000);
                interfaceManager.setWaveDelay(remaining);

                while (remaining > 0 && this.looping) {
                    await gameLoop.sleep(1000);
                    if (!this.looping) break;
                    remaining -= 1;
                    if (remaining > 0) interfaceManager.setWaveDelay(remaining);
                }

                interfaceManager.clearWaveDelay();
                if (!this.looping) break;
            }

            // Freeze and let the planner issue orders for `waveCounter` before its
            // enemies exist. A wave boundary is the only place the AI may act.
            await gameLoop.holdForPlanning(this.planner);
            if (!this.looping) break;

            const wave = this.generateWave()
            let notifiedWaveStarted = false;
            for (let i = 0; i < wave.length; ++i) {
                if (!this.looping) break;
                let {enemyClass, enemySpecsMultiplier, quantity, delay} = wave[i];

                for (let j = 0; j < quantity; ++j) {
                    if (!this.looping) break;
                    for (let k = 0; k < map.enemyBases.length; ++k) {
                        if (!this.looping) break;
                        let base = map.enemyBases[k];
                        enemyManager.add(this.enemyFactory(enemyClass, enemySpecsMultiplier, base));
                    }
                    if (!notifiedWaveStarted && map.enemyBases.length > 0) {
                        notifiedWaveStarted = true;
                        this.onWaveStarted?.(this.waveCounter);
                    }
                    await gameLoop.sleep(delay)
                }
            }
            if (!this.looping) break;

            // The wave has begun spawning: count it, then advance to the next wave
            // so the UI shows the wave the following PLANNING window is preparing.
            // A stop (game over / shutdown) must not report a wave it never reached.
            if (this.onWaveReached) this.onWaveReached(this.waveCounter);
            if (!this.looping) break;
            interfaceManager.setWave(++this.waveCounter);
        }
    }

    enemyFactory<T extends Enemy, K extends keyof T>(enemyClass: { new(base: Base): T }, enemySpecsMultiplier: { [k: string]: any } | undefined, base: Base): Enemy {
        const enemy = new enemyClass(base);

        if (enemySpecsMultiplier) {
            for (const [specKey, specMultiplier] of Object.entries(enemySpecsMultiplier)) {
                (<any>enemy[<K>specKey]) *= specMultiplier;
            }
        }

        // Keep elite-wave bosses at their effective wave-152 life and speed.
        const relief = earlyWaveReliefFactor(this.waveCounter, enemy instanceof BossEnemy);
        enemy.life *= relief;
        enemy.speed *= relief;

        return enemy;
    }

    private generateWave(): Wave {
        const wave = [];
        const ratio = waveLifeRatio(this.waveCounter);
        const bossRatio = this.waveCounter >= 201 ? waveLifeRatio(152) : ratio;

        if (this.waveCounter >= 201) {
            wave.push({
                enemyClass: BossEnemy,
                enemySpecsMultiplier: {
                    life: bossRatio,
                },
                quantity: 10 + this.waveCounter,
                delay: Math.max(500 - this.waveCounter, 100)
            });

            return wave;
        }

        if (this.waveCounter % 8 === 0) {
            wave.push({
                enemyClass: BossEnemy,
                enemySpecsMultiplier: {
                    life: ratio,
                },
                quantity: this.waveCounter / 10,
                delay: 350
            })

            if (Math.random() > 0.6) {
                wave.push({
                    enemyClass: HealerEnemy,
                    enemySpecsMultiplier: {
                        life: ratio,
                    },
                    quantity: 1 + rand(0, this.waveCounter / 10),
                    delay: 350
                })
            }
        } else if (this.isOnWave({below: 4})) {
            wave.push({
                enemyClass: SimpleEnemy,
                enemySpecsMultiplier: {
                    life: ratio
                },
                quantity: 9 + this.waveCounter,
                delay: 500
            })
        } else {
            if (Math.random() > 0.7) {
                wave.push({
                    enemyClass: FastEnemy,
                    enemySpecsMultiplier: {
                        life: ratio,
                        speed: waveSpeedMultiplier(this.waveCounter, 1.7)
                    },
                    quantity: 2 + this.waveCounter / 5,
                    delay: 200
                })
            }

            if (Math.random() > 0.6) {
                const quantity = 10 + this.waveCounter
                const split = rand(0, quantity / 3);

                for (let i = 0; i < split; ++i) {
                    wave.push({
                        enemyClass: ArmoredEnemy,
                        enemySpecsMultiplier: {
                            life: ratio,
                            speed: waveSpeedMultiplier(this.waveCounter, 1.5)
                        },
                        quantity: quantity / split,
                        delay: Math.max(500 - this.waveCounter, 100)
                    });

                    wave.push({
                        enemyClass: HealerEnemy,
                        enemySpecsMultiplier: {
                            life: ratio,
                            speed: waveSpeedMultiplier(this.waveCounter, 1.5)
                        },
                        quantity: 1,
                        delay: Math.max(400 - this.waveCounter, 100)
                    })
                }
            } else {
                wave.push({
                    enemyClass: ArmoredEnemy,
                    enemySpecsMultiplier: {
                        life: ratio,
                        speed: waveSpeedMultiplier(this.waveCounter, 1.5)
                    },
                    quantity: 10 + this.waveCounter,
                    delay: Math.max(500 - this.waveCounter, 100)
                })
            }

        }


        return wave;
    }

    isOnWave(config: { above?: number, below?: number, rand?: number }) {
        let result = true;

        if (config.above) result = result && this.waveCounter > config.above;
        if (config.below) result = result && this.waveCounter < config.below;

        return result;
    }
}

export const waveManager = new WavesManager();
