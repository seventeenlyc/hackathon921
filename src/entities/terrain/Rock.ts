import {GridRenderable} from "../../interfaces/GridRenderable";
import {textureManager} from "../../tools/TextureManager";
import {texturePaths} from "../../tools/texturePaths";

export class Rock extends GridRenderable {
    public texturePath = texturePaths.terrain.rock;
    public traversable = false;

    draw(ctx: CanvasRenderingContext2D): void {
        textureManager.draw(ctx, this.texturePath, this.center.x, this.center.y, this.width, this.width);
    }
}
