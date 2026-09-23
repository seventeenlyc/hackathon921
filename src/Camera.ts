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

    // "Contain" semantics (user request 2026-09-24): the minimum zoom lets the
    // whole map fit INSIDE the fixed central viewport (缩小至全图), so the
    // smaller map/viewport ratio wins and one axis may letterbox in the frame.
    private getMinimumScale(): number {
        const viewport = this.getViewport();
        const mapWidth = Map.TILE_SIZE * Map.GRID_W;
        const mapHeight = Map.TILE_SIZE * Map.GRID_H;
        return Math.min(viewport.width / mapWidth, viewport.height / mapHeight);
    }

    // 限制相机中心，使地图相对扇区框保持正确位置：地图大于框时钳制在地图边缘内，
    // 地图小于框（contain 最小缩放）时锁定居中，任何情况下都不会偏出地图范围。
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

    /**
     * The region of the map (in map-pixel coordinates) currently visible in
     * the frame. This is the single read seam the minimap uses to draw its
     * locator rectangle — geometry lives here, next to the clamp that defines it.
     */
    getVisibleMapRect(): {x: number, y: number, width: number, height: number} {
        const viewport = this.getViewport();
        const mapWidth = Map.TILE_SIZE * Map.GRID_W;
        const mapHeight = Map.TILE_SIZE * Map.GRID_H;
        const halfVisibleW = Math.min(viewport.width / (2 * this.scaleRatio), mapWidth / 2);
        const halfVisibleH = Math.min(viewport.height / (2 * this.scaleRatio), mapHeight / 2);
        const center = this.clampCenterToViewport(viewport);
        return {
            x: center.x - halfVisibleW,
            y: center.y - halfVisibleH,
            width: halfVisibleW * 2,
            height: halfVisibleH * 2,
        };
    }

    /**
     * Move the camera center to a map-pixel coordinate (used by the minimap).
     * The position is clamped by the same coverage rule as drags, so callers
     * cannot push the view beyond the map edges.
     */
    setCenter(x: number, y: number): void {
        const viewport = this.getViewport();
        const mapWidth = Map.TILE_SIZE * Map.GRID_W;
        const mapHeight = Map.TILE_SIZE * Map.GRID_H;
        const halfVisibleW = Math.min(viewport.width / (2 * this.scaleRatio), mapWidth / 2);
        const halfVisibleH = Math.min(viewport.height / (2 * this.scaleRatio), mapHeight / 2);
        this.x = Math.min(Math.max(x, halfVisibleW), mapWidth - halfVisibleW);
        this.y = Math.min(Math.max(y, halfVisibleH), mapHeight - halfVisibleH);
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
