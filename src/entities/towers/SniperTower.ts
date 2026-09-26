import {Tower} from "./Tower";
import {Enemy} from "../enemies/Enemy";
import {munitionManager} from "../../MunitionManager";
import {SniperBulletMunition} from "../munitions/SniperBulletMunition";
import {texturePaths} from "../../tools/texturePaths";
import {TowerType} from "./towerTypes";

export class SniperTower extends Tower {
    public texturePath = texturePaths.towers.sniper;
    public towerType: TowerType = 'sniper';
    public name = 'Sniper';
    aimRadius: number = 250;
    cost: number = 350;
    colors = {primary: '#f39c12', secondary: '#f1c40f'};
    damage: number = 300;
    reloadDurationMs: number = 3000;
    description: string = "Huge range, huge damages, but slow reload.";
    target: Enemy | undefined;

    protected get muzzleOffset(): {x: number; y: number} {
        const scale = this.width / 1254;
        return {x: 0, y: -470 * scale};
    }

    shoot(): void {
        if (this.target) {
            const munition = new SniperBulletMunition(this.target, this);
            munitionManager.add(munition)
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        this.drawTexture(ctx, this.turretRotation);
        super.draw(ctx);
    }

}
