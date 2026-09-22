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
    private angle: number = 0;

    update() {
        super.update();

        if (this.target) {
            this.angle = Math.atan2(this.target.y - this.center.y, this.target.x - this.center.x);
        }
    }

    shoot(): void {
        if (this.target) {
            const munition = new SniperBulletMunition(this.target, this);
            munitionManager.add(munition)
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        this.drawTexture(ctx, this.angle);

        super.draw(ctx);
    }

}
