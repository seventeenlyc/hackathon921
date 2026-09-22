/**
 * Shared vocabulary for the agent action layer.
 *
 * This module deliberately touches nothing from the browser or the game
 * singletons. `GameActions` and its tests must be runnable in a plain Node
 * process (AGENTS.md: agent action tests must run without a DOM), so anything
 * the model-facing contract needs lives here or in a dependency-free sibling.
 */

import { TowerType } from '../entities/towers/towerTypes';

/**
 * Machine-readable failure reasons. These strings are fed back to the model as
 * observations, so the wording is part of the interface — it is what lets the
 * model self-correct instead of retrying blindly.
 */
export const ACTION_ERRORS = [
    'UNKNOWN_TOWER_TYPE',
    'INVALID_COORDINATES',
    'GRID_OUT_OF_BOUNDS',
    'CELL_OCCUPIED',
    'BLOCKS_PATH',
    'INSUFFICIENT_FUNDS',
    'TOWER_NOT_FOUND',
    'ALREADY_MAX_LEVEL',
    'UPGRADE_FAILED',
] as const;

export type ActionError = typeof ACTION_ERRORS[number];

export interface ActionSuccess<T> {
    ok: true;
    data: T;
    message: string;
}

export interface ActionFailure {
    ok: false;
    error: ActionError;
    message: string;
}

export type ActionResult<T = {}> = ActionSuccess<T> | ActionFailure;

export interface TowerOption {
    type: TowerType;
    name: string;
    description: string;
    cost: number;
    aimRadius: number;
    /** Normalized damage per second; 0 for pure utility towers such as the slower. */
    dps: number;
}

export interface TowerInfo {
    id: string;
    type: TowerType;
    i: number;
    j: number;
    level: number;
    upgradeCost: number | null;
    aimRadius: number;
    damage: number;
    reloadMs: number;
    dps: number;
}

export interface EnemyCounts {
    simple: number;
    fast: number;
    armored: number;
    healer: number;
    boss: number;
    total: number;
}

/**
 * Compressed battlefield snapshot handed to the LLM. Kept deliberately small:
 * the model reasons about the situation, it does not need every entity.
 */
export interface GameSnapshot {
    wave: number;
    cash: number;
    baseLife: number;
    baseMaxLife: number;
    grid: { width: number; height: number };
    base: { i: number; j: number };
    spawns: Array<{ i: number; j: number }>;
    enemies: EnemyCounts;
    towers: TowerInfo[];
    towerOptions: TowerOption[];
}
