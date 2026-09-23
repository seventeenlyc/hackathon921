import {Munition} from "./Munition";
import {fps} from "../../config.json";
import {tacticalItemsController} from "../../items/TacticalItems";

const frameDuration = 1000 / fps;

export class LaserMunition extends Munition {
    charge: number = 0;

    getDamage(ratio: number) {
        const {max, min} = <{ min: number, max: number }>this.emitter.damage

        return ((max - min) * ratio + min) / (this.emitter.reloadDurationMs / frameDuration);
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.strokeStyle = 'red'
        ctx.lineWidth = 2 + 2 * this.charge
        ctx.shadowColor = 'red'
        ctx.shadowBlur = 3 + 5 * this.charge
        ctx.globalAlpha = this.charge + 0.1
        ctx.beginPath();
        const muzzle = this.emitter.getMuzzlePosition();
        ctx.moveTo(muzzle.x, muzzle.y)
        ctx.lineTo(this.target.x, this.target.y);
        ctx.stroke();
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
    }

    update(): void {
        if (this.target.alive && this.emitter.targetInRange) {
            this.charge = Math.min(1, this.charge + 0.01);

            this.target.takeDamage(this.getDamage(this.charge) * tacticalItemsController.damageMultiplier);
        } else {
            this.alive = false;
        }
    }

}
