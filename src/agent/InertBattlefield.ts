import {map, Map} from '../Map';
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
import {ActionError, EnemyCounts, TowerInfo, TowerOption} from './types';
import {Battlefield} from './GameActions';

function numericDamage(tower: Tower): number {
    const damage = tower.damage;
    if (typeof damage === 'number') return damage;
    return (damage.min + damage.max) / 2;
}

function dpsOf(tower: Tower): number {
    if (tower.reloadDurationMs <= 0) return 0;
    return Number((numericDamage(tower) / (tower.reloadDurationMs / 1000)).toFixed(1));
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

    wave(): number {
        return waveManager.waveCounter;
    }

    baseLife(): number {
        return map.homeBase.getLife();
    }

    baseMaxLife(): number {
        return map.homeBase.getMaxLife();
    }

    base(): { i: number; j: number } {
        return {i: map.homeBase.i, j: map.homeBase.j};
    }

    spawns(): Array<{ i: number; j: number }> {
        return map.enemyBases.map(base => ({i: base.i, j: base.j}));
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

    enemies(): EnemyCounts {
        const counts: EnemyCounts = {simple: 0, fast: 0, armored: 0, healer: 0, boss: 0, total: 0};
        for (const enemy of enemyManager.all()) {
            if (enemy instanceof BossEnemy) counts.boss += 1;
            else if (enemy instanceof HealerEnemy) counts.healer += 1;
            else if (enemy instanceof ArmoredEnemy) counts.armored += 1;
            else if (enemy instanceof FastEnemy) counts.fast += 1;
            else if (enemy instanceof SimpleEnemy) counts.simple += 1;
            counts.total += 1;
        }
        return counts;
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
        };
    }
}
