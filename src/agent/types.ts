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
    'UNKNOWN_ITEM',
    'ITEM_NOT_READY',
    'COOLDOWN',
    'ALREADY_ACTIVE',
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
    /** Whether this tower currently has a target inside its aim radius. */
    targetInRange: boolean;
}

export const ENEMY_TYPES = ['simple', 'fast', 'armored', 'healer', 'boss'] as const;

export type EnemyType = typeof ENEMY_TYPES[number];

/** Aggregated enemy info by type; the model gets composition, not coordinates. */
export interface EnemyGroup {
    type: EnemyType;
    count: number;
    /** Average max life (HP) of the living enemies in this group. */
    avgLife: number;
    /** Average remaining life; lower means the group is nearly dead. */
    avgRemainingLife: number;
}

/** The single most urgent enemy: the one closest to ending the run. */
export interface ThreatInfo {
    type: EnemyType;
    i: number;
    j: number;
    remainingLife: number;
    /** Estimated seconds until this enemy reaches the base. */
    etaSeconds: number;
}

export interface EnemyComposition {
    total: number;
    groups: EnemyGroup[];
    nearestThreat: ThreatInfo | null;
}

/** A cell worth building on, scored by how much of the enemy route it covers. */
export interface BuildCandidate {
    i: number;
    j: number;
    /** 0-based index into `lanes`: which spawn lane this cell would guard. */
    lane: number;
    /** Route cells within the reference aim radius; higher means longer coverage. */
    coverage: number;
    /** Route distance from this cell to the base, in tiles. Lower is nearer the base. */
    distanceToBase: number;
    /** Tactical route progression zone: frontline (near spawn), midfield, or base. */
    zone: 'frontline' | 'midfield' | 'base';
}

/**
 * A route cell a tower could stand on to make enemies walk farther (a maze,
 * spiral, snake or choke point). Unlike `BuildCandidate` these sit ON the
 * current route: building there reroutes enemies instead of only covering them.
 * The engine has already verified the placement leaves at least one path open.
 */
export interface PathShapingCandidate {
    i: number;
    j: number;
    /** 0-based index into `lanes`: which spawn lane's route this cell blocks. */
    lane: number;
    /** Extra route tiles this single placement adds to that lane. */
    addedTiles: number;
    /** Tactical zone along the lane: frontline (spawn area), midfield, or base. */
    zone: 'frontline' | 'midfield' | 'base';
}

/** The enemy route, compressed to its turns instead of every traversed cell. */
export interface PathInfo {
    waypoints: Array<{ i: number; j: number }>;
    /** Total route length in tiles. */
    length: number;
}

/** One spawn lane: where its enemies enter and the (compressed) route to the base. */
export interface LaneInfo {
    spawn: { i: number; j: number };
    path: PathInfo;
}

/** Tactical item status in the snapshot. */
export const ITEM_KEYS = ['natural_oil', 'tripo', 'seeed_studio', 'evomap', 'hypershell'] as const;
export type ItemKey = typeof ITEM_KEYS[number];

export function isItemKey(value: string): value is ItemKey {
    return (ITEM_KEYS as readonly string[]).includes(value);
}

export interface ItemStateSnapshot {
    name: string;
    cost: number;
    ready: boolean;
    active: boolean;
    cooldownRemainingMs?: number;
    activeRemainingMs?: number;
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
    /** Every lane currently on the map, in spawn order; index matches `buildCandidates[].lane`. */
    lanes: LaneInfo[];
    enemies: EnemyComposition;
    towers: TowerInfo[];
    towerOptions: TowerOption[];
    buildCandidates: BuildCandidate[];
    /**
     * Cells whose placement lengthens the route, for path-shaping strategies.
     * Empty when the engine cannot answer the hypothetical (see snapshot.ts).
     */
    pathShapingCandidates: PathShapingCandidate[];
    /** Tactical items available to the AI. */
    items?: ItemStateSnapshot[];
}
