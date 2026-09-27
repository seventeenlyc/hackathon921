import {GridRenderable} from "../../interfaces/GridRenderable";
import {textureManager} from "../../tools/TextureManager";
import {texturePaths} from "../../tools/texturePaths";

const obstacleTextures = texturePaths.terrain.obstacles;

export class Rock extends GridRenderable {
    public traversable = false;
    public texturePath: string;

    constructor(i: number, j: number, width: number, random: () => number = Math.random) {
        super(i, j, width);
        this.texturePath = obstacleTextures[Math.floor(random() * obstacleTextures.length)];
    }

    draw(ctx: CanvasRenderingContext2D): void {
        textureManager.draw(ctx, texturePaths.terrain.artwork ?? this.texturePath, this.center.x, this.center.y, this.width, this.width);
    }
}
