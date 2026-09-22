import {GridRenderable} from "../../interfaces/GridRenderable";
import {fps} from "../../config.json";
import {Enemy} from "../enemies/Enemy";
import {euclideanDistanceSquared} from "../../tools/helphers";
import {enemyManager} from "../../EnemyManager";
import {PI2} from "../../tools/constants";
import {textureManager} from "../../tools/TextureManager";
import {TowerType} from "./towerTypes";

const frameDuration = 1000 / fps;

export abstract class Tower extends GridRenderable {
    abstract towerType: TowerType;
    abstract reloadDurationMs: number;
    abstract damage: number | { max: number, min: number };
    abstract cost: number;
    private countdown: number = 0;
    protected canShoot: boolean = true;
    public traversable = false;
    abstract target: Enemy | undefined;
    abstract aimRadius: number;
    abstract texturePath: string;
    abstract colors: {
        primary: string,
        secondary: string
    };
    public targetInRange = false;
    abstract name: string;
    abstract description: string;

    public level: number = 1;
    public maxLevel: number = 5;

    /** Remaining upgrade price, or null at max level. Used to build the AI-facing snapshot. */
    get upgradeCost(): number | null {
        if (this.level >= this.maxLevel) return null;
        return Math.round(this.cost * 0.6 * this.level);
    }

    /**
     * Level up in place. The AI never touches these fields directly — it goes
     * through GameActions — but the scaling rule lives with the entity so every
     * tower type upgrades consistently.
     */
    applyUpgrade(): boolean {
        if (this.level >= this.maxLevel) return false;

        this.level += 1;

        const damage = this.damage;
        this.damage = typeof damage === 'number'
            ? damage * 1.5
            : {min: damage.min * 1.5, max: damage.max * 1.5};

        // Slower has reloadDurationMs 0 (it applies effects every tick); leave it alone.
        if (this.reloadDurationMs > 0) {
            this.reloadDurationMs = Math.max(this.reloadDurationMs * 0.9, 50);
        }

        return true;
    }

    update() {
        super.update();

        this.countdown += frameDuration;
        if (this.countdown >= this.reloadDurationMs) {
            this.canShoot = true;
            this.countdown = 0;
        }

        if (this.target && !this.target.alive) {
            // Target died
            this.target = undefined;
            this.targetInRange = false;
        } else if (this.target && euclideanDistanceSquared(this.center.x, this.center.y, this.target.x, this.target.y) < this.aimRadius * this.aimRadius) {
            // Target in range
            if (!this.targetInRange) {
                this.onNewTargetInRange();
                this.targetInRange = true;
            }

            if (this.canShoot) {
                this.canShoot = false;
                this.shoot();
            }
        } else {
            // No target or target no more in range
            this.target = enemyManager.getClosestPointInRadius(this.center.x, this.center.y, this.aimRadius);
            this.targetInRange = false;
        }

    }

    drawAimingRadius(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        const tmpColor = ctx.fillStyle;
        ctx.fillStyle += '22'
        ctx.ellipse(this.center.x, this.center.y, this.aimRadius, this.aimRadius, 0, 0, PI2);
        ctx.fill()
        ctx.fillStyle = tmpColor;
    }

    protected drawTexture(ctx: CanvasRenderingContext2D, rotation = 0) {
        textureManager.draw(ctx, this.texturePath, this.center.x, this.center.y, this.width, this.width, rotation);
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.isHovered) {
            this.drawAimingRadius(ctx)
        }
    }

    protected shoot() {
    }

    protected onNewTargetInRange() {
    }
}
