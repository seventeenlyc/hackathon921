import {canvas} from './Canvas';
import {controls} from './Controls';
import {interfaceManager} from './InterfaceManager';
import type {GameSession} from './net/session';
import {drawTowerPreview} from './view/render';
import type {RenderSnapshot} from './engine/RenderSnapshot';
import type {TowerType} from './entities/towers/towerTypes';
import {playMode} from './PlayMode';

/**
 * Human-mode placement (docs/PRODUCT_CONCEPT.md §2).
 *
 * The browser only previews: it draws a ghost at the cursor and, on click, asks
 * the server to build. Legality (occupancy, funds, path blocking) is decided
 * server-side by `GameActions`, and the result message is shown as a toast. The
 * preview never claims a cell is legal beyond "no tower is visibly there".
 */
class TowerPlacer {
    private session: GameSession | null = null;
    private selectedType: TowerType | null = null;
    private selectedAimRadius = 0;
    private placing = false;
    private i = 0;
    private j = 0;
    private shouldBeDrawn = false;
    private latest: RenderSnapshot | null = null;

    constructor() {
        if (playMode !== 'human') return;

        controls.on('click', () => this.handleClick());
        controls.on('keydown:ESCAPE', () => {
            if (this.placing) this.placing = false;
        });
    }

    bind(session: GameSession) {
        this.session = session;
    }

    /** Choose a tower type from the palette and enter placement mode. */
    place(type: TowerType, aimRadius: number) {
        this.placing = true;
        this.selectedType = type;
        this.selectedAimRadius = aimRadius;
        this.shouldBeDrawn = false;
    }

    update(snapshot: RenderSnapshot | null): void {
        this.latest = snapshot;
        if (!this.placing) return;

        this.shouldBeDrawn = false;
        if (!snapshot) return;

        const mouse = canvas.transformMatrix!.inverse().transformPoint(controls.mouse);
        const tile = snapshot.grid.tileSize;
        this.i = Math.floor(mouse.x / tile);
        this.j = Math.floor(mouse.y / tile);

        if (this.isMouseOverGrid(snapshot)) {
            this.shouldBeDrawn = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, snapshot: RenderSnapshot | null): void {
        if (!this.placing || !this.shouldBeDrawn || !this.selectedType || !snapshot) return;

        const tile = snapshot.grid.tileSize;
        drawTowerPreview(ctx, {
            type: this.selectedType,
            x: this.i * tile,
            y: this.j * tile,
            tileSize: tile,
            aimRadius: this.selectedAimRadius,
            valid: this.canBePlaced(snapshot),
        });
    }

    private handleClick() {
        if (!this.placing || !this.session || !this.selectedType || !this.latest) return;
        if (!this.canBePlaced(this.latest)) return;

        const type = this.selectedType;
        void this.session.workerBuild(type, this.i, this.j)
            .then(result => {
                interfaceManager.snackbar.toast(result && result.message ? result.message : '');
                if (result && result.ok) {
                    this.placing = false;
                    this.shouldBeDrawn = false;
                }
            })
            .catch(error => interfaceManager.snackbar.toast(String((error && error.message) || error)));
    }

    private isMouseOverGrid(snapshot: RenderSnapshot): boolean {
        return controls.mouseInCanvas
            && this.i >= 0 && this.i < snapshot.grid.width
            && this.j >= 0 && this.j < snapshot.grid.height;
    }

    /** Visual hint only: the server is the authority on placement legality. */
    private canBePlaced(snapshot: RenderSnapshot): boolean {
        return this.isMouseOverGrid(snapshot)
            && !snapshot.towers.some(tower => tower.i === this.i && tower.j === this.j);
    }
}

export const towerPlacer = new TowerPlacer();
