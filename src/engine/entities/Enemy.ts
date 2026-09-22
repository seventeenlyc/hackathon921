import {TILE_SIZE} from '../constants';
import type {EngineWorld} from '../world';
import type {Base} from './Base';
import type {Effect} from './Effect';

export type EnemyKind = 'simple' | 'fast' | 'armored' | 'healer' | 'boss';

/**
 * An enemy walking a lane from a spawn base to the home base.
 *
 * Ported one-to-one from the browser entity, with the render-coupled parts
 * removed: no Canvas, no texture, no module singletons. Cross-entity access goes
 * through the injected `EngineWorld` instead. Movement, damage, healing and the
 * on-death cash payout keep the exact original arithmetic so a replay under the
 * same seed behaves identically.
 */
export abstract class Enemy {
    abstract readonly kind: EnemyKind;
    abstract speed: number;
    abstract life: number;
    abstract cash: number;
    abstract radius: number;

    protected damage: number = 10;
    public damageTaken = 0;
    public alive = true;
    /** Stable id assigned by the enemy manager, so a renderer can interpolate across frames. */
    public id = 0;
    public x: number;
    public y: number;

    private readonly base: Base;
    protected readonly world: EngineWorld;
    private effects: Effect[] = [];
    private targetIndex = 1;
    private path: Array<{ x: number; y: number }> | false = false;

    protected constructor(base: Base, world: EngineWorld) {
        this.base = base;
        this.world = world;
        this.x = base.center.x;
        this.y = base.center.y;
        this.updatePath();
    }

    updatePath() {
        this.path = this.getPath();
        this.targetIndex = 1;
    }

    update() {
        this.effects.forEach(e => e.update());

        if (this.path) {
            const target = this.path[this.targetIndex];

            if (target) {
                const angle = Math.atan2(target.y - this.y, target.x - this.x);
                const nearEqualX = this.x >= target.x - this.speed && this.x <= target.x + this.speed;
                const nearEqualY = this.y >= target.y - this.speed && this.y <= target.y + this.speed;

                if (!nearEqualX) {
                    this.x += Math.cos(angle) * this.speed;
                } else {
                    this.x = target.x;
                }

                if (!nearEqualY) {
                    this.y += Math.sin(angle) * this.speed;
                } else {
                    this.y = target.y;
                }

                if (nearEqualX && nearEqualY) {
                    this.targetIndex++;
                }
            } else {
                this.world.damageBase();
                this.alive = false;
            }
        }
    }

    takeDamage(damage: number) {
        this.damageTaken += damage;

        if (this.damageTaken >= this.life && this.alive) {
            this.alive = false;
            this.onDie();
        }
    }

    public getPath(): Array<{ x: number; y: number }> | false {
        return this.world.map.getPathFromGridCell(
            Math.floor(this.x / TILE_SIZE),
            Math.floor(this.y / TILE_SIZE)
        );
    }

    private onDie() {
        this.world.cash.add(this.cash);
    }

    heal(amount: number) {
        this.damageTaken = Math.max(this.damageTaken - amount, 0);
    }

    /**
     * Attach an effect, or restart it when one of the same type is already
     * running. The browser build matched on `constructor.name`; preserved so the
     * Slow/Heal stacking behaviour is unchanged.
     */
    addEffect(effect: new (enemy: Enemy) => Effect) {
        const existingEffect = this.effects.find(e => e.constructor.name === effect.name);

        if (existingEffect) {
            existingEffect.restart();
        } else {
            const e = new effect(this);
            const i = this.effects.push(e) - 1;
            e.onUnmount(() => {
                this.effects.splice(i, 1);
            });
        }
    }
}
