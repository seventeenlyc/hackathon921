import {map, Map} from '../Map';
import {fps} from '../config.json';
import {cashManager} from '../CashManager';
import {enemyManager} from '../EnemyManager';
import {waveManager} from '../WavesManager';
import {Tower} from '../entities/towers/Tower';
import {TOWER_CATALOG, TOWER_ORDER} from '../entities/towers/towerCatalog';
import {TowerType} from '../entities/towers/towerTypes';
import {SimpleEnemy} from '../entities/enemies/SimpleEnemy';
import {FastEnemy} from '../entities/enemies/FastEnemy';
import {ArmoredEnemy} from '../entities/enemies/ArmoredEnemy';
import {HealerEnemy} from '../entities/enemies/HealerEnemy';
import {BossEnemy} from '../entities/enemies/BossEnemy';
import {Enemy} from '../entities/enemies/Enemy';
import {Point} from '../interfaces/Point';
import {ActionError, EnemyType, GameSnapshot, TowerInfo, TowerOption} from './types';
import {Battlefield} from './GameActions';
import {buildSnapshot, EnemySample, LaneRoute} from './snapshot';

function numericDamage(tower: Tower): number {
    const damage = tower.damage;
    if (typeof damage === 'number') return damage;
    return (damage.min + damage.max) / 2;
}

function dpsOf(tower: Tower): number {
    if (tower.reloadDurationMs <= 0) return 0;
    return Number((numericDamage(tower) / (tower.reloadDurationMs / 1000)).toFixed(1));
}

function pathLengthPixels(points: Point[]): number {
    let total = 0;
    for (let index = 1; index < points.length; ++index) {
        const dx = points[index].x - points[index - 1].x;
        const dy = points[index].y - points[index - 1].y;
        total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
}

/**
 * Adapter binding the agent action layer to the live inert singletons.
 *
 * This is the only place that reads or writes the concrete game objects on
 * behalf of the AI. `GameActions` must never be handed the map, the cash
 * manager or an entity directly — everything goes through this port.
 */
export class InertBattlefield implements Battlefield {
    readonly gridWidth = Map.GRID_W;
    readonly gridHeight = Map.GRID_H;
    readonly maxTowerLevel = 5;

    cash(): number {
        return cashManager.getBalance();
    }

    canAfford(amount: number): boolean {
        return cashManager.canWithdraw(amount);
    }

    towerAt(i: number, j: number): TowerInfo | undefined {
        const cell = map.grid[i] && map.grid[i][j];
        if (!(cell instanceof Tower)) return undefined;
        return this.infoFor(cell);
    }

    towers(): TowerInfo[] {
        const result: TowerInfo[] = [];
        for (let i = 0; i < map.grid.length; ++i) {
            for (let j = 0; j < map.grid[i].length; ++j) {
                const cell = map.grid[i][j];
                if (cell instanceof Tower) result.push(this.infoFor(cell));
            }
        }
        return result;
    }

    towerOptions(): TowerOption[] {
        return TOWER_ORDER.map(type => {
            const tower = new (TOWER_CATALOG[type])(0, 0, Map.TILE_SIZE);
            return {
                type,
                name: tower.name,
                description: tower.description,
                cost: tower.cost,
                aimRadius: tower.aimRadius,
                dps: dpsOf(tower),
            };
        });
    }

    canPlaceAt(i: number, j: number): { ok: boolean; error?: ActionError } {
        const cell = map.grid[i] && map.grid[i][j];
        if (cell !== 0) {
            return {ok: false, error: 'CELL_OCCUPIED'};
        }
        // map.canBePlaced() temporarily marks the cell and re-runs A*; it is the
        // authoritative answer for "would this seal off an enemy spawn?".
        if (!map.canBePlaced(i, j)) {
            return {ok: false, error: 'BLOCKS_PATH'};
        }
        return {ok: true};
    }

    build(type: TowerType, i: number, j: number): void {
        map.addElement(i, j, TOWER_CATALOG[type]);
    }

    upgrade(id: string): boolean {
        const match = /^(\d+):(\d+)$/.exec(id);
        if (!match) return false;
        const tower = map.grid[Number(match[1])] && map.grid[Number(match[1])][Number(match[2])];
        if (!(tower instanceof Tower)) return false;
        return tower.applyUpgrade();
    }

    /**
     * The compressed observation for the model (issue #4). The semantics live in
     * snapshot.ts; this only gathers live values and the two cheap/authoritative
     * cell predicates.
     */
    snapshot(): GameSnapshot {
        const enemies: EnemySample[] = enemyManager.all().map(enemy => ({
            type: this.enemyType(enemy),
            life: enemy.life,
            damageTaken: enemy.damageTaken,
            i: Math.floor(enemy.x / Map.TILE_SIZE),
            j: Math.floor(enemy.y / Map.TILE_SIZE),
            etaSeconds: this.etaSeconds(enemy),
        }));

        return buildSnapshot({
            wave: waveManager.waveCounter,
            cash: cashManager.getBalance(),
            baseLife: map.homeBase.getLife(),
            baseMaxLife: map.homeBase.getMaxLife(),
            gridWidth: Map.GRID_W,
            gridHeight: Map.GRID_H,
            base: {i: map.homeBase.i, j: map.homeBase.j},
            spawns: map.enemyBases.map(base => ({i: base.i, j: base.j})),
            enemies,
            towers: this.towers(),
            towerOptions: this.towerOptions(),
            routes: this.allRoutes(),
            isFree: (i, j) => Boolean(map.grid[i]) && map.grid[i][j] === 0,
            isBuildable: (i, j) => map.canBePlaced(i, j),
        });
    }

    private infoFor(tower: Tower): TowerInfo {
        return {
            id: `${tower.i}:${tower.j}`,
            type: tower.towerType,
            i: tower.i,
            j: tower.j,
            level: tower.level,
            upgradeCost: tower.upgradeCost,
            aimRadius: tower.aimRadius,
            damage: numericDamage(tower),
            reloadMs: tower.reloadDurationMs,
            dps: dpsOf(tower),
            targetInRange: tower.targetInRange || Boolean(tower.target),
        };
    }

    private enemyType(enemy: Enemy): EnemyType {
        if (enemy instanceof BossEnemy) return 'boss';
        if (enemy instanceof HealerEnemy) return 'healer';
        if (enemy instanceof ArmoredEnemy) return 'armored';
        if (enemy instanceof FastEnemy) return 'fast';
        if (enemy instanceof SimpleEnemy) return 'simple';
        return 'simple';
    }

    /**
     * Seconds until the enemy reaches the base. `getPath()` already starts at the
     * enemy's current cell, so the path length is the remaining distance; speed is
     * pixels per simulation step, hence the fps factor.
     */
    private etaSeconds(enemy: Enemy): number {
        const path = enemy.getPath();
        if (!path || path.length === 0) return 9999;
        const pixelsPerSecond = Math.max(enemy.speed * fps, 1);
        return pathLengthPixels(path) / pixelsPerSecond;
    }

    /**
     * Every spawn lane, in spawn order. A single "main route" used to be enough
     * when the map had one lane; with a live lane count (issue #40) the model
     * must see them all or it will only ever defend the first one.
     */
    private allRoutes(): LaneRoute[] {
        const routes: LaneRoute[] = [];

        for (const base of map.enemyBases) {
            const path = map.getPathFromGridCell(base.i, base.j);
            if (!path) continue;
            routes.push({
                spawn: {i: base.i, j: base.j},
                cells: path.map(point => ({
                    i: Math.floor(point.x / Map.TILE_SIZE),
                    j: Math.floor(point.y / Map.TILE_SIZE),
                })),
            });
        }

        return routes;
    }
}
