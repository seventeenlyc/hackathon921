import {Enemy} from "./Enemy";
import {Map} from "../../Map";
import {Base} from "../terrain/Base";
import {texturePaths} from "../../tools/texturePaths";


export class BossEnemy extends Enemy {
    texturePath = texturePaths.enemies.boss;
    textureDirections = texturePaths.enemyDirections?.boss;
    life: number = 2000;
    speed: number = 2.5;
    cash: number = 100;
    radius = Map.TILE_SIZE * 0.4


    constructor(base: Base) {
        super(base);

        this.healthBar.yOffset = 22
    }

    draw(ctx: CanvasRenderingContext2D): void {
        super.draw(ctx);
    }

    update(): void {
        super.update()
    }


}
