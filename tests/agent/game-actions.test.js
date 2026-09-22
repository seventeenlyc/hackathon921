const assert = require('assert');
const {GameActions} = require('../../.test-build/agent/GameActions.js');

/**
 * DOM-free tests for the AI action contract.
 *
 * The fake implements the `Battlefield` port only. It never imports the game
 * singletons, so these tests exercise the rules the AI actually depends on —
 * input validation, error precedence, and "no mutation on failure" — in a plain
 * Node process.
 */

const OPTIONS = [
    {type: 'canon', name: 'Canon', description: 'cheap', cost: 50, aimRadius: 100, dps: 62.5},
    {type: 'laser', name: 'Laser', description: 'expensive', cost: 400, aimRadius: 100, dps: 116.7},
];

class FakeBattlefield {
    constructor(options = {}) {
        this.gridWidth = options.gridWidth ?? 10;
        this.gridHeight = options.gridHeight ?? 10;
        this.maxTowerLevel = options.maxTowerLevel ?? 5;
        this._cash = options.cash ?? 1000;
        this._wave = options.wave ?? 3;
        this._baseLife = options.baseLife ?? 12;
        this._baseMaxLife = 15;
        this._options = options.options ?? OPTIONS;
        this._towers = new Map();
        this.blocked = new Set(options.blocked ?? []);
        this.builds = [];
        this.upgrades = [];
    }

    cash() {
        return this._cash;
    }

    canAfford(amount) {
        return this._cash - amount >= 0;
    }

    towerOptions() {
        return this._options;
    }

    towers() {
        return Array.from(this._towers.values());
    }

    towerAt(i, j) {
        return this._towers.get(`${i}:${j}`);
    }

    canPlaceAt(i, j) {
        if (this.blocked.has(`${i}:${j}`)) return {ok: false, error: 'BLOCKS_PATH'};
        return {ok: true};
    }

    build(type, i, j) {
        const option = this._options.find(o => o.type === type);
        this.builds.push({type, i, j});
        this._cash -= option.cost;
        this._towers.set(`${i}:${j}`, {
            id: `${i}:${j}`,
            type,
            i,
            j,
            level: 1,
            upgradeCost: Math.round(option.cost * 0.6),
            aimRadius: option.aimRadius,
            damage: 25,
            reloadMs: 400,
            dps: option.dps,
        });
    }

    upgrade(id) {
        const tower = this._towers.get(id);
        if (!tower || tower.level >= this.maxTowerLevel) return false;
        this.upgrades.push(id);
        this._cash -= tower.upgradeCost;
        tower.level += 1;
        tower.upgradeCost = tower.level >= this.maxTowerLevel ? null : Math.round(tower.upgradeCost * 1.5);
        return true;
    }

    wave() {
        return this._wave;
    }

    snapshot() {
        return this._snapshot || {
            wave: this._wave,
            cash: this._cash,
            baseLife: this._baseLife,
            baseMaxLife: this._baseMaxLife,
            grid: {width: this.gridWidth, height: this.gridHeight},
            base: {i: 5, j: 5},
            spawns: [{i: 0, j: 9}],
            enemies: {total: 0, groups: [], nearestThreat: null},
            towers: this.towers(),
            towerOptions: this._options,
            path: null,
            buildCandidates: [],
        };
    }

    /** Simulate a live engine tick without going through GameActions. */
    setTowerLevel(id, level) {
        const tower = this._towers.get(id);
        tower.level = level;
        tower.upgradeCost = level >= this.maxTowerLevel ? null : 30;
    }
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

console.log('GameActions');

test('insufficient funds takes precedence over a blocked path without mutation', () => {
    const field = new FakeBattlefield({cash: 49, blocked: ['3:3']});
    const result = new GameActions(field).buildTower('canon', 3, 3);
    assert.strictEqual(result.error, 'INSUFFICIENT_FUNDS');
    assert.strictEqual(field.cash(), 49);
    assert.deepStrictEqual(field.builds, []);
});

test('buildTower rejects an unknown tower type', () => {
    const field = new FakeBattlefield();
    const result = new GameActions(field).buildTower('nuke', 1, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'UNKNOWN_TOWER_TYPE');
    assert.strictEqual(field.builds.length, 0);
});

test('buildTower rejects non-integer coordinates', () => {
    const field = new FakeBattlefield();
    const result = new GameActions(field).buildTower('canon', 1.5, 2);
    assert.strictEqual(result.error, 'INVALID_COORDINATES');
    assert.strictEqual(field.builds.length, 0);
});

test('buildTower rejects a cell outside the grid', () => {
    const field = new FakeBattlefield({gridWidth: 5, gridHeight: 5});
    const actions = new GameActions(field);
    assert.strictEqual(actions.buildTower('canon', -1, 0).error, 'GRID_OUT_OF_BOUNDS');
    assert.strictEqual(actions.buildTower('canon', 0, 5).error, 'GRID_OUT_OF_BOUNDS');
    assert.strictEqual(field.builds.length, 0);
});

test('buildTower rejects an occupied cell before checking funds', () => {
    const field = new FakeBattlefield({cash: 0});
    field.build('canon', 2, 2);
    const result = new GameActions(field).buildTower('laser', 2, 2);
    assert.strictEqual(result.error, 'CELL_OCCUPIED');
    assert.strictEqual(field.builds.length, 1);
});

test('buildTower rejects a placement that would block the path', () => {
    const field = new FakeBattlefield({blocked: ['3:3']});
    const result = new GameActions(field).buildTower('canon', 3, 3);
    assert.strictEqual(result.error, 'BLOCKS_PATH');
    assert.strictEqual(field.builds.length, 0);
});

test('buildTower rejects when funds are insufficient and does not mutate', () => {
    const field = new FakeBattlefield({cash: 49});
    const result = new GameActions(field).buildTower('canon', 4, 4);
    assert.strictEqual(result.error, 'INSUFFICIENT_FUNDS');
    assert.deepStrictEqual(field.builds, []);
    assert.strictEqual(field.cash(), 49);
});

test('buildTower succeeds and charges the tower cost', () => {
    const field = new FakeBattlefield({cash: 100});
    const result = new GameActions(field).buildTower('canon', 4, 4);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.towerId, '4:4');
    assert.strictEqual(result.data.cost, 50);
    assert.deepStrictEqual(field.builds, [{type: 'canon', i: 4, j: 4}]);
    assert.strictEqual(field.cash(), 50);
});

test('upgradeTower rejects a malformed id', () => {
    const result = new GameActions(new FakeBattlefield()).upgradeTower('not-an-id');
    assert.strictEqual(result.error, 'TOWER_NOT_FOUND');
});

test('upgradeTower rejects an empty cell', () => {
    const result = new GameActions(new FakeBattlefield()).upgradeTower('1:1');
    assert.strictEqual(result.error, 'TOWER_NOT_FOUND');
});

test('upgradeTower rejects a maxed tower', () => {
    const field = new FakeBattlefield();
    field.build('canon', 1, 1);
    field.setTowerLevel('1:1', 5);
    const result = new GameActions(field).upgradeTower('1:1');
    assert.strictEqual(result.error, 'ALREADY_MAX_LEVEL');
    assert.deepStrictEqual(field.upgrades, []);
});

test('upgradeTower rejects when funds are insufficient', () => {
    const field = new FakeBattlefield({cash: 0});
    field.build('canon', 1, 1);
    const result = new GameActions(field).upgradeTower('1:1');
    assert.strictEqual(result.error, 'INSUFFICIENT_FUNDS');
    assert.deepStrictEqual(field.upgrades, []);
});

test('upgradeTower succeeds and reports the new level once', () => {
    const field = new FakeBattlefield({cash: 1000});
    field.build('canon', 1, 1);
    const result = new GameActions(field).upgradeTower('1:1');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.level, 2);
    assert.deepStrictEqual(field.upgrades, ['1:1']);
    // The reported level must not double-count the engine's own mutation.
    assert.strictEqual(result.data.level, field.towerAt(1, 1).level);
});

test('getState returns the snapshot the battlefield provides', () => {
    const field = new FakeBattlefield({wave: 7, cash: 320, baseLife: 9});
    const snapshot = {
        wave: 7,
        cash: 320,
        baseLife: 9,
        baseMaxLife: 15,
        grid: {width: 10, height: 10},
        base: {i: 5, j: 5},
        spawns: [{i: 0, j: 9}],
        enemies: {total: 3, groups: [{type: 'simple', count: 3, avgLife: 10, avgRemainingLife: 8}], nearestThreat: null},
        towers: [],
        towerOptions: OPTIONS,
        path: {waypoints: [{i: 0, j: 9}, {i: 5, j: 5}], length: 12},
        buildCandidates: [{i: 1, j: 8, coverage: 3, distanceToBase: 10}],
    };
    field._snapshot = snapshot;

    assert.strictEqual(new GameActions(field).getState(), snapshot);
});

console.log('All GameActions tests passed.');
