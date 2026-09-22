import type {GameEngine, EngineState} from './GameEngine';
import {TILE_SIZE} from './constants';
import {Tower} from './entities/Tower';
import {Base} from './entities/Base';
import {Rock} from './entities/Rock';
import {CanonTower} from './entities/towers';
import {HealerEnemy} from './entities/enemies';
import type {Enemy, EnemyKind} from './entities/Enemy';
import type {Munition, MunitionKind} from './entities/Munition';
import type {TowerType} from '../entities/towers/towerTypes';

/**
 * A frame the frontend can draw (docs/PRODUCT_CONCEPT.md §2).
 *
 * The engine emits two kinds of data: the compressed observation for the model
 * (`snapshot.ts`) and this render snapshot for the browser. It is intentionally
 * plain data — ids, positions, facing, life, projectiles, simulated time — so the
 * browser can interpolate and draw without ever running pathfinding, targeting,
 * damage or cash logic itself.
 *
 * Everything here is deterministic given the engine tick sequence, so the same
 * run yields byte-identical frames (apart from the entity ids, which are also
 * assigned deterministically in spawn order).
 */

export interface RenderEnemy {
    id: number;
    kind: EnemyKind;
    x: number;
    y: number;
    radius: number;
    life: number;
    damageTaken: number;
    /** Healer only: who it is currently healing, for the green link lines. */
    healTargets?: Array<{ x: number; y: number }>;
}

export interface RenderTower {
    /** Stable "i:j" id, matching the id the action layer uses. */
    id: string;
    type: TowerType;
    i: number;
    j: number;
    x: number;
    y: number;
    level: number;
    /** Facing in radians; 0 when the tower has no barrel. */
    angle: number;
    /** Range circle, drawn on hover. */
    aimRadius: number;
    targetInRange: boolean;
}

export interface RenderMunition {
    id: number;
    kind: MunitionKind;
    x: number;
    y: number;
    angle: number;
    charge: number;
    /** Emitter tower type, so the renderer can pick the right shot colour. */
    emitterType: TowerType;
    emitterX: number;
    emitterY: number;
    targetX: number;
    targetY: number;
}

export interface RenderBase {
    i: number;
    j: number;
    x: number;
    y: number;
    width: number;
    isHome: boolean;
    life: number;
    maxLife: number;
}

export interface RenderSnapshot {
    tick: number;
    state: EngineState;
    wave: number;
    cash: number;
    baseLife: number;
    baseMaxLife: number;
    grid: { width: number; height: number; tileSize: number };
    spawns: Array<{ i: number; j: number }>;
    bases: RenderBase[];
    rocks: Array<{ i: number; j: number }>;
    towers: RenderTower[];
    enemies: RenderEnemy[];
    munitions: RenderMunition[];
}

function towerAngle(tower: Tower): number {
    if (tower instanceof CanonTower) {
        return Math.atan2(tower.canonExtremity.y - tower.center.y, tower.canonExtremity.x - tower.center.x);
    }
    const aimed = tower as unknown as { angle?: number };
    return typeof aimed.angle === 'number' ? aimed.angle : 0;
}

function enemyView(enemy: Enemy): RenderEnemy {
    const view: RenderEnemy = {
        id: enemy.id,
        kind: enemy.kind,
        x: enemy.x,
        y: enemy.y,
        radius: enemy.radius,
        life: enemy.life,
        damageTaken: enemy.damageTaken,
    };

    if (enemy instanceof HealerEnemy) {
        // Only damaged targets get a link line (matches the old healer draw).
        view.healTargets = enemy.enemiesInHealRadius
            .filter(target => target.damageTaken > 0)
            .map(target => ({x: target.x, y: target.y}));
    }

    return view;
}

function baseView(base: Base): RenderBase {
    return {
        i: base.i,
        j: base.j,
        x: base.center.x,
        y: base.center.y,
        width: base.width,
        isHome: base.isHome,
        life: base.getLife(),
        maxLife: base.getMaxLife(),
    };
}

function munitionView(munition: Munition): RenderMunition {
    const visual = munition.visual();
    return {
        id: munition.id,
        kind: munition.kind,
        x: munition.x,
        y: munition.y,
        angle: visual.angle,
        charge: visual.charge,
        emitterType: munition.emitter.towerType,
        emitterX: munition.emitterCenter.x,
        emitterY: munition.emitterCenter.y,
        targetX: munition.target.x,
        targetY: munition.target.y,
    };
}

/** Build one frame from the current engine state. */
export function buildRenderSnapshot(engine: GameEngine): RenderSnapshot {
    const map = engine.map;
    const towers: RenderTower[] = [];
    const rocks: Array<{ i: number; j: number }> = [];

    for (let i = 0; i < map.grid.length; ++i) {
        for (let j = 0; j < map.grid[i].length; ++j) {
            const cell = map.grid[i][j];
            if (cell instanceof Tower) {
                towers.push({
                    id: `${cell.i}:${cell.j}`,
                    type: cell.towerType,
                    i: cell.i,
                    j: cell.j,
                    x: cell.center.x,
                    y: cell.center.y,
                    level: cell.level,
                    angle: towerAngle(cell),
                    aimRadius: cell.aimRadius,
                    targetInRange: cell.targetInRange || Boolean(cell.target),
                });
            } else if (cell instanceof Rock) {
                rocks.push({i, j});
            }
        }
    }

    const bases = [baseView(map.homeBase)];
    for (const base of map.enemyBases) {
        bases.push(baseView(base));
    }

    return {
        tick: engine.currentTick,
        state: engine.state,
        wave: engine.wave,
        cash: engine.cash.getBalance(),
        baseLife: map.homeBase.getLife(),
        baseMaxLife: map.homeBase.getMaxLife(),
        grid: {width: map.grid.length, height: map.grid[0].length, tileSize: TILE_SIZE},
        spawns: engine.map.enemyBases.map(base => ({i: base.i, j: base.j})),
        bases,
        rocks,
        towers,
        enemies: engine.enemies.all().map(enemyView),
        munitions: engine.munitions.all().map(munitionView),
    };
}
