import {PI2} from '../tools/constants';
import {drawRoundedSquare} from '../tools/shapes';
import {textureManager} from '../tools/TextureManager';
import {texturePaths} from '../tools/texturePaths';
import type {
    RenderBase,
    RenderEnemy,
    RenderMunition,
    RenderSnapshot,
    RenderTower,
} from '../engine/RenderSnapshot';
import type {EnemyKind} from '../engine/entities/Enemy';
import type {TowerType} from '../entities/towers/towerTypes';

/**
 * The browser's drawing layer (docs/PRODUCT_CONCEPT.md §2).
 *
 * This is the counterpart to `src/engine/RenderSnapshot.ts`: it turns a frame of
 * plain data into canvas pixels and never runs pathfinding, targeting, damage or
 * cash logic. The maths is ported from the old entity draw methods so the
 * picture is unchanged; only the source of the data moved from live singletons
 * to the server snapshot.
 */

const TOWER_COLORS: { [K in TowerType]: string } = {
    canon: '#556EE6',
    gatling: '#44b0e5',
    slow: '#bcc1c4',
    sniper: '#f39c12',
    laser: '#7f8c8d',
};

const ENEMY_BAR = {width: 20, height: 3, radius: 2};

export interface GridSize {
    width: number;
    height: number;
    tileSize: number;
}

/** Grid background and lines (ported from the old `Map.drawGrid`). */
export function drawMapGrid(ctx: CanvasRenderingContext2D, grid: GridSize): void {
    const gridWidth = grid.width * grid.tileSize;
    const gridHeight = grid.height * grid.tileSize;

    ctx.fillStyle = '#1f2125';
    ctx.fillRect(0, 0, gridWidth, gridHeight);
    ctx.strokeStyle = '#25272b';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < grid.width; ++x) {
        ctx.moveTo(x * grid.tileSize, 0);
        ctx.lineTo(x * grid.tileSize, gridHeight);
    }
    for (let y = 0; y < grid.height; ++y) {
        ctx.moveTo(0, y * grid.tileSize);
        ctx.lineTo(gridWidth, y * grid.tileSize);
    }

    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = '#4a4a4e';
    ctx.lineWidth = 3;
    drawRoundedSquare(ctx, 0, 0, gridWidth, gridHeight, 4);
    ctx.stroke();
}

export function drawRocks(ctx: CanvasRenderingContext2D, snapshot: RenderSnapshot): void {
    const {tileSize} = snapshot.grid;
    for (const rock of snapshot.rocks) {
        textureManager.draw(
            ctx,
            texturePaths.terrain.rock,
            rock.i * tileSize + tileSize / 2,
            rock.j * tileSize + tileSize / 2,
            tileSize,
            tileSize
        );
    }
}

function drawBaseHealthBar(ctx: CanvasRenderingContext2D, base: RenderBase): void {
    const ratio = base.life / base.maxLife;
    const width = base.width * 0.8;
    const y = base.y + 23;

    ctx.fillStyle = '#4a4a4e';
    drawRoundedSquare(ctx, base.x - width / 2, y, width, 3, 1.5);
    ctx.fill();

    if (base.life > 0) {
        ctx.fillStyle = '#27ae60';
        drawRoundedSquare(ctx, base.x - width / 2, y, width * ratio, 3, 1.5);
        ctx.fill();
    }
}

export function drawBases(ctx: CanvasRenderingContext2D, snapshot: RenderSnapshot): void {
    for (const base of snapshot.bases) {
        textureManager.draw(
            ctx,
            base.isHome ? texturePaths.home : texturePaths.enemy,
            base.x,
            base.y,
            base.width,
            base.width
        );

        if (base.isHome && base.life < base.maxLife) {
            drawBaseHealthBar(ctx, base);
        }
    }
}

/** Range circle, drawn for the hovered tower (ported from `Tower.drawAimingRadius`). */
export function drawAimRadius(ctx: CanvasRenderingContext2D, x: number, y: number, aimRadius: number): void {
    ctx.beginPath();
    const previous = ctx.fillStyle;
    ctx.fillStyle += '22';
    ctx.ellipse(x, y, aimRadius, aimRadius, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = previous;
}

export function drawTowers(ctx: CanvasRenderingContext2D, snapshot: RenderSnapshot, hoveredId: string | null): void {
    const {tileSize} = snapshot.grid;

    for (const tower of snapshot.towers) {
        textureManager.draw(
            ctx,
            texturePaths.towers[tower.type],
            tower.x,
            tower.y,
            tileSize,
            tileSize,
            tower.angle
        );

        if (tower.id === hoveredId) {
            drawAimRadius(ctx, tower.x, tower.y, tower.aimRadius);
        }
    }
}

function drawEnemyHealthBar(ctx: CanvasRenderingContext2D, enemy: RenderEnemy): void {
    const ratio = 1 - enemy.damageTaken / enemy.life;
    const y = enemy.y + (enemy.kind === 'boss' ? 22 : 12);

    ctx.fillStyle = '#4a4a4e';
    drawRoundedSquare(ctx, enemy.x - ENEMY_BAR.width / 2, y, ENEMY_BAR.width, ENEMY_BAR.height, ENEMY_BAR.radius);
    ctx.fill();

    ctx.fillStyle = '#c34667';
    drawRoundedSquare(ctx, enemy.x - ENEMY_BAR.width / 2, y, ENEMY_BAR.width * ratio, ENEMY_BAR.height, ENEMY_BAR.radius);
    ctx.fill();
}

export function drawEnemies(ctx: CanvasRenderingContext2D, snapshot: RenderSnapshot): void {
    for (const enemy of snapshot.enemies) {
        textureManager.draw(ctx, texturePaths.enemies[enemy.kind], enemy.x, enemy.y, enemy.radius * 2, enemy.radius * 2);

        if (enemy.damageTaken > 0) {
            drawEnemyHealthBar(ctx, enemy);
        }

        // Healer link lines, over the enemies it is topping up.
        if (enemy.healTargets && enemy.healTargets.length > 0) {
            ctx.strokeStyle = '#2ccc71';
            ctx.lineWidth = 1;
            ctx.shadowColor = '#2ccc71';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            for (const target of enemy.healTargets) {
                ctx.moveTo(enemy.x, enemy.y);
                ctx.lineTo(target.x, target.y);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            ctx.closePath();
        }
    }
}

export function drawMunitions(ctx: CanvasRenderingContext2D, snapshot: RenderSnapshot): void {
    for (const munition of snapshot.munitions) {
        drawMunition(ctx, munition);
    }
}

function drawMunition(ctx: CanvasRenderingContext2D, munition: RenderMunition): void {
    const color = TOWER_COLORS[munition.emitterType];

    if (munition.kind === 'bullet') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(munition.x, munition.y, 5, 5, 0, 0, PI2);
        ctx.fill();
        return;
    }

    if (munition.kind === 'sniper') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(munition.emitterX, munition.emitterY);
        ctx.lineTo(munition.targetX, munition.targetY);
        ctx.stroke();
        return;
    }

    // Laser beam: brighter and thicker as it charges.
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2 + 2 * munition.charge;
    ctx.shadowColor = 'red';
    ctx.shadowBlur = 3 + 5 * munition.charge;
    ctx.globalAlpha = munition.charge + 0.1;
    ctx.beginPath();
    ctx.moveTo(munition.emitterX, munition.emitterY);
    ctx.lineTo(munition.targetX, munition.targetY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
}

export interface TowerPreview {
    type: TowerType;
    /** Top-left of the target cell, in world coordinates. */
    x: number;
    y: number;
    tileSize: number;
    aimRadius: number;
    valid: boolean;
}

/** Ghost tower under the cursor, with a red cross when the cell is illegal. */
export function drawTowerPreview(ctx: CanvasRenderingContext2D, preview: TowerPreview): void {
    const centerX = preview.x + preview.tileSize / 2;
    const centerY = preview.y + preview.tileSize / 2;

    textureManager.draw(ctx, texturePaths.towers[preview.type], centerX, centerY, preview.tileSize, preview.tileSize);
    drawAimRadius(ctx, centerX, centerY, preview.aimRadius);

    if (!preview.valid) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(centerX - 10, centerY - 10);
        ctx.lineTo(centerX + 10, centerY + 10);
        ctx.moveTo(centerX + 10, centerY - 10);
        ctx.lineTo(centerX - 10, centerY + 10);
        ctx.stroke();
    }
}

/** The tower under a world-space point, or null. Used for hover. */
export function towerIdAt(snapshot: RenderSnapshot, point: { x: number; y: number }): string | null {
    const half = snapshot.grid.tileSize / 2;
    for (const tower of snapshot.towers) {
        if (Math.abs(point.x - tower.x) <= half && Math.abs(point.y - tower.y) <= half) {
            return tower.id;
        }
    }
    return null;
}

export function enemyKindTexture(kind: EnemyKind): string {
    return texturePaths.enemies[kind];
}
