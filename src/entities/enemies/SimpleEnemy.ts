import {Enemy} from "./Enemy";
import {Base} from "../terrain/Base";
import {Map} from "../../Map";
import {texturePaths} from "../../tools/texturePaths";


export class SimpleEnemy extends Enemy {
    texturePath = texturePaths.enemies.simple;
    life: number = 50;
    speed: number = 2.5;
    cash: number = 5;
    radius = 8

    // 30px at the current 40px tile size: readable after contain-fit of the
    // portrait artwork, without changing collision or covering neighboring cells.
    protected get textureSize(): number {
        return Map.TILE_SIZE * 0.75;
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
