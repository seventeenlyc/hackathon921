import {Tower} from "./entities/towers/Tower";
import {CanonTower} from "./entities/towers/CanonTower";
import {map, Map} from "./Map";
import {Renderable} from "./interfaces/Renderable";
import {controls} from "./Controls";
import {interfaceManager} from "./InterfaceManager";
import {canvas} from "./Canvas";
import {GameActions} from "./agent/GameActions";
import {playMode} from "./PlayMode";

class TowerPlacer extends Renderable {
    public tower: Tower = new CanonTower(0, 0, Map.TILE_SIZE);
    public placing = false;
    private j = 0;
    private i = 0;
    private shouldBeDrawn = false;
    private actions: GameActions | null = null;

    constructor() {
        super();

        if (playMode !== 'human') return;

        controls.on('click', () => this.handleClick());

        controls.on('keydown:ESCAPE', () => {
            if (this.placing) this.placing = false;
        });
    }

    setActions(actions: GameActions) {
        this.actions = actions;
    }

    private handleClick() {
        if (!this.placing || !this.canBePlaced() || !this.actions) return;

        const result = this.actions.buildTower(this.tower.towerType, this.i, this.j);
        interfaceManager.snackbar.toast(result.message);
        if (result.ok) {
            this.placing = false;
            this.shouldBeDrawn = false;
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.placing && this.shouldBeDrawn) {
            this.tower.draw(ctx);
            this.tower.drawAimingRadius(ctx);

            if (!this.canBePlaced()) {
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(this.x + Map.TILE_SIZE / 2 - 10, this.y + Map.TILE_SIZE / 2 - 10);
                ctx.lineTo(this.x + Map.TILE_SIZE / 2 + 10, this.y + Map.TILE_SIZE / 2 + 10);
                ctx.moveTo(this.x + Map.TILE_SIZE / 2 + 10, this.y + Map.TILE_SIZE / 2 - 10);
                ctx.lineTo(this.x + Map.TILE_SIZE / 2 - 10, this.y + Map.TILE_SIZE / 2 + 10);
                ctx.stroke();
            }
        }
    }

    update(): void {
        if (!this.placing) return;

        this.shouldBeDrawn = false;
        const mouse = canvas.transformMatrix!.inverse().transformPoint(controls.mouse);
        this.i = Math.floor(mouse.x / Map.TILE_SIZE);
        this.j = Math.floor(mouse.y / Map.TILE_SIZE);

        if (this.isMouseOverGrid()) {
            this.x = this.i * Map.TILE_SIZE;
            this.y = this.j * Map.TILE_SIZE;
            this.tower.setCoordinates(this.x, this.y);
            this.shouldBeDrawn = true;
        }
    }

    private isMouseOverGrid() {
        return controls.mouseInCanvas && this.i >= 0 && this.i < map.grid.length && this.j >= 0 && this.j < map.grid[0].length;
    }

    private canBePlaced() {
        return this.isMouseOverGrid() && map.canBePlaced(this.i, this.j);
    }

    place(TowerClass: new (...args: any[]) => Tower) {
        this.shouldBeDrawn = false;
        this.placing = true;
        this.tower = new TowerClass(0, 0, Map.TILE_SIZE);
    }
}

export const towerPlacer = new TowerPlacer();
