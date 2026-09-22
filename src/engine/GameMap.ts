import {EventEmitter} from '../tools/EventEmitter';
import {easyAStar} from '../tools/astar';
import type {Point} from '../interfaces/Point';
import {
    GRID_H,
    GRID_W,
    HOME_BASE,
    ROCK_COUNT,
    SPAWN_POINTS,
    TILE_SIZE,
} from './constants';
import type {Rng} from './Rng';
import type {EngineWorld} from './world';
import {Base} from './entities/Base';
import {Rock} from './entities/Rock';
import {Tower} from './entities/Tower';

type Cell = Tower | Base | Rock | 0 | 1;
type ElementConstructor = new (i: number, j: number, width: number, world: EngineWorld) => Tower | Rock;

/**
 * The battlefield grid, pathfinding and spawn lanes — one per game instance.
 *
 * Ported from the browser `Map` with three changes: the rock scatter draws from
 * the injected seeded `Rng` instead of `Math.random`; the lane count (difficulty)
 * is a constructor argument instead of a `window.location` query param; and the
 * cell `update()` pass only drives towers (bases and rocks only ever computed
 * mouse hover, which is a view concern).
 */
export class GameMap extends EventEmitter {
    public static GRID_W = GRID_W;
    public static GRID_H = GRID_H;
    public static TILE_SIZE = TILE_SIZE;
    public static SPAWN_POINTS = SPAWN_POINTS;

    public grid: Cell[][] = new Array(GRID_W).fill(0).map(() => new Array(GRID_H).fill(0));
    public homeBase: Base;
    public enemyBases: Base[] = [];

    private pathsCache: { [k: string]: Point[] | false } = {};
    private world: EngineWorld | null = null;

    constructor(rng: Rng, difficulty: number) {
        super();

        this.homeBase = this.addBase(HOME_BASE.i, HOME_BASE.j, true);

        this.enemyBases.push(this.addBase(SPAWN_POINTS[0].i, SPAWN_POINTS[0].j));
        for (let index = 1; index < difficulty; ++index) {
            this.enemyBases.push(this.addBase(SPAWN_POINTS[index].i, SPAWN_POINTS[index].j));
        }

        for (let i = 0; i < ROCK_COUNT; i++) {
            this.addElement(rng.int(this.grid.length), rng.int(this.grid[0].length), Rock);
        }
    }

    /** Wired by the engine after the enemy list exists; without it, path checks skip the live-enemy guard. */
    setWorld(world: EngineWorld) {
        this.world = world;
    }

    /**
     * Add or remove spawn lanes on a live map. Rocks on a spawn point are
     * cleared, but a tower is never bulldozed to make room for a lane. Paths are
     * invalidated and the `added` event tells the engine to recompute enemies.
     */
    setSpawnCount(count: number): number {
        const target = Math.max(1, Math.min(SPAWN_POINTS.length, Math.floor(count)));

        while (this.enemyBases.length > target) {
            const base = this.enemyBases.pop()!;
            this.grid[base.i][base.j] = 0;
        }

        while (this.enemyBases.length < target) {
            const point = SPAWN_POINTS[this.enemyBases.length];
            const cell = this.grid[point.i][point.j];

            if (cell instanceof Rock) {
                this.grid[point.i][point.j] = 0;
            } else if (cell !== 0) {
                break;
            }

            this.enemyBases.push(this.addBase(point.i, point.j));
        }

        this.invalidatePathsCache();
        this.emit('added');

        return this.enemyBases.length;
    }

    pathFind(i: number, j: number) {
        return easyAStar(
            (x, y) => {
                return this.grid[x] && this.grid[x][y] !== undefined && (this.grid[x][y] === 0 || (<Tower | Rock>this.grid[x][y]).traversable);
            },
            {x: i, y: j},
            {
                x: this.homeBase.i,
                y: this.homeBase.j,
            }
        );
    }

    getPathFromGridCell(i: number, j: number) {
        const key = `${i}-${j}`;
        const fromCache = this.pathsCache[key];

        if (fromCache !== undefined) {
            return fromCache;
        } else {
            let path = this.pathFind(i, j);

            if (path) {
                path = path.map(value => ({
                    x: value.x * TILE_SIZE + TILE_SIZE / 2,
                    y: value.y * TILE_SIZE + TILE_SIZE / 2,
                }));
            }

            return this.pathsCache[key] = path;
        }
    }

    invalidatePathsCache() {
        this.pathsCache = {};
    }

    addElement(i: number, j: number, elementClass: ElementConstructor): boolean {
        if (this.canBePlaced(i, j)) {
            this.grid[i][j] = new elementClass(i, j, TILE_SIZE, this.world as EngineWorld);
            this.invalidatePathsCache();
            this.emit('added');
            return true;
        }
        return false;
    }

    addBase(i: number, j: number, isHome = false): Base {
        const base = new Base(i, j, TILE_SIZE, isHome);
        this.grid[i][j] = base;
        return base;
    }

    canBePlaced(i: number, j: number) {
        if (this.grid[i] && this.grid[i][j] === 0) {
            this.grid[i][j] = 1;

            // A probe must not mutate anything, including the path cache: the
            // temporary block above would otherwise let `enemies.canAllReachBase()`
            // cache a rerouted (or false) path for an enemy's current cell, and a
            // later `updatePaths()` after a build would then reuse that stale entry.
            const savedCache = this.pathsCache;
            this.pathsCache = {};

            const canBePlaced = this.enemyBases.every(base => this.pathFind(base.i, base.j))
                && (this.world ? this.world.enemies.canAllReachBase() : true);

            this.pathsCache = savedCache;
            this.grid[i][j] = 0;
            return canBePlaced;
        } else {
            return false;
        }
    }

    /**
     * Cheap placement probe for the AI *observation* only.
     *
     * The authoritative \`canBePlaced\` additionally runs \`enemies.canAllReachBase()\`,
     * which is one A* per live enemy; snapshot building called it up to 16 times
     * per wave, so its cost grew with the number of enemies (measured: ~0.6 s at
     * ~100 enemies, blocking the single-threaded loop). This probe only checks
     * that every spawn still reaches the base.
     *
     * A cell it approves can therefore trap an enemy in a pocket; the real build
     * still goes through \`canBePlaced\` and is rejected with BLOCKS_PATH, which the
     * model sees. That is the same trade-off upstream made for path-shaping.
     */
    canBePlacedForObservation(i: number, j: number) {
        if (this.grid[i] && this.grid[i][j] === 0) {
            this.grid[i][j] = 1;

            const savedCache = this.pathsCache;
            this.pathsCache = {};

            const ok = this.enemyBases.every(base => this.pathFind(base.i, base.j));

            this.pathsCache = savedCache;
            this.grid[i][j] = 0;
            return ok;
        }
        return false;
    }

    /** Only towers have simulation to advance; bases and rocks updated hover in the old build. */
    update() {
        this.grid.forEach(row => row.forEach(el => {
            if (el instanceof Tower) {
                el.update();
            }
        }));
    }
}
