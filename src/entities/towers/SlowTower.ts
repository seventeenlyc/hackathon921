import {Tower} from "./Tower";
import {Enemy} from "../enemies/Enemy";
import {enemyManager} from "../../EnemyManager";
import {SlowEffect} from "../effects/SlowEffect";
import {texturePaths} from "../../tools/texturePaths";
import {TowerType} from "./towerTypes";


export class SlowTower extends Tower {
    public texturePath = texturePaths.towers.slow;
    public towerType: TowerType = 'slow';
    public name = 'Slower';
    public description = 'Tower that slows enemies.'
    public reloadDurationMs: number = 0;
    public damage: number = 0;
    public cost: number = 150;

    public target: Enemy | undefined;
    public aimRadius: number;
    public colors = {
        primary: '#bcc1c4',
        secondary: '#e6e9ea'
    };

    constructor(x: number, y: number, width: number) {
        super(x, y, width);

        this.aimRadius = this.width * 2 + this.halfWidth;
    }

    shoot() {
    }

    update() {
        const enemies = enemyManager.getAllInRadius(this.center.x, this.center.y, this.aimRadius);
        enemies.forEach(e => e.addEffect(SlowEffect));
    }

    draw(ctx: CanvasRenderingContext2D): void {
        this.drawTexture(ctx);

        super.draw(ctx);
    }


    setCoordinates(x: number, y: number) {
        super.setCoordinates(x, y);
    }

}
