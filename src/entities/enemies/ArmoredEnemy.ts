import {Enemy} from "./Enemy";
import {texturePaths} from "../../tools/texturePaths";

export class ArmoredEnemy extends Enemy {
    texturePath = texturePaths.enemies.armored;
    textureDirections = texturePaths.enemyDirections?.armored;
    life: number = 200;
    speed: number = 2.5;
    cash: number = 10;
    radius = 8

    draw(ctx: CanvasRenderingContext2D): void {
        super.draw(ctx);
    }

    update(): void {
        super.update()
    }

}
