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

class WavesManager {
    public waveCounter = 1
    public looping = true;
    public onWaveReached: ((wave: number) => void) | null = null;
    private planner: Planner = idlePlanner;
    private started = false;

    constructor() {
    }

    /** The agent runtime plugs in here. */
    setPlanner(planner: Planner) {
        this.planner = planner;
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
            // Freeze and let the planner issue orders for `waveCounter` before its
            // enemies exist. A wave boundary is the only place the AI may act.
            await gameLoop.holdForPlanning(this.planner);
            if (!this.looping) break;

            const wave = this.generateWave()
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
        return enemy;
    }

    private generateWave(): Wave {
        const wave = [];
        const ratio = 1 + this.waveCounter / 10;

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
                        speed: Math.min(1 + this.waveCounter / 30, 1.7)
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
                            speed: Math.min(1 + this.waveCounter / 30, 1.5)
                        },
                        quantity: quantity / split,
                        delay: Math.max(500 - this.waveCounter, 100)
                    });

                    wave.push({
                        enemyClass: HealerEnemy,
                        enemySpecsMultiplier: {
                            life: ratio,
                            speed: Math.min(1 + this.waveCounter / 30, 1.5)
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
                        speed: Math.min(1 + this.waveCounter / 30, 1.5)
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
