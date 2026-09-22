import {TICK_MS} from '../clock';
import type {Enemy} from './Enemy';

/**
 * A temporary modifier attached to an enemy. Tick-driven, like everything else
 * in the engine: the browser build accumulated `1000/fps` per update, which is
 * exactly one tick.
 */
export abstract class Effect {
    protected enemy: Enemy;
    protected unmountCb: () => void = () => {
    };

    protected constructor(enemy: Enemy) {
        this.enemy = enemy;
    }

    abstract restart(): void;

    abstract stop(): void;

    onUnmount(cb: () => void) {
        this.unmountCb = cb;
    }

    update(): void {
    }
}

/** Slows an enemy to half speed for `duration` ms of simulated time. */
export class SlowEffect extends Effect {
    public duration = 100;

    private readonly previousSpeed: number;
    private counter = 0;

    constructor(enemy: Enemy) {
        super(enemy);

        this.previousSpeed = this.enemy.speed;
        this.enemy.speed = this.previousSpeed / 2;
    }

    update() {
        this.counter += TICK_MS;
        if (this.counter >= this.duration) {
            this.stop();
        }
    }

    restart(): void {
        this.counter = 0;
    }

    stop(): void {
        this.enemy.speed = this.previousSpeed;
        this.unmountCb();
    }
}

/** Heals an enemy over time. Healer enemies re-apply it every tick, which is why it is restartable. */
export class HealEffect extends Effect {
    public duration = 100;

    private readonly healRate: number = 100 / TICK_MS;
    private counter = 0;

    constructor(enemy: Enemy) {
        super(enemy);
    }

    update() {
        this.enemy.heal(this.healRate);

        this.counter += TICK_MS;
        if (this.counter >= this.duration) {
            this.stop();
        }
    }

    restart(): void {
        this.counter = 0;
    }

    stop(): void {
        this.unmountCb();
    }
}
