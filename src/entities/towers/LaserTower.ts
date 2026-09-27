import {Tower} from "./Tower";
import {Enemy} from "../enemies/Enemy";
import {munitionManager} from "../../MunitionManager";
import {LaserMunition} from "../munitions/LaserMunition";
import {texturePaths} from "../../tools/texturePaths";
import {TowerType} from "./towerTypes";


export class LaserTower extends Tower {
    public texturePath = texturePaths.towers.laser;
    public towerType: TowerType = 'laser';
    public name = 'Laser';
    public description = 'Laser tower beam focusing on one enemy. The longer the focus, the bigger the damages.'
    public reloadDurationMs: number = 300;
    public damage = {
        max: 50,
        min: 20
    };
    public cost: number = 400;
    public target: Enemy | undefined;
    public aimRadius: number = this.width * 2 + this.halfWidth;
    public colors = {
        primary: '#7f8c8d',
        secondary: '#95a5a6'
    };

    protected get muzzleOffset(): {x: number; y: number} {
        const scale = this.width / 1254;
        return {x: 0, y: -277 * scale};
    }

    constructor(x: number, y: number, width: number) {
        super(x, y, width);

    }

    onNewTargetInRange() {
        if (this.target) {
            munitionManager.add(new LaserMunition(this.target, this))
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        this.drawTexture(ctx, this.turretRotation);
        super.draw(ctx);
    }

    setCoordinates(x: number, y: number) {
        super.setCoordinates(x, y);
    }

}
