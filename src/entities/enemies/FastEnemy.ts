import {Enemy} from "./Enemy";
import {texturePaths} from "../../tools/texturePaths";

export class FastEnemy extends Enemy {
    texturePath = texturePaths.enemies.fast;
    textureDirections = texturePaths.enemyDirections?.fast;
    life: number = 200;
    speed: number = 4;
    cash: number = 20;
    radius = 8

    draw(ctx: CanvasRenderingContext2D): void {
        super.draw(ctx);
    }

    update(): void {
        super.update()
    }

}
