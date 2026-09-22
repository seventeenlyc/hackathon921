/**
 * Fixed map dimensions for the engine.
 *
 * These mirror the values the browser build kept as statics on `Map` so the
 * extracted engine reproduces the exact same battlefield geometry.
 */

export const GRID_W = 61;
export const GRID_H = 31;
export const TILE_SIZE = 40;

/** The four spawn points, in the order lanes are enabled. */
export const SPAWN_POINTS = [
    {i: 4, j: GRID_H - 5},
    {i: GRID_W - 5, j: 4},
    {i: GRID_W - 5, j: GRID_H - 5},
    {i: 4, j: 4},
];

/** Home base cell, matching the browser build's `addBase(GRID_W/2, GRID_H/2, true)`. */
export const HOME_BASE = {i: Math.floor(GRID_W / 2), j: Math.floor(GRID_H / 2)};

/** Rocks scattered at map construction, one A* probe each. */
export const ROCK_COUNT = 150;

/** Home base hit points, matching `Base.maxLife`. */
export const BASE_MAX_LIFE = 15;
