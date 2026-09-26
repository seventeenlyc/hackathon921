import {Tower} from "./Tower";
import {Enemy} from "../enemies/Enemy";
import {munitionManager} from "../../MunitionManager";
import {BasicBulletMunition} from "../munitions/BasicBulletMunition";
import {texturePaths} from "../../tools/texturePaths";
import {TowerType} from "./towerTypes";


export class CanonTower extends Tower {
    public texturePath = texturePaths.towers.canon;
    public towerType: TowerType = 'canon';
    public name = 'Canon';
    public description = 'Basic early game tower. Low cost, low damages.'
    public reloadDurationMs: number = 400;
    public damage: number = 25;
    public cost: number = 50;

    public target: Enemy | undefined;
    public aimRadius: number;
    public colors = {
        primary: '#556EE6',
        secondary: '#778BEB'
    };

    protected get muzzleOffset(): {x: number; y: number} {
        const scale = this.width / 1254;
        return {x: 0, y: -347 * scale};
    }

    constructor(x: number, y: number, width: number) {
        super(x, y, width);

        this.aimRadius = this.width * 2 + this.halfWidth;
    }

    shoot() {
        munitionManager.add(new BasicBulletMunition(this.target!, this));
    }

    draw(ctx: CanvasRenderingContext2D): void {
        this.drawTexture(ctx, this.turretRotation);
        super.draw(ctx);
    }

}
