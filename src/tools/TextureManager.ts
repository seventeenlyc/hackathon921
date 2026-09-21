export interface TextureImage {
    src: string;
    complete: boolean;
    naturalWidth: number;
    onload: (() => void) | null;
}

export type TextureImageFactory = () => TextureImage;
type TextureLoadedListener = () => void;

/**
 * Loads each external texture once and draws it centered on an entity.
 * The image factory is injectable so the loading and caching behavior can be
 * tested without requiring a browser DOM.
 */
export class TextureManager {
    private readonly images: { [src: string]: TextureImage } = {};
    private readonly listeners: { [src: string]: TextureLoadedListener[] } = {};

    constructor(private readonly imageFactory: TextureImageFactory = () => <TextureImage>new Image()) {
    }

    get(src: string): TextureImage {
        const cached = this.images[src];
        if (cached) {
            return cached;
        }

        const image = this.imageFactory();
        image.onload = () => this.notifyLoaded(src);
        this.images[src] = image;
        image.src = src;
        return image;
    }

    onLoaded(src: string, listener: TextureLoadedListener): void {
        const image = this.get(src);

        if (image.complete && image.naturalWidth > 0) {
            listener();
            return;
        }

        if (!this.listeners[src]) {
            this.listeners[src] = [];
        }
        this.listeners[src].push(listener);
    }

    draw(
        ctx: CanvasRenderingContext2D,
        src: string,
        x: number,
        y: number,
        width: number,
        height: number,
        rotation = 0
    ): boolean {
        const image = this.get(src);

        if (!image.complete || image.naturalWidth <= 0) {
            return false;
        }

        ctx.save();
        ctx.translate(x, y);
        if (rotation !== 0) {
            ctx.rotate(rotation);
        }
        ctx.drawImage(image as CanvasImageSource, -width / 2, -height / 2, width, height);
        ctx.restore();
        return true;
    }

    private notifyLoaded(src: string): void {
        const listeners = this.listeners[src];
        if (!listeners) {
            return;
        }

        delete this.listeners[src];
        listeners.forEach(listener => listener());
    }
}

export const textureManager = new TextureManager();
