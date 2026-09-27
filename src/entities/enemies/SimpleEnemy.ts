import {Enemy} from "./Enemy";
import {Base} from "../terrain/Base";
import {Map} from "../../Map";
import {texturePaths} from "../../tools/texturePaths";


export class SimpleEnemy extends Enemy {
    texturePath = texturePaths.enemies.simple;
    textureDirections = texturePaths.enemyDirections?.simple;
    life: number = 50;
    speed: number = 2.5;
    cash: number = 5;
    radius = 8

    // 34.5px at the current 40px tile size after the shared 15% display increase.
    // The contain-fit portrait remains inside one tile without changing collision.
    protected get textureSize(): number {
        return Map.TILE_SIZE * 0.75 * SimpleEnemy.TEXTURE_SIZE_SCALE;
    }

    constructor(base: Base) {
        super(base);
        this.healthBar.yOffset = Math.min(
            this.textureSize / 2 + 2,
            Map.TILE_SIZE / 2 - this.healthBar.height
        );
    }

    draw(ctx: CanvasRenderingContext2D): void {
        super.draw(ctx);
    }

    update(): void {
        super.update()
    }


}
