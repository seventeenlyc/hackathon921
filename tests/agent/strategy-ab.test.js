const assert = require('assert');
const {easyAStar} = require('../../.test-build/tools/astar.js');
const {GameActions} = require('../../.test-build/agent/GameActions.js');
const {buildSnapshot} = require('../../.test-build/agent/snapshot.js');
const {MAX_SNAPSHOT_CHARS, MAX_PATH_SHAPING_PROBES} = require('../../.test-build/agent/snapshot.js');

/**
 * Deterministic, DOM-free strategy A/B harness for issue #6.
 *
 * The point of #6 is that two different prompts produce visibly different AI
 * behaviour. Before we can claim the LLM does that, the *candidate set* the
 * engine offers must actually let a "defend near the base" prompt and a "coil
 * near the spawn" prompt pick different placements. This file builds a real A*
 * grid (no canvas, no engine singletons) and runs two deterministic strategy
 * selectors against it, asserting the engine-accepted tower zones, the cash
 * curve and the live route length all diverge. It is NOT the real DeepSeek A/B
 * run — that needs the provider and is recorded separately in issue #6.
 *
 * It also doubles as the latency/probe budget benchmark: the grid here runs the
 * real `easyAStar`, so the probe count and per-decision time are honest A* cost,
 * not a stub, and they are pinned under the snapshot constants.
 */

const W = 24;
const H = 13;
const SPAWN = {i: 1, j: 6};
const BASE = {i: 22, j: 6};

const TOWER_TYPES = [
    {type: 'canon', name: 'Canon', description: '', cost: 50, aimRadius: 100, dps: 62.5},
];

function makeGrid() {
    // 0 = free, 1 = wall. A border ring of walls keeps the route inside.
    const grid = Array.from({length: W}, () => new Array(H).fill(0));
    for (let i = 0; i < W; ++i) {
        grid[i][0] = 1;
        grid[i][H - 1] = 1;
    }
    for (let j = 0; j < H; ++j) {
        grid[0][j] = 1;
        grid[W - 1][j] = 1;
    }
    return grid;
}

class DeterministicBattlefield {
    constructor() {
        this.grid = makeGrid();
        this._towers = new Map();
        this._cash = 5000;
        this.maxTowerLevel = 5;
        this.gridWidth = W;
        this.gridHeight = H;
        // Spawn and base are traversable (enemies walk through them) but not
        // buildable, mirroring the live engine where they hold a Base instance.
        this.occupied = new Set([`${SPAWN.i}:${SPAWN.j}`, `${BASE.i}:${BASE.j}`]);
    }

    cash() {
        return this._cash;
    }

    canAfford(amount) {
        return this._cash - amount >= 0;
    }

    towerOptions() {
        return TOWER_TYPES;
    }

    towers() {
        return Array.from(this._towers.values());
    }

    towerAt(i, j) {
        return this._towers.get(`${i}:${j}`);
    }

    /** Real A* reachability with a temporary wall — the engine's check. */
    canPlaceAt(i, j) {
        if (this.occupied.has(`${i}:${j}`)) return {ok: false, error: 'CELL_OCCUPIED'};
        if (this.grid[i][j] !== 0) return {ok: false, error: 'CELL_OCCUPIED'};
        this.grid[i][j] = 1;
        try {
            const path = this.pathFind(SPAWN.i, SPAWN.j);
            return path ? {ok: true} : {ok: false, error: 'BLOCKS_PATH'};
        } finally {
            this.grid[i][j] = 0;
        }
    }

    build(type, i, j) {
        const option = TOWER_TYPES.find(o => o.type === type);
        this.grid[i][j] = 1;
        this._towers.set(`${i}:${j}`, {
            id: `${i}:${j}`, type, i, j, level: 1, upgradeCost: null,
            aimRadius: option.aimRadius, damage: 25, reloadMs: 400, dps: option.dps, targetInRange: false,
        });
        this._cash -= option.cost;
    }

    upgrade() {
        return false;
    }

    /** Live route (spawn -> base) as the adapter would report it. */
    routeCells() {
        const path = this.pathFind(SPAWN.i, SPAWN.j);
        if (!path) return [];
        return path.map(p => ({i: p.x, j: p.y}));
    }

    pathFind(i, j) {
        return easyAStar(
            (x, y) => this.grid[x] !== undefined && this.grid[x][y] === 0,
            {x: i, y: j},
            {x: BASE.i, y: BASE.j},
        );
    }

    snapshot() {
        const cells = this.routeCells();
        return buildSnapshot({
            wave: this._wave,
            cash: this._cash,
            baseLife: 15,
            baseMaxLife: 15,
            gridWidth: W,
            gridHeight: H,
            base: {i: BASE.i, j: BASE.j},
            spawns: [SPAWN],
            enemies: [],
            towers: this.towers(),
            towerOptions: TOWER_TYPES,
            routes: cells.length > 0 ? [{spawn: SPAWN, cells}] : [],
            isFree: (i, j) => this.grid[i][j] === 0 && !this.occupied.has(`${i}:${j}`),
            isBuildable: (i, j) => this.canPlaceAt(i, j).ok,
            routeLengthAfterBuilding: (lane, i, j) => this.routeLengthAfterBuilding(i, j),
        });
    }

    /** Authoritative detour probe: temp wall, real A*, restore. */
    routeLengthAfterBuilding(i, j) {
        if (this.occupied.has(`${i}:${j}`)) return null;
        if (this.grid[i][j] !== 0) return null;
        this.grid[i][j] = 1;
        try {
            const path = this.pathFind(SPAWN.i, SPAWN.j);
            return path ? path.length - 1 : null;
        } finally {
            this.grid[i][j] = 0;
        }
    }
}

function pickActionsForStrategy(snapshot, strategy) {
    // Deterministic stand-in for "the model follows the player prompt". It does
    // not call an LLM; it picks the candidates in the zone the strategy names so
    // the harness can prove the engine OFFERS divergent choices. The real model
    // run is issue #6's acceptance gate, recorded separately.
    const preferredZone = strategy === 'base-near' ? 'base' : 'frontline';
    const actions = [];

    // Path-shaping (coiling) first: that is what makes the route physically
    // longer and is the axis the two strategies are meant to split on.
    const shaping = snapshot.pathShapingCandidates.filter(c => c.zone === preferredZone);
    for (const candidate of shaping.slice(0, 1)) {
        actions.push({name: 'build_tower', arguments: {type: 'canon', i: candidate.i, j: candidate.j}});
    }

    // Then a coverage build, also in the preferred zone when one exists.
    const coverage = snapshot.buildCandidates.filter(c => c.zone === preferredZone);
    if (coverage.length > 0) {
        const candidate = coverage[0];
        actions.push({name: 'build_tower', arguments: {type: 'canon', i: candidate.i, j: candidate.j}});
    }

    return actions;
}

function runStrategy(strategy, waves) {
    const battlefield = new DeterministicBattlefield();
    const actions = new GameActions(battlefield);
    const record = {strategy, accepted: [], rejected: [], cashCurve: [], zones: [], pathLengths: []};

    for (let wave = 1; wave <= waves; ++wave) {
        battlefield._wave = wave;
        const snapshot = battlefield.snapshot();
        const planned = pickActionsForStrategy(snapshot, strategy);

        for (const action of planned) {
            const result = actions.buildTower(String(action.arguments.type), Number(action.arguments.i), Number(action.arguments.j));
            const entry = {
                wave,
                i: Number(action.arguments.i),
                j: Number(action.arguments.j),
                ok: result.ok,
                error: result.ok ? null : result.error,
            };
            if (result.ok) {
                record.accepted.push(entry);
            } else {
                record.rejected.push(entry);
            }
        }

        record.cashCurve.push(battlefield.cash());
        record.pathLengths.push(battlefield.routeCells().length - 1);
    }

    const zoneOf = (i, j) => {
        const cells = battlefield.routeCells();
        if (cells.length === 0) return 'unknown';
        // Re-derive the zone from the ORIGINAL straight route (row 6), not the
        // post-build detour, so a wall placed near the base still reads as base.
        const total = cells.length - 1;
        const idx = cells.findIndex(c => c.i === i && c.j === j);
        if (idx < 0) {
            // Beside-route coverage build: classify by proximity along the row.
            const progress = i / (BASE.i - SPAWN.i);
            if (progress <= 0.35) return 'frontline';
            if (progress >= 0.70) return 'base';
            return 'midfield';
        }
        const progress = idx / total;
        if (progress <= 0.35) return 'frontline';
        if (progress >= 0.70) return 'base';
        return 'midfield';
    };
    record.zones = record.accepted.map(e => zoneOf(e.i, e.j));
    return record;
}

function test(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (error) {
        console.error(`FAIL  ${name}`);
        throw error;
    }
}

console.log('strategy A/B (issue #6 deterministic)');

test('"base-near" and "spawn-near" place towers in different regions', () => {
    const baseRun = runStrategy('base-near', 6);
    const spawnRun = runStrategy('spawn-near', 6);

    assert.ok(baseRun.accepted.length > 0, 'base-near must accept at least one build');
    assert.ok(spawnRun.accepted.length > 0, 'spawn-near must accept at least one build');

    const baseZones = new Set(baseRun.zones);
    const spawnZones = new Set(spawnRun.zones);

    assert.ok(baseZones.has('base'), 'base-near places near the base');
    assert.ok(spawnZones.has('frontline'), 'spawn-near places near the spawn');
    assert.ok(!baseZones.has('frontline') || baseRun.zones.filter(z => z === 'frontline').length < spawnRun.zones.filter(z => z === 'frontline').length,
        'spawn-near builds more frontline walls than base-near');
    assert.ok(!spawnZones.has('base') || spawnRun.zones.filter(z => z === 'base').length < baseRun.zones.filter(z => z === 'base').length,
        'base-near builds more base walls than spawn-near');
});

test('the two strategies diverge on cash curve and live route length', () => {
    const baseRun = runStrategy('base-near', 6);
    const spawnRun = runStrategy('spawn-near', 6);

    // Different placements cost the same per tower, but they stop being legal at
    // different waves (base-near eventually seals its corner), so the cash
    // curves — and therefore the reachable wealth — must diverge.
    const cashDiffer = baseRun.cashCurve.some((c, w) => c !== spawnRun.cashCurve[w]);
    assert.ok(cashDiffer, 'cash curves must diverge across waves');

    // Both lengthen the route; the divergence in WHERE means the live route
    // length is not identical across the two strategies at every wave.
    const lengthDiffer = baseRun.pathLengths.some((l, w) => l !== spawnRun.pathLengths[w]);
    assert.ok(lengthDiffer, 'live route lengths must diverge across waves');
});

test('building a path-shaping wall reroutes, and removing it re-opens the short path', () => {
    // This is the A* re-path invariant the AGENTS.md flags as easy to break.
    // There is no sell action in the live engine yet, so this exercises the
    // core recompute directly: a wall must lengthen the route, and undoing it
    // must restore the shorter route with no stale cache in between.
    const battlefield = new DeterministicBattlefield();
    const baseline = battlefield.routeCells().length - 1;

    // Find a base-zone path-shaping cell the engine accepts.
    const snapshot = battlefield.snapshot();
    const wall = snapshot.pathShapingCandidates.find(c => c.zone === 'base');
    assert.ok(wall, 'a base-zone path-shaping candidate must exist');

    battlefield.grid[wall.i][wall.j] = 1;
    const detoured = battlefield.routeCells().length - 1;
    assert.ok(detoured > baseline, 'a route wall must lengthen the route');

    battlefield.grid[wall.i][wall.j] = 0;
    const reopened = battlefield.routeCells().length - 1;
    assert.strictEqual(reopened, baseline, 'removing the wall must re-open the short route (re-path)');

    // Fail-closed: a placement that occupies the spawn/base is rejected with
    // CELL_OCCUPIED, and a placement that seals the only corridor is rejected
    // with BLOCKS_PATH. Neither is silently accepted.
    const spawnBlocked = battlefield.canPlaceAt(SPAWN.i, SPAWN.j);
    assert.strictEqual(spawnBlocked.ok, false, 'placing on the spawn must be rejected');
    assert.strictEqual(spawnBlocked.error, 'CELL_OCCUPIED');

    // Seal column 2 except for one gap, then probe the gap: it must be BLOCKS_PATH.
    for (let j = 1; j < H - 1; ++j) {
        if (j !== 6) battlefield.grid[2][j] = 1;
    }
    const sealGap = battlefield.canPlaceAt(2, 6);
    assert.strictEqual(sealGap.ok, false, 'sealing the only corridor must be rejected');
    assert.strictEqual(sealGap.error, 'BLOCKS_PATH');
    for (let j = 1; j < H - 1; ++j) battlefield.grid[2][j] = 0;
});

test('snapshot stays inside the size and probe budgets against the real grid', () => {
    const battlefield = new DeterministicBattlefield();
    let probes = 0;
    const realMeasure = battlefield.routeLengthAfterBuilding.bind(battlefield);
    const snapshot = buildSnapshot({
        wave: 1,
        cash: 5000,
        baseLife: 15,
        baseMaxLife: 15,
        gridWidth: W,
        gridHeight: H,
        base: {i: BASE.i, j: BASE.j},
        spawns: [SPAWN],
        enemies: [],
        towers: [],
        towerOptions: TOWER_TYPES,
        routes: [{spawn: SPAWN, cells: battlefield.routeCells()}],
        isFree: (i, j) => battlefield.grid[i][j] === 0,
        isBuildable: (i, j) => battlefield.canPlaceAt(i, j).ok,
        routeLengthAfterBuilding: (lane, i, j) => {
            probes += 1;
            return realMeasure(i, j);
        },
    });

    assert.ok(snapshot.pathShapingCandidates.length > 0, 'real grid offers path-shaping candidates');
    assert.ok(probes <= MAX_PATH_SHAPING_PROBES, `real-A* probes ${probes} exceeded ${MAX_PATH_SHAPING_PROBES}`);
    const size = JSON.stringify(snapshot).length;
    assert.ok(size <= MAX_SNAPSHOT_CHARS, `snapshot ${size} chars exceeds ${MAX_SNAPSHOT_CHARS}`);

    // Latency guard: the real A* path-shaping pass must finish well under one
    // wave-boundary budget (the loop runs it once per PLANNING, not per frame).
    const start = Date.now();
    for (let i = 0; i < 50; ++i) {
        buildSnapshot({
            wave: 1, cash: 5000, baseLife: 15, baseMaxLife: 15,
            gridWidth: W, gridHeight: H, base: BASE, spawns: [SPAWN],
            enemies: [], towers: [], towerOptions: TOWER_TYPES,
            routes: [{spawn: SPAWN, cells: battlefield.routeCells()}],
            isFree: (i, j) => battlefield.grid[i][j] === 0,
            isBuildable: (i, j) => battlefield.canPlaceAt(i, j).ok,
            routeLengthAfterBuilding: (lane, i, j) => realMeasure(i, j),
        });
    }
    const perCallMs = (Date.now() - start) / 50;
    assert.ok(perCallMs < 200, `path-shaping pass too slow: ${perCallMs.toFixed(1)}ms/call`);
    console.log(`    (real-A* path-shaping: ${probes} probes, ${size} chars, ${perCallMs.toFixed(1)}ms/call)`);
});

console.log('All strategy A/B tests passed.');
