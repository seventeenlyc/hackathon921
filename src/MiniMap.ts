import {Map} from "./Map";
import {Rock} from "./entities/terrain/Rock";
import {Base} from "./entities/terrain/Base";
import {colors} from "./config.json";
import type {Camera} from "./Camera";

/**
 * Pure geometry shared with tests. Maps a point from map-pixel space into the
 * minimap rect (and back). Lives outside the class so it can be unit-tested
 * without a DOM/canvas.
 */
export function mapPointToMini(
    minimap: {x: number, y: number, width: number, height: number},
    mapRect: {width: number, height: number},
    p: {x: number, y: number},
): {x: number, y: number} {
    return {
        x: minimap.x + (p.x / mapRect.width) * minimap.width,
        y: minimap.y + (p.y / mapRect.height) * minimap.height,
    };
}

export function miniPointToMap(
    minimap: {x: number, y: number, width: number, height: number},
    mapRect: {width: number, height: number},
    p: {x: number, y: number},
): {x: number, y: number} {
    return {
        x: ((p.x - minimap.x) / minimap.width) * mapRect.width,
        y: ((p.y - minimap.y) / minimap.height) * mapRect.height,
    };
}

interface MinimapOptions {
    width: number;
    height: number;
    /** Padding from the bottom-right of the screen. */
    margin: number;
}

/**
 * A fixed bottom-right locator: a downsampled overview of the whole map plus a
 * rectangle marking where the live viewport is. Click/drag the minimap to pan
 * the camera (Jira-style minimap navigation).
 *
 * The minimap never touches game entities directly — it only reads the static
 * grid to cache terrain dots, and calls `camera.setCenter` / `getVisibleMapRect`
 * through the two public seams on the Camera. It draws in screen space, after
 * the main `ctx.restore()`, so the camera transform does not warp it.
 */
export class MiniMap {
    private readonly offscreen: HTMLCanvasElement;
    private readonly offscreenCtx: CanvasRenderingContext2D;
    private dirty: boolean = true;
    private dragging = false;

    constructor(
        private readonly map: Map,
        private readonly camera: Camera,
        private readonly opts: MinimapOptions,
    ) {
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = opts.width;
        this.offscreen.height = opts.height;
        this.offscreenCtx = this.offscreen.getContext('2d')!;
        // The grid only changes on spawn/lane edits, so cache once and refresh on signal.
        // `map.added` fires after `setSpawnCount`.
        this.map.on('added', () => { this.dirty = true; });
    }

    /** Screen-space rectangle occupied by the minimap. the bottom-right anchor. */
    getRect(): {x: number, y: number, width: number, height: number} {
        const canvasEl = document.getElementById('canvas') as HTMLCanvasElement;
        const w = canvasEl?.clientWidth ?? window.innerWidth;
        const h = canvasEl?.clientHeight ?? window.innerHeight;
        return {
            x: w - this.opts.width - this.opts.margin,
            y: h - this.opts.height - this.opts.margin,
            width: this.opts.width,
            height: this.opts.height,
        };
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.dirty) {
            this.renderTerrainCache();
            this.dirty = false;
        }
        const rect = this.getRect();
        ctx.save();
        // panel
        ctx.fillStyle = 'rgba(20, 22, 26, 0.82)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeStyle = 'rgba(120, 160, 175, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

        // cached overview image
        ctx.drawImage(this.offscreen, rect.x, rect.y, rect.width, rect.height);

        // viewport locator rectangle
        const mapRect = {width: Map.TILE_SIZE * Map.GRID_W, height: Map.TILE_SIZE * Map.GRID_H};
        const visible = this.camera.getVisibleMapRect();
        const tl = mapPointToMini(rect, mapRect, {x: visible.x, y: visible.y});
        const br = mapPointToMini(rect, mapRect, {x: visible.x + visible.width, y: visible.y + visible.height});
        ctx.strokeStyle = 'rgba(180, 215, 230, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(180, 215, 230, 0.12)';
        ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, br.x - tl.x - 1, br.y - tl.y - 1);
        ctx.restore();
    }

    private renderTerrainCache(): void {
        const ctx = this.offscreenCtx;
        const {width, height} = this.opts;
        ctx.clearRect(0, 0, width, height);
        const mapRect = {width: Map.TILE_SIZE * Map.GRID_W, height: Map.TILE_SIZE * Map.GRID_H};
        const mini = {x: 0, y: 0, width, height};

        // terrain dots — non-traversable rocks
        ctx.fillStyle = 'rgba(140, 140, 150, 0.55)';
        for (let i = 0; i < Map.GRID_W; i++) {
            for (let j = 0; j < Map.GRID_H; j++) {
                const cell = this.map.grid[i][j];
                if (cell instanceof Rock) {
                    const c = mapPointToMini(mini, mapRect, {
                        x: i * Map.TILE_SIZE + Map.TILE_SIZE / 2,
                        y: j * Map.TILE_SIZE + Map.TILE_SIZE / 2,
                    });
                    const r = Math.max(1, (Map.TILE_SIZE / mapRect.width) * width * 0.6);
                    ctx.beginPath();
                    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // bases — home vs enemy color
        this.drawBaseDot(ctx, mini, mapRect, this.map.homeBase, colors.homeBase.primary, 3);
        for (const b of this.map.enemyBases) {
            this.drawBaseDot(ctx, mini, mapRect, b, colors.enemyBase.primary, 3);
        }
    }

    private drawBaseDot(
        ctx: CanvasRenderingContext2D,
        mini: {x: number, y: number, width: number, height: number},
        mapRect: {width: number, height: number},
        base: Base,
        color: string,
        radius: number,
    ): void {
        const c = mapPointToMini(mini, mapRect, base.center);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Handle a pointer down inside the minimap rect. Returns true if consumed.
     * Coordinates are in canvas/screen space (same as Controls.mouse).
     */
    onPointerDown(screenX: number, screenY: number): boolean {
        const rect = this.getRect();
        if (screenX < rect.x || screenX > rect.x + rect.width ||
            screenY < rect.y || screenY > rect.y + rect.height) {
            return false;
        }
        this.dragging = true;
        this.panTo(screenX, screenY, rect);
        return true;
    }

    onPointerMove(screenX: number, screenY: number): void {
        if (!this.dragging) return;
        const rect = this.getRect();
        this.panTo(screenX, screenY, rect);
    }

    onPointerUp(): void {
        this.dragging = false;
    }

    private panTo(screenX: number, screenY: number, rect: {x: number, y: number, width: number, height: number}): void {
        const mapRect = {width: Map.TILE_SIZE * Map.GRID_W, height: Map.TILE_SIZE * Map.GRID_H};
        const mp = miniPointToMap(rect, mapRect, {x: screenX, y: screenY});
        this.camera.setCenter(mp.x, mp.y);
    }
}
