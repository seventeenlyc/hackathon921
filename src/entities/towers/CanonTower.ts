import {Tower} from "./Tower";
import {Point} from "../../interfaces/Point";
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

    private canonLength: number;
    public target: Enemy | undefined;
    private canonExtremity: Point;
    public aimRadius: number;
    public colors = {
        primary: '#556EE6',
        secondary: '#778BEB'
    };

    constructor(x: number, y: number, width: number) {
        super(x, y, width);

        this.canonLength = this.halfWidth * 1.2;
        this.canonExtremity = {
            x: this.center.x,
            y: this.center.y + this.canonLength
        }
        this.aimRadius = this.width * 2 + this.halfWidth;
    }

    shoot() {
        munitionManager.add(new BasicBulletMunition(this.target!, this));
        this.canonLength *= 0.8;
    }

    update() {
        this.canonLength = this.halfWidth * 1.2;

        super.update();

        if (this.target) {
            const angle = Math.atan2(this.target.y - this.center.y, this.target.x - this.center.x);

            this.canonExtremity.x = this.center.x + this.canonLength * Math.cos(angle);
            this.canonExtremity.y = this.center.y + this.canonLength * Math.sin(angle)
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        const rotation = Math.atan2(
            this.canonExtremity.y - this.center.y,
            this.canonExtremity.x - this.center.x
        );
        this.drawTexture(ctx, rotation);

        super.draw(ctx);
    }

    setCoordinates(x: number, y: number) {
        super.setCoordinates(x, y);

        this.canonExtremity = {
            x: this.center.x + this.canonLength,
            y: this.center.y
        }
    }

}
