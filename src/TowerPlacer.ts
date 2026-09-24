import {Tower} from "./entities/towers/Tower";
import {CanonTower} from "./entities/towers/CanonTower";
import {map, Map} from "./Map";
import {Renderable} from "./interfaces/Renderable";
import {controls} from "./Controls";
import {interfaceManager} from "./InterfaceManager";
import {canvas} from "./Canvas";
import {GameActions} from "./agent/GameActions";
import {playMode} from "./PlayMode";
import {TowerInfo} from "./agent/types";

class TowerPlacer extends Renderable {
    public tower: Tower = new CanonTower(0, 0, Map.TILE_SIZE);
    public placing = false;
    private j = 0;
    private i = 0;
    private shouldBeDrawn = false;
    private actions: GameActions | null = null;
    private currentTowerClass: (new (...args: any[]) => Tower) | null = null;
    private selectedTowerId: string | null = null;
    private selectionListener: ((tower: TowerInfo | null) => void) | null = null;

    constructor() {
        super();

        if (playMode !== 'human') return;

        controls.on('click', () => this.handleClick());

        controls.on('keydown:ESCAPE', () => {
            if (this.placing) this.cancel();
            else this.setSelectedTower(null);
        });
    }

    setActions(actions: GameActions) {
        this.actions = actions;
    }

    setSelectionListener(listener: (tower: TowerInfo | null) => void) {
        this.selectionListener = listener;
        listener(this.getSelectedTower());
    }

    private handleClick() {
        if (!this.actions || playMode !== 'human') return;

        const cell = this.getCellAtCursor();
        if (!cell) {
            if (!this.placing) this.setSelectedTower(null);
            return;
        }

        this.i = cell.i;
        this.j = cell.j;

        if (this.placing && this.canBePlaced()) {
            this.placeTowerAtCursor();
            return;
        }

        const tower = this.actions.getState().towers.find(item => item.i === cell.i && item.j === cell.j);
        if (tower) {
            this.stopPlacement();
            this.setSelectedTower(tower);
        } else if (!this.placing) {
            this.setSelectedTower(null);
        }
    }

    private placeTowerAtCursor() {
        if (!this.actions) return;

        const result = this.actions.buildTower(this.tower.towerType, this.i, this.j);
        interfaceManager.snackbar.toast(result.message);
        if (result.ok) {
            // Continuous placement: prepare a new tower instance of the same class for the next placement
            if (this.currentTowerClass) {
                this.tower = new this.currentTowerClass(0, 0, Map.TILE_SIZE);
            }
        }
    }

    private getCellAtCursor(): {i: number; j: number} | null {
        if (!controls.mouseInCanvas || !canvas.transformMatrix) return null;
        const mouse = canvas.transformMatrix.inverse().transformPoint(controls.mouse);
        const i = Math.floor(mouse.x / Map.TILE_SIZE);
        const j = Math.floor(mouse.y / Map.TILE_SIZE);
        if (i < 0 || i >= map.grid.length || j < 0 || j >= map.grid[0].length) return null;
        return {i, j};
    }

    private getSelectedTower(): TowerInfo | null {
        if (!this.actions || !this.selectedTowerId) return null;
        return this.actions.getState().towers.find(tower => tower.id === this.selectedTowerId) ?? null;
    }

    private setSelectedTower(tower: TowerInfo | null) {
        this.selectedTowerId = tower?.id ?? null;
        this.selectionListener?.(tower);
    }

    private stopPlacement() {
        this.placing = false;
        this.shouldBeDrawn = false;
        this.currentTowerClass = null;
    }

    upgradeSelected() {
        if (playMode !== 'human' || !this.actions || !this.selectedTowerId) return null;

        const id = this.selectedTowerId;
        const result = this.actions.upgradeTower(id);
        interfaceManager.snackbar.toast(result.message);
        this.setSelectedTower(
            this.actions.getState().towers.find(tower => tower.id === id) ?? null
        );
        return result;
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
        this.setSelectedTower(null);
        this.shouldBeDrawn = false;
        this.placing = true;
        this.currentTowerClass = TowerClass;
        this.tower = new TowerClass(0, 0, Map.TILE_SIZE);
    }

    cancel() {
        this.stopPlacement();
        this.setSelectedTower(null);
    }
}

export const towerPlacer = new TowerPlacer();
