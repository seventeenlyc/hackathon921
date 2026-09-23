import {GridRenderable} from "../../interfaces/GridRenderable";
import {drawRoundedSquare} from "../../tools/shapes";
import {colors} from "../../config.json";
import {game} from "../../Game";
import {Map} from "../../Map";
import {textureManager} from "../../tools/TextureManager";
import {texturePaths} from "../../tools/texturePaths";

export class Base extends GridRenderable {
    private colors: { primary: string; secondary: string };
    public traversable = true;
    private isHome: boolean;
    private texturePath: string;
    private maxLife: number = 15;
    private life: number = this.maxLife;
    protected healthBar = {
        yOffset: 23,
        width: Map.TILE_SIZE * 0.8,
        height: 3,
        borderRadius: 1.5
    }

    constructor(x: number, y: number, width: number, isHome = false) {
        super(x, y, width);
        this.colors = isHome ? colors.homeBase : colors.enemyBase;
        this.isHome = isHome;
        this.texturePath = isHome ? texturePaths.home : texturePaths.enemy;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        textureManager.draw(ctx, this.texturePath, this.center.x, this.center.y, this.width, this.width);

        if (this.isHome && this.life < this.maxLife) {
            this.drawHealthBar(ctx);
        }
    }

    handleDamage() {
        if (--this.life <= 0) {
            game.gameOver();
        }
    }

    getLife() {
        return this.life;
    }

    getMaxLife() {
        return this.maxLife;
    }

    heal(amount: number) {
        this.life = Math.min(this.maxLife, this.life + Math.round(amount));
    }

    private drawHealthBar(ctx: CanvasRenderingContext2D) {
        const ratio = this.life / this.maxLife;
        ctx.fillStyle = '#4a4a4e'
        drawRoundedSquare(ctx, this.center.x - this.healthBar.width / 2, this.center.y + this.healthBar.yOffset, this.healthBar.width, this.healthBar.height, this.healthBar.borderRadius)
        ctx.fill()

        if (this.life > 0) {
            ctx.fillStyle = this.colors.primary
            drawRoundedSquare(ctx, this.center.x - this.healthBar.width / 2, this.center.y + this.healthBar.yOffset, this.healthBar.width * ratio, this.healthBar.height, this.healthBar.borderRadius)
            ctx.fill()
        }
    }
}
