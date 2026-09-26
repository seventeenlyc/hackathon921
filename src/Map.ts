import {Base} from "./entities/terrain/Base";
import {GridRenderable} from "./interfaces/GridRenderable";
import {Rock} from "./entities/terrain/Rock";
import {Point} from "./interfaces/Point";
import {easyAStar} from "./tools/astar";
import {randIndex} from "./tools/helphers";
import {enemyManager} from "./EnemyManager";
import {EventEmitter} from "./tools/EventEmitter";
import {drawRoundedSquare} from "./tools/shapes";
import {allSpawnPointsReachable, canPlaceTowerAt} from "./agent/SpawnRoutes";

class Map extends EventEmitter {
    public static GRID_W = 61;
    public static GRID_H = 31;
    public grid: (GridRenderable | 0 | 1)[][] = new Array(Map.GRID_W).fill(0).map(() => new Array(Map.GRID_H).fill(0));
    public static TILE_SIZE: number = 40;

    /** The four spawn points, in the order lanes are enabled (issue #40). */
    public static SPAWN_POINTS = [
        {i: 4, j: Map.GRID_H - 5},
        {i: Map.GRID_W - 5, j: 4},
        {i: Map.GRID_W - 5, j: Map.GRID_H - 5},
        {i: 4, j: 4},
    ];

    public homeBase: Base;
    public enemyBases: Base[] = [];
    private pathsCache: { [k: string]: Point[] | false } = {}

    constructor() {
        super();
        this.homeBase = this.addBase(Math.floor(Map.GRID_W / 2), Math.floor(Map.GRID_H / 2), true);

        this.enemyBases.push(this.addBase(Map.SPAWN_POINTS[0].i, Map.SPAWN_POINTS[0].j))

        for (let i = 0; i < 150; i++) {
            this.addElement(randIndex(this.grid), randIndex(this.grid[0]), Rock)
        }
    }

    /**
     * Add or remove spawn lanes on a live map (issue #40).
     *
     * Rocks on a spawn point are cleared, but any other occupied cell is an
     * invariant failure. Paths are invalidated and recomputed, otherwise the
     * new lane would keep using stale A* results.
     */
    setSpawnCount(count: number): number {
        const target = Math.max(1, Math.min(Map.SPAWN_POINTS.length, Math.floor(count)));

        for (let index = this.enemyBases.length; index < target; ++index) {
            const point = Map.SPAWN_POINTS[index];
            const cell = this.grid[point.i][point.j];
            if (cell !== 0 && !(cell instanceof Rock)) {
                throw new Error('SPAWN_ROUTE_UNREACHABLE');
            }
        }

        while (this.enemyBases.length > target) {
            const base = this.enemyBases.pop()!;
            this.grid[base.i][base.j] = 0;
        }

        while (this.enemyBases.length < target) {
            const point = Map.SPAWN_POINTS[this.enemyBases.length];
            const cell = this.grid[point.i][point.j];

            if (cell instanceof Rock) {
                this.grid[point.i][point.j] = 0;
            }

            this.enemyBases.push(this.addBase(point.i, point.j));
        }

        this.invalidatePathsCache();
        // `added` is what makes Game recompute enemy routes and what
        // canBePlaced() consults, so a new lane is immediately respected.
        this.emit('added');

        return this.enemyBases.length;
    }

    drawGrid(ctx: CanvasRenderingContext2D) {


        const gridWidth = Map.GRID_W * Map.TILE_SIZE;
        const gridHeight = Map.GRID_H * Map.TILE_SIZE;

        ctx.fillStyle = '#112025'
        ctx.fillRect(0, 0, gridWidth, gridHeight);
        ctx.strokeStyle = "#1b2c30";
        ctx.lineWidth = 1;
        ctx.beginPath()

        for (let x = 0; x < Map.GRID_W; ++x) {
            ctx.moveTo(x * Map.TILE_SIZE, 0);
            ctx.lineTo(x * Map.TILE_SIZE, gridHeight);
        }
        for (let y = 0; y < Map.GRID_H; ++y) {
            ctx.moveTo(0, y * Map.TILE_SIZE);
            ctx.lineTo(gridWidth, y * Map.TILE_SIZE);
        }
        ctx.closePath()
        ctx.stroke();

        ctx.strokeStyle = '#4a4a4e';
        ctx.lineWidth = 3;
        drawRoundedSquare(ctx, 0, 0, gridWidth, gridHeight, 4);
        ctx.stroke();
    }

    draw(ctx: CanvasRenderingContext2D) {

        for (let x = 0; x < this.grid.length; ++x) {
            for (let y = 0; y < this.grid[x].length; ++y) {
                const element = this.grid[x][y];

                if (element instanceof GridRenderable && !(element instanceof Base)) {
                    element.draw(ctx);
                }
            }
        }

        this.homeBase.draw(ctx);
        this.enemyBases.forEach(b => b.draw(ctx))
    }

    pathFind(i: number, j: number) {
        return easyAStar(
            (x, y) => {
                return this.grid[x] && this.grid[x][y] !== undefined && (this.grid[x][y] === 0 || (<GridRenderable>this.grid[x][y]).traversable)
            },
            {x: i, y: j},
            {
                x: this.homeBase.i,
                y: this.homeBase.j
            }
        )
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
                    x: value.x * Map.TILE_SIZE + Map.TILE_SIZE / 2,
                    y: value.y * Map.TILE_SIZE + Map.TILE_SIZE / 2
                }));
            }

            return this.pathsCache[key] = path;
        }
    }

    invalidatePathsCache() {
        this.pathsCache = {};
    }

    addElement(i: number, j: number, elementClass: new (...args: any[]) => GridRenderable): boolean {
        if (this.canBePlaced(i, j)) {
            this.grid[i][j] = new elementClass(i, j, Map.TILE_SIZE);
            this.invalidatePathsCache();
            this.emit('added');
            return true;
        }
        return false;
    }

    addBase(i: number, j: number, isHome = false): Base {
        const base = new Base(i, j, Map.TILE_SIZE, isHome);
        this.grid[i][j] = base;
        return base;
    }

    canBePlaced(i: number, j: number) {
        if (!canPlaceTowerAt(i, j, Map.SPAWN_POINTS)) return false;
        if (this.grid[i] && this.grid[i][j] === 0) {
            this.grid[i][j] = 1;
            try {
                return allSpawnPointsReachable(
                    Map.SPAWN_POINTS,
                    (spawnI, spawnJ) => Boolean(this.pathFind(spawnI, spawnJ)),
                ) && enemyManager.canAllReachBase();
            } finally {
                this.grid[i][j] = 0;
            }
        } else {
            return false
        }
    }

    update() {
        this.grid.forEach(row => row.forEach(el => {
            if (el !== 0 && el !== 1) {
                el.update()
            }
        }))
    }

    canvasCoordinateToGridIndex(n: number) {
        return Math.floor(n / Map.TILE_SIZE);
    }
}

const map = new Map();
export {
    map,
    Map
}
