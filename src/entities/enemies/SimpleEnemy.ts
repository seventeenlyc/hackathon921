import {Enemy} from "./Enemy";
import {texturePaths} from "../../tools/texturePaths";


export class SimpleEnemy extends Enemy {
    texturePath = texturePaths.enemies.simple;
    life: number = 50;
    speed: number = 2.5;
    cash: number = 5;
    radius = 8

    draw(ctx: CanvasRenderingContext2D): void {
        super.draw(ctx);
    }

    update(): void {
        super.update()
    }


}
