import {Enemy} from "./Enemy";
import {Map} from "../../Map";
import {enemyManager} from "../../EnemyManager";
import {HealEffect} from "../effects/HealEffect";
import {texturePaths} from "../../tools/texturePaths";

export class HealerEnemy extends Enemy {
    texturePath = texturePaths.enemies.healer;
    textureDirections = texturePaths.enemyDirections?.healer;
    life: number = 200;
    speed: number = 2.5;
    cash: number = 10;
    radius = 8;
    healRadius = Map.TILE_SIZE;
    enemiesInHealRadius: Enemy[] = [];

    draw(ctx: CanvasRenderingContext2D): void {
        super.draw(ctx);

        ctx.strokeStyle = '#2ccc71';
        ctx.lineWidth = 1;
        ctx.shadowColor = '#2ccc71';
        ctx.shadowBlur = 5;
        ctx.beginPath();

        this.enemiesInHealRadius.forEach(e => {
            if (e.damageTaken > 0) {
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(e.x, e.y);
                ctx.stroke();
            }
        });

        ctx.shadowBlur = 0;
        ctx.closePath();

    }

    update(): void {
        super.update();

        this.enemiesInHealRadius = enemyManager.getAllInRadius(this.x, this.y, this.healRadius).filter(e => e !== this);
        this.enemiesInHealRadius.forEach(e => e.addEffect(HealEffect));
    }

}
