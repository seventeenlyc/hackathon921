import {TICK_MS} from '../clock';
import type {TowerType} from '../../entities/towers/towerTypes';
import type {EngineWorld} from '../world';
import type {Enemy} from './Enemy';

function euclideanDistanceSquared(x1: number, y1: number, x2: number, y2: number): number {
    const deltaX = x1 - x2;
    const deltaY = y1 - y2;
    return deltaX * deltaX + deltaY * deltaY;
}

/** Normalised tower damage, averaging a min/max range. Used by the AI snapshot. */
export function numericDamage(tower: Tower): number {
    const damage = tower.damage;
    if (typeof damage === 'number') return damage;
    return (damage.min + damage.max) / 2;
}

/** Damage per second, or 0 for reload-free utility towers such as the slower. */
export function dpsOf(tower: Tower): number {
    if (tower.reloadDurationMs <= 0) return 0;
    return Number((numericDamage(tower) / (tower.reloadDurationMs / 1000)).toFixed(1));
}

/**
 * A tower on the grid.
 *
 * Deliberately free of Canvas and hover handling: the browser build computed
 * `isHovered` from the mouse and canvas transform inside `update()`, which is
 * what made the entity un-runnable without a DOM. Hover is now a view concern
 * entirely; the engine only runs the reload/target/fire loop, on the injected
 * world rather than module singletons.
 */
export abstract class Tower {
    abstract readonly towerType: TowerType;
    abstract reloadDurationMs: number;
    abstract damage: number | { max: number, min: number };
    abstract cost: number;
    abstract aimRadius: number;
    abstract name: string;
    abstract description: string;

    public traversable = false;
    public level = 1;
    public maxLevel = 5;
    public target: Enemy | undefined;
    public targetInRange = false;

    public width: number;
    public halfWidth!: number;
    public center!: { x: number; y: number };
    public x!: number;
    public y!: number;

    private countdown = 0;
    protected canShoot: boolean = true;
    protected readonly world: EngineWorld;

    protected constructor(public readonly i: number, public readonly j: number, width: number, world: EngineWorld) {
        this.world = world;
        this.width = width;
        this.setCoordinates(i * width, j * width);
    }

    /** Remaining upgrade price, or null at max level. */
    get upgradeCost(): number | null {
        if (this.level >= this.maxLevel) return null;
        return Math.round(this.cost * 0.6 * this.level);
    }

    /** Level up in place. Scaling lives with the entity so every type upgrades consistently. */
    applyUpgrade(): boolean {
        if (this.level >= this.maxLevel) return false;

        this.level += 1;

        const damage = this.damage;
        this.damage = typeof damage === 'number'
            ? damage * 1.5
            : {min: damage.min * 1.5, max: damage.max * 1.5};

        // Slower has reloadDurationMs 0 (it applies effects every tick); leave it alone.
        if (this.reloadDurationMs > 0) {
            this.reloadDurationMs = Math.max(this.reloadDurationMs * 0.9, 50);
        }

        return true;
    }

    update() {
        this.countdown += TICK_MS;
        if (this.countdown >= this.reloadDurationMs) {
            this.canShoot = true;
            this.countdown = 0;
        }

        if (this.target && !this.target.alive) {
            this.target = undefined;
            this.targetInRange = false;
        } else if (this.target && euclideanDistanceSquared(this.center.x, this.center.y, this.target.x, this.target.y) < this.aimRadius * this.aimRadius) {
            if (!this.targetInRange) {
                this.onNewTargetInRange();
                this.targetInRange = true;
            }

            if (this.canShoot) {
                this.canShoot = false;
                this.shoot();
            }
        } else {
            this.target = this.world.enemies.getClosestPointInRadius(this.center.x, this.center.y, this.aimRadius);
            this.targetInRange = false;
        }
    }

    protected shoot() {
    }

    protected onNewTargetInRange() {
    }

    setCoordinates(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.halfWidth = this.width / 2;
        this.center = {
            x: x + this.width / 2,
            y: y + this.width / 2,
        };
    }
}
