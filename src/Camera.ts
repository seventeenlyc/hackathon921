import {Map} from "./Map";
import {canvas} from "./Canvas";
import {controls} from "./Controls";

export class Camera {
    x: number = Map.TILE_SIZE * Map.GRID_W / 2;
    y: number = Map.TILE_SIZE * Map.GRID_H / 2;
    scaleRatio: number = 0.82;
    static DELTA_MOVE: number = 100;
    static SCALE_FACTOR: number = 0.1;
    scaleCenter = {
        x: -this.x + canvas.getElement().width / 2,
        y: -this.y + canvas.getElement().height / 2
    }
    private dragging: boolean = false;
    private dragStartCoordinates = {x: 0, y: 0};
    private dragDeltaDistances = {x: 0, y: 0};

    private getViewport() {
        const canvasElement = canvas.getElement();
        const canvasRect = canvasElement.getBoundingClientRect();
        const frame = document.getElementById('map-frame');
        if (!frame) {
            return {x: canvasElement.width / 2, y: canvasElement.height / 2, width: canvasElement.width, height: canvasElement.height};
        }
        const frameRect = frame.getBoundingClientRect();
        return {
            x: frameRect.left - canvasRect.left + frameRect.width / 2,
            y: frameRect.top - canvasRect.top + frameRect.height / 2,
            width: frameRect.width,
            height: frameRect.height,
        };
    }

    // "Cover" semantics (user-confirmed 2026-09-24): at minimum zoom the map must
    // still reach every edge of the fixed central viewport, never shrink inside
    // the frame — so the larger map/viewport ratio wins.
    private getMinimumScale(): number {
        const viewport = this.getViewport();
        const mapWidth = Map.TILE_SIZE * Map.GRID_W;
        const mapHeight = Map.TILE_SIZE * Map.GRID_H;
        return Math.max(viewport.width / mapWidth, viewport.height / mapHeight);
    }

    // The viewport must never show anything beyond the map: clamp the effective
    // camera center (position minus live drag offset) so the map rect always
    // covers the frame. At minimum zoom one axis may have zero slack, which
    // locks the camera on that axis — any offset would expose the background.
    private clampCenterToViewport(viewport: {width: number, height: number}): {x: number, y: number} {
        const mapWidth = Map.TILE_SIZE * Map.GRID_W;
        const mapHeight = Map.TILE_SIZE * Map.GRID_H;
        const halfVisibleW = Math.min(viewport.width / (2 * this.scaleRatio), mapWidth / 2);
        const halfVisibleH = Math.min(viewport.height / (2 * this.scaleRatio), mapHeight / 2);
        return {
            x: Math.min(Math.max(this.x - this.dragDeltaDistances.x, halfVisibleW), mapWidth - halfVisibleW),
            y: Math.min(Math.max(this.y - this.dragDeltaDistances.y, halfVisibleH), mapHeight - halfVisibleH),
        };
    }

    constructor() {
        controls.on('keydown:ARROWUP', () => this.move(0, -Camera.DELTA_MOVE))
        controls.on('keydown:ARROWDOWN', () => this.move(0, Camera.DELTA_MOVE))
        controls.on('keydown:ARROWRIGHT', () => this.move(Camera.DELTA_MOVE, 0))
        controls.on('keydown:ARROWLEFT', () => this.move(-Camera.DELTA_MOVE, 0))
        controls.on('wheel:up', () => this.scale(1 + Camera.SCALE_FACTOR))
        controls.on('wheel:down', () => this.scale(1 - Camera.SCALE_FACTOR))
        controls.on('mousedown', () => {
            this.dragging = true;
            this.dragStartCoordinates = {...controls.mouse};
        })
        controls.on('mouseup', () => {
            this.dragging = false;
            this.move(-this.dragDeltaDistances.x, -this.dragDeltaDistances.y)
            this.dragDeltaDistances = {x: 0, y: 0}
        })
    }

    update(): void {
        if (this.dragging) {
            this.dragDeltaDistances = {
                x: (controls.mouse.x - this.dragStartCoordinates.x) / this.scaleRatio,
                y: (controls.mouse.y - this.dragStartCoordinates.y) / this.scaleRatio
            }
        }
    }

    process(ctx: CanvasRenderingContext2D): void {
        const viewport = this.getViewport();
        this.scaleRatio = Math.max(this.scaleRatio, this.getMinimumScale());
        const center = this.clampCenterToViewport(viewport);
        ctx.translate(viewport.x, viewport.y)
        ctx.scale(this.scaleRatio, this.scaleRatio)
        ctx.translate(-center.x, -center.y);

        canvas.updateTransformMatrix();
    }

    private move(dx: number, dy: number) {
        this.x = Math.min(Math.max(this.x + dx, 0), Map.TILE_SIZE * Map.GRID_W);
        this.y = Math.min(Math.max(this.y + dy, 0), Map.TILE_SIZE * Map.GRID_H);
    }

    private scale(factor: number) {
        this.scaleRatio = Math.max(this.getMinimumScale(), this.scaleRatio * factor);
        this.scaleCenter = {...controls.mouse};
    }

}

export const camera = new Camera();
