import type {TowerType} from '../../entities/towers/towerTypes';
import type {EngineWorld} from '../world';
import type {Enemy} from './Enemy';
import {SlowEffect} from './Effect';
import {BasicBulletMunition, LaserMunition, SniperBulletMunition} from './munitions';
import {Tower} from './Tower';

export class CanonTower extends Tower {
    public readonly towerType: TowerType = 'canon';
    public name = 'Canon';
    public description = 'Basic early game tower. Low cost, low damages.';
    public reloadDurationMs = 400;
    public damage: number | { max: number, min: number } = 25;
    public cost = 50;
    public aimRadius: number;
    public target: Enemy | undefined;
    public canonLength!: number;
    public canonExtremity!: { x: number; y: number };

    constructor(i: number, j: number, width: number, world: EngineWorld) {
        super(i, j, width, world);

        this.canonLength = this.halfWidth * 1.2;
        this.canonExtremity = {
            x: this.center.x,
            y: this.center.y + this.canonLength,
        };
        this.aimRadius = this.width * 2 + this.halfWidth;
    }

    shoot() {
        this.world.munitions.add(new BasicBulletMunition(this.target!, this));
        this.canonLength *= 0.8;
    }

    update() {
        this.canonLength = this.halfWidth * 1.2;

        super.update();

        if (this.target) {
            const angle = Math.atan2(this.target.y - this.center.y, this.target.x - this.center.x);

            this.canonExtremity.x = this.center.x + this.canonLength * Math.cos(angle);
            this.canonExtremity.y = this.center.y + this.canonLength * Math.sin(angle);
        }
    }

    setCoordinates(x: number, y: number) {
        super.setCoordinates(x, y);

        this.canonExtremity = {
            x: this.center.x + this.canonLength,
            y: this.center.y,
        };
    }
}

export class GatlingTower extends CanonTower {
    public readonly towerType: TowerType = 'gatling';
    public name = 'Gatling';
    public description = 'Enhanced version of the Canon tower with a high shooting rate.';
    public reloadDurationMs = 200;
    public cost = 100;

    constructor(i: number, j: number, width: number, world: EngineWorld) {
        super(i, j, width, world);
    }
}

export class SlowTower extends Tower {
    public readonly towerType: TowerType = 'slow';
    public name = 'Slower';
    public description = 'Tower that slows enemies.';
    public reloadDurationMs = 0;
    public damage: number | { max: number, min: number } = 0;
    public cost = 150;
    public aimRadius: number;
    public target: Enemy | undefined;

    constructor(i: number, j: number, width: number, world: EngineWorld) {
        super(i, j, width, world);

        this.aimRadius = this.width * 2 + this.halfWidth;
    }

    shoot() {
    }

    update() {
        const enemies = this.world.enemies.getAllInRadius(this.center.x, this.center.y, this.aimRadius);
        enemies.forEach(e => e.addEffect(SlowEffect));
    }
}

export class SniperTower extends Tower {
    public readonly towerType: TowerType = 'sniper';
    public name = 'Sniper';
    public description = 'Huge range, huge damages, but slow reload.';
    public reloadDurationMs = 3000;
    public damage: number | { max: number, min: number } = 300;
    public cost = 350;
    public aimRadius = 250;
    public target: Enemy | undefined;
    public angle = 0;

    constructor(i: number, j: number, width: number, world: EngineWorld) {
        super(i, j, width, world);
    }

    update() {
        super.update();

        if (this.target) {
            this.angle = Math.atan2(this.target.y - this.center.y, this.target.x - this.center.x);
        }
    }

    shoot(): void {
        if (this.target) {
            this.world.munitions.add(new SniperBulletMunition(this.target, this));
        }
    }
}

export class LaserTower extends Tower {
    public readonly towerType: TowerType = 'laser';
    public name = 'Laser';
    public description = 'Laser tower beam focusing on one enemy. The longer the focus, the bigger the damages.';
    public reloadDurationMs = 300;
    public damage: number | { max: number, min: number } = {max: 50, min: 20};
    public cost = 400;
    public aimRadius = this.width * 2 + this.halfWidth;
    public target: Enemy | undefined;
    public angle = 0;

    constructor(i: number, j: number, width: number, world: EngineWorld) {
        super(i, j, width, world);
    }

    onNewTargetInRange() {
        if (this.target) {
            this.world.munitions.add(new LaserMunition(this.target, this));
        }
    }

    update() {
        super.update();

        if (this.target) {
            this.angle = Math.atan2(this.target.y - this.center.y, this.target.x - this.center.x);
        }
    }
}
