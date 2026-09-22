import {TILE_SIZE} from '../constants';
import type {EngineWorld} from '../world';
import type {Base} from './Base';
import {Enemy, EnemyKind} from './Enemy';
import {HealEffect} from './Effect';

export class SimpleEnemy extends Enemy {
    public readonly kind: EnemyKind = 'simple';
    public life = 50;
    public speed = 2.5;
    public cash = 5;
    public radius = 8;

    constructor(base: Base, world: EngineWorld) {
        super(base, world);
    }
}

export class FastEnemy extends Enemy {
    public readonly kind: EnemyKind = 'fast';
    public life = 200;
    public speed = 4;
    public cash = 20;
    public radius = 8;

    constructor(base: Base, world: EngineWorld) {
        super(base, world);
    }
}

export class ArmoredEnemy extends Enemy {
    public readonly kind: EnemyKind = 'armored';
    public life = 200;
    public speed = 2.5;
    public cash = 10;
    public radius = 8;

    constructor(base: Base, world: EngineWorld) {
        super(base, world);
    }
}

/** Heals every other enemy within one tile, and remembers them for the view. */
export class HealerEnemy extends Enemy {
    public readonly kind: EnemyKind = 'healer';
    public life = 200;
    public speed = 2.5;
    public cash = 10;
    public radius = 8;
    public healRadius = TILE_SIZE;
    public enemiesInHealRadius: Enemy[] = [];

    constructor(base: Base, world: EngineWorld) {
        super(base, world);
    }

    update(): void {
        super.update();

        this.enemiesInHealRadius = this.world.enemies.getAllInRadius(this.x, this.y, this.healRadius)
            .filter(e => e !== this);
        this.enemiesInHealRadius.forEach(e => e.addEffect(HealEffect));
    }
}

export class BossEnemy extends Enemy {
    public readonly kind: EnemyKind = 'boss';
    public life = 2000;
    public speed = 2.5;
    public cash = 100;
    public radius = TILE_SIZE * 0.4;

    constructor(base: Base, world: EngineWorld) {
        super(base, world);
    }
}
