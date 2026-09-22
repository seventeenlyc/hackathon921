import {
    ActionError,
    ActionResult,
    GameSnapshot,
    TowerInfo,
    TowerOption,
} from './types';
import { isTowerType, TowerType, TOWER_TYPES } from '../entities/towers/towerTypes';
import {t} from '../i18n';

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

    /**
     * The compressed observation handed to the model. Built by the adapter from
     * the live engine (see snapshot.ts); GameActions only forwards it.
     */
    snapshot(): GameSnapshot;
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
                t('action.unknownType', {type: rawType, types: TOWER_TYPES.join(', ')})
            );
        }

        if (!Number.isInteger(i) || !Number.isInteger(j)) {
            return failure('INVALID_COORDINATES', t('action.invalidCoords', {i, j}));
        }

        if (i < 0 || j < 0 || i >= this.battlefield.gridWidth || j >= this.battlefield.gridHeight) {
            return failure(
                'GRID_OUT_OF_BOUNDS',
                t('action.outOfBounds', {i, j, w: this.battlefield.gridWidth, h: this.battlefield.gridHeight})
            );
        }

        const option = this.optionFor(rawType);
        if (!option) {
            return failure('UNKNOWN_TOWER_TYPE', t('action.typeUnavailable', {type: rawType}));
        }

        if (this.battlefield.towerAt(i, j)) {
            return failure('CELL_OCCUPIED', t('action.cellOccupied', {i, j}));
        }

        // An unaffordable tower cannot be built anywhere; report that before
        // probing paths so moving the cursor cannot obscure the funding problem.
        if (!this.battlefield.canAfford(option.cost)) {
            return failure(
                'INSUFFICIENT_FUNDS',
                t('action.insufficientBuild', {type: rawType, cost: option.cost, cash: this.battlefield.cash()})
            );
        }

        const placement = this.battlefield.canPlaceAt(i, j);
        if (!placement.ok) {
            const error = placement.error ?? 'BLOCKS_PATH';
            const message =
                error === 'BLOCKS_PATH'
                    ? t('action.blocksPath', {i, j})
                    : t('action.cellUnbuildable', {i, j, error});
            return failure(error, message);
        }

        this.battlefield.build(rawType, i, j);
        return success(
            { towerId: towerId(i, j), cost: option.cost },
            t('action.built', {i, j, type: rawType, cost: option.cost})
        );
    }

    upgradeTower(id: string): ActionResult<{ level: number; upgradeCost: number }> {
        const coords = parseTowerId(id);
        if (!coords) {
            return failure('TOWER_NOT_FOUND', t('action.badTowerId', {id}));
        }

        const tower = this.battlefield.towerAt(coords.i, coords.j);
        if (!tower) {
            return failure('TOWER_NOT_FOUND', t('action.noTower', {i: coords.i, j: coords.j}));
        }

        if (tower.upgradeCost === null) {
            return failure('ALREADY_MAX_LEVEL', t('action.maxLevel', {id, level: this.battlefield.maxTowerLevel}));
        }

        const upgradeCost = tower.upgradeCost;
        // Capture before mutating: some Battlefield implementations return a live
        // reference, so reading `tower.level` after upgrade would double-count.
        const currentLevel = tower.level;

        if (!this.battlefield.canAfford(upgradeCost)) {
            return failure(
                'INSUFFICIENT_FUNDS',
                t('action.insufficientUpgrade', {id, cost: upgradeCost, cash: this.battlefield.cash()})
            );
        }

        if (!this.battlefield.upgrade(id)) {
            return failure('UPGRADE_FAILED', t('action.upgradeFailed', {id}));
        }

        return success(
            { level: currentLevel + 1, upgradeCost },
            t('action.upgraded', {id, level: currentLevel + 1, cost: upgradeCost})
        );
    }

    getState(): GameSnapshot {
        return this.battlefield.snapshot();
    }

    private optionFor(type: TowerType): TowerOption | undefined {
        return this.battlefield.towerOptions().find(option => option.type === type);
    }
}
