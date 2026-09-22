import {
    ActionError,
    ActionResult,
    EnemyCounts,
    GameSnapshot,
    TowerInfo,
    TowerOption,
} from './types';
import { isTowerType, TowerType, TOWER_TYPES } from '../entities/towers/towerTypes';

/**
 * The only seam through which an AI is allowed to change the battlefield.
 *
 * `GameActions` owns the *rules* (bounds, occupancy, affordability, max level)
 * and the model-facing result wording; the `Battlefield` implementation owns
 * the *world* (the actual grid, pathfinder and cash). Neither trusts the model:
 * a caller can only mutate the world by going through `GameActions`, and every
 * world-dependent check is answered by `Battlefield`, never by the model.
 */
export interface Battlefield {
    readonly gridWidth: number;
    readonly gridHeight: number;
    readonly maxTowerLevel: number;

    cash(): number;

    towerOptions(): TowerOption[];

    towers(): TowerInfo[];

    towerAt(i: number, j: number): TowerInfo | undefined;

    /**
     * Authoritative placement legality beyond bounds/occupancy. An occupied
     * cell and a placement that would seal off every enemy spawn must both be
     * rejected here.
     */
    canPlaceAt(i: number, j: number): { ok: boolean; error?: ActionError };

    canAfford(amount: number): boolean;

    /** Primitives. Call only after `GameActions` has validated the request. */
    build(type: TowerType, i: number, j: number): void;

    upgrade(id: string): boolean;

    // --- read-only context for the snapshot ---
    wave(): number;
    baseLife(): number;
    baseMaxLife(): number;
    base(): { i: number; j: number };
    spawns(): Array<{ i: number; j: number }>;
    enemies(): EnemyCounts;
}

function towerId(i: number, j: number): string {
    return `${i}:${j}`;
}

function parseTowerId(id: string): { i: number; j: number } | undefined {
    const match = /^(\d+):(\d+)$/.exec(id);
    if (!match) return undefined;
    return { i: Number(match[1]), j: Number(match[2]) };
}

function success<T>(data: T, message: string): ActionResult<T> {
    return { ok: true, data, message };
}

function failure(error: ActionError, message: string): ActionResult<never> {
    return { ok: false, error, message };
}

export class GameActions {
    constructor(private readonly battlefield: Battlefield) {}

    /**
     * Build a tower. Every rejection returns a structured, model-readable error
     * instead of throwing or silently doing nothing (fail closed).
     */
    buildTower(rawType: string, i: number, j: number): ActionResult<{ towerId: string; cost: number }> {
        if (!isTowerType(rawType)) {
            return failure(
                'UNKNOWN_TOWER_TYPE',
                `Unknown tower type "${rawType}". Valid types: ${TOWER_TYPES.join(', ')}.`
            );
        }

        if (!Number.isInteger(i) || !Number.isInteger(j)) {
            return failure('INVALID_COORDINATES', `Coordinates must be integers, got (${i}, ${j}).`);
        }

        if (i < 0 || j < 0 || i >= this.battlefield.gridWidth || j >= this.battlefield.gridHeight) {
            return failure(
                'GRID_OUT_OF_BOUNDS',
                `Cell (${i}, ${j}) is outside the ${this.battlefield.gridWidth}x${this.battlefield.gridHeight} grid.`
            );
        }

        const option = this.optionFor(rawType);
        if (!option) {
            return failure('UNKNOWN_TOWER_TYPE', `Tower type "${rawType}" is not available in this game.`);
        }

        if (this.battlefield.towerAt(i, j)) {
            return failure('CELL_OCCUPIED', `Cell (${i}, ${j}) already holds a tower.`);
        }

        const placement = this.battlefield.canPlaceAt(i, j);
        if (!placement.ok) {
            const error = placement.error ?? 'BLOCKS_PATH';
            const message =
                error === 'BLOCKS_PATH'
                    ? `Placing a tower at (${i}, ${j}) would block the path from a spawn to the base.`
                    : `Cell (${i}, ${j}) cannot be built on (${error}).`;
            return failure(error, message);
        }

        if (!this.battlefield.canAfford(option.cost)) {
            return failure(
                'INSUFFICIENT_FUNDS',
                `A ${rawType} costs ${option.cost} but only ${this.battlefield.cash()} cash is available.`
            );
        }

        this.battlefield.build(rawType, i, j);
        return success(
            { towerId: towerId(i, j), cost: option.cost },
            `Built a ${rawType} at (${i}, ${j}) for ${option.cost} cash.`
        );
    }

    upgradeTower(id: string): ActionResult<{ level: number; upgradeCost: number }> {
        const coords = parseTowerId(id);
        if (!coords) {
            return failure('TOWER_NOT_FOUND', `"${id}" is not a valid tower id. Expected "i:j".`);
        }

        const tower = this.battlefield.towerAt(coords.i, coords.j);
        if (!tower) {
            return failure('TOWER_NOT_FOUND', `No tower exists at (${coords.i}, ${coords.j}).`);
        }

        if (tower.upgradeCost === null) {
            return failure('ALREADY_MAX_LEVEL', `Tower ${id} is already at max level ${this.battlefield.maxTowerLevel}.`);
        }

        const upgradeCost = tower.upgradeCost;
        // Capture before mutating: some Battlefield implementations return a live
        // reference, so reading `tower.level` after upgrade would double-count.
        const currentLevel = tower.level;

        if (!this.battlefield.canAfford(upgradeCost)) {
            return failure(
                'INSUFFICIENT_FUNDS',
                `Upgrading tower ${id} costs ${upgradeCost} but only ${this.battlefield.cash()} cash is available.`
            );
        }

        if (!this.battlefield.upgrade(id)) {
            return failure('UPGRADE_FAILED', `The engine rejected the upgrade of tower ${id}.`);
        }

        return success(
            { level: currentLevel + 1, upgradeCost },
            `Upgraded tower ${id} to level ${currentLevel + 1} for ${upgradeCost} cash.`
        );
    }

    getState(): GameSnapshot {
        return {
            wave: this.battlefield.wave(),
            cash: this.battlefield.cash(),
            baseLife: this.battlefield.baseLife(),
            baseMaxLife: this.battlefield.baseMaxLife(),
            grid: { width: this.battlefield.gridWidth, height: this.battlefield.gridHeight },
            base: this.battlefield.base(),
            spawns: this.battlefield.spawns(),
            enemies: this.battlefield.enemies(),
            towers: this.battlefield.towers(),
            towerOptions: this.battlefield.towerOptions(),
        };
    }

    private optionFor(type: TowerType): TowerOption | undefined {
        return this.battlefield.towerOptions().find(option => option.type === type);
    }
}
