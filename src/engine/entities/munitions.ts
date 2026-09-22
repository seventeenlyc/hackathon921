import {TICK_MS} from '../clock';
import type {Enemy} from './Enemy';
import {Munition} from './Munition';
import type {MunitionKind} from './Munition';
import type {Tower} from './Tower';

/** A homing bullet. Damage is applied the tick its pre-move position is within `speed` of the target. */
export class BasicBulletMunition extends Munition {
    public readonly kind: MunitionKind = 'bullet';
    public speed = 6;
    protected radius = 5;
    protected angle = 0;

    constructor(target: Enemy, emitter: Tower) {
        super(target, emitter);
    }

    visual(): { angle: number; charge: number } {
        return {angle: this.angle, charge: 0};
    }

    update() {
        if (this.target.alive) {
            this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            const nearEqualX = this.x >= this.target.x - this.speed && this.x <= this.target.x + this.speed;
            const nearEqualY = this.y >= this.target.y - this.speed && this.y <= this.target.y + this.speed;

            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;

            if (nearEqualX && nearEqualY) {
                this.alive = false;
                this.dealDamage();
            }
        } else {
            this.alive = false;
        }
    }

    dealDamage() {
        if (typeof this.emitter.damage !== 'object') {
            this.target.takeDamage(this.emitter.damage);
        }
    }
}

/** Hitscan: resolves two ticks after firing, wherever the target has moved to. */
export class SniperBulletMunition extends BasicBulletMunition {
    public readonly kind: MunitionKind = 'sniper';
    private counter = 2;

    constructor(target: Enemy, emitter: Tower) {
        super(target, emitter);
    }

    update() {
        if (--this.counter <= 0) {
            this.alive = false;
            this.dealDamage();
        }
    }
}

/** A beam that ramps up while the emitter keeps its target in range. */
export class LaserMunition extends Munition {
    public readonly kind: MunitionKind = 'laser';
    public charge = 0;

    constructor(target: Enemy, emitter: Tower) {
        super(target, emitter);
    }

    getDamage(ratio: number) {
        const {max, min} = <{ min: number, max: number }>this.emitter.damage;

        return ((max - min) * ratio + min) / (this.emitter.reloadDurationMs / TICK_MS);
    }

    visual(): { angle: number; charge: number } {
        return {angle: 0, charge: this.charge};
    }

    update(): void {
        if (this.target.alive && this.emitter.targetInRange) {
            this.charge = Math.min(1, this.charge + 0.01);

            this.target.takeDamage(this.getDamage(this.charge));
        } else {
            this.alive = false;
        }
    }
}
