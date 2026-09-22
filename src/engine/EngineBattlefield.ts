import {fps} from '../config.json';
import type {Battlefield} from '../agent/GameActions';
import type {ActionError, GameSnapshot, TowerInfo, TowerOption} from '../agent/types';
import type {EnemySample, LaneRoute} from '../agent/snapshot';
import {buildSnapshot} from '../agent/snapshot';
import type {Point} from '../interfaces/Point';
import type {TowerType} from '../entities/towers/towerTypes';
import {TILE_SIZE} from './constants';
import {GameMap} from './GameMap';
import type {GameEngine} from './GameEngine';
import type {Enemy} from './entities/Enemy';
import {Tower, dpsOf, numericDamage} from './entities/Tower';
import {TOWER_CATALOG, TOWER_ORDER} from './entities/towerCatalog';

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
 * Binds the `GameActions` rule layer to one engine instance.
 *
 * The browser had `InertBattlefield` reading the live singletons; this is the
 * headless twin. `GameActions` itself is unchanged, so the AI action contract —
 * error codes, validation order, "no mutation on failure" — is identical on the
 * server. Placement legality and cash are answered by the engine, never the model.
 */
export class EngineBattlefield implements Battlefield {
    readonly gridWidth = GameMap.GRID_W;
    readonly gridHeight = GameMap.GRID_H;
    readonly maxTowerLevel = 5;

    constructor(private readonly engine: GameEngine) {
    }

    cash(): number {
        return this.engine.cash.getBalance();
    }

    canAfford(amount: number): boolean {
        return this.engine.cash.canWithdraw(amount);
    }

    towerAt(i: number, j: number): TowerInfo | undefined {
        const row = this.engine.map.grid[i];
        const cell = row ? row[j] : undefined;
        if (!(cell instanceof Tower)) return undefined;
        return this.infoFor(cell);
    }

    towers(): TowerInfo[] {
        const result: TowerInfo[] = [];
        const grid = this.engine.map.grid;

        for (let i = 0; i < grid.length; ++i) {
            for (let j = 0; j < grid[i].length; ++j) {
                const cell = grid[i][j];
                if (cell instanceof Tower) result.push(this.infoFor(cell));
            }
        }
        return result;
    }

    towerOptions(): TowerOption[] {
        return TOWER_ORDER.map(type => {
            const tower = new TOWER_CATALOG[type](0, 0, TILE_SIZE, this.engine.world);
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
        const row = this.engine.map.grid[i];
        const cell = row ? row[j] : 0;
        if (cell !== 0) {
            return {ok: false, error: 'CELL_OCCUPIED'};
        }
        // map.canBePlaced() temporarily marks the cell and re-runs A*; it is the
        // authoritative answer for "would this seal off an enemy spawn?".
        if (!this.engine.map.canBePlaced(i, j)) {
            return {ok: false, error: 'BLOCKS_PATH'};
        }
        return {ok: true};
    }

    build(type: TowerType, i: number, j: number): void {
        // Read the cost from a throwaway instance (the constructor needs a world),
        // then let the map build the real one and charge for it only on success.
        const tower = new TOWER_CATALOG[type](0, 0, TILE_SIZE, this.engine.world);
        if (this.engine.map.addElement(i, j, TOWER_CATALOG[type])) {
            this.engine.cash.withdraw(tower.cost);
        }
    }

    upgrade(id: string): boolean {
        const match = /^(\d+):(\d+)$/.exec(id);
        if (!match) return false;

        const row = this.engine.map.grid[Number(match[1])];
        const tower = row ? row[Number(match[2])] : undefined;
        if (!(tower instanceof Tower)) return false;

        // The action layer already checked affordability; actually charging here is
        // the contract the fake battlefield in game-actions.test.js encodes. The
        // browser's InertBattlefield forgot to withdraw, i.e. upgrades were free;
        // the engine implements the rule as specified instead.
        const cost = tower.upgradeCost;
        if (cost === null || !tower.applyUpgrade()) return false;
        this.engine.cash.withdraw(cost);
        return true;
    }

    /**
     * The compressed observation for the model. Semantics live in `snapshot.ts`;
     * this only gathers engine values and the two cheap/authoritative predicates.
     */
    snapshot(): GameSnapshot {
        const engine = this.engine;

        const enemies: EnemySample[] = engine.enemies.all().map(enemy => ({
            type: enemy.kind,
            life: enemy.life,
            damageTaken: enemy.damageTaken,
            i: Math.floor(enemy.x / TILE_SIZE),
            j: Math.floor(enemy.y / TILE_SIZE),
            etaSeconds: this.etaSeconds(enemy),
        }));

        return buildSnapshot({
            wave: engine.scheduler.waveCounter,
            cash: engine.cash.getBalance(),
            baseLife: engine.map.homeBase.getLife(),
            baseMaxLife: engine.map.homeBase.getMaxLife(),
            gridWidth: GameMap.GRID_W,
            gridHeight: GameMap.GRID_H,
            base: {i: engine.map.homeBase.i, j: engine.map.homeBase.j},
            spawns: engine.map.enemyBases.map(base => ({i: base.i, j: base.j})),
            enemies,
            towers: this.towers(),
            towerOptions: this.towerOptions(),
            routes: this.allRoutes(),
            isFree: (i, j) => Boolean(engine.map.grid[i]) && engine.map.grid[i][j] === 0,
            isBuildable: (i, j) => engine.map.canBePlaced(i, j),
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

    /**
     * Seconds until the enemy reaches the base. `getPath()` already starts at the
     * enemy's current cell; speed is pixels per simulation step, hence the fps factor.
     */
    private etaSeconds(enemy: Enemy): number {
        const path = enemy.getPath();
        if (!path || path.length === 0) return 9999;
        const pixelsPerSecond = Math.max(enemy.speed * fps, 1);
        return pathLengthPixels(path) / pixelsPerSecond;
    }

    /** Every spawn lane, in spawn order, so the model can see and cover all of them. */
    private allRoutes(): LaneRoute[] {
        const routes: LaneRoute[] = [];

        for (const base of this.engine.map.enemyBases) {
            const path = this.engine.map.getPathFromGridCell(base.i, base.j);
            if (!path) continue;
            routes.push({
                spawn: {i: base.i, j: base.j},
                cells: path.map(point => ({
                    i: Math.floor(point.x / TILE_SIZE),
                    j: Math.floor(point.y / TILE_SIZE),
                })),
            });
        }

        return routes;
    }
}
