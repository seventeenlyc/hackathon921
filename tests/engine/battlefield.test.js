const assert = require('assert');
const {GameEngine} = require('../../.test-build/engine/GameEngine.js');
const {GameActions} = require('../../.test-build/agent/GameActions.js');
const {EngineBattlefield} = require('../../.test-build/engine/EngineBattlefield.js');

/**
 * The AI action contract on the real headless engine.
 *
 * The existing game-actions suite drives a hand-written fake `Battlefield`;
 * this one drives `EngineBattlefield` over a live `GameEngine`, so the same
 * rules are proven against the actual simulation that will run on the server.
 */

function actionsFor(engine) {
    return new GameActions(new EngineBattlefield(engine));
}

/** First cell the engine reports as buildable; avoids depending on a fixed rock layout. */
function pickLegal(engine) {
    const battlefield = new EngineBattlefield(engine);
    for (let i = 0; i < engine.map.grid.length; ++i) {
        for (let j = 0; j < engine.map.grid[i].length; ++j) {
            if (engine.map.grid[i][j] === 0 && battlefield.canPlaceAt(i, j).ok) return {i, j};
        }
    }
    throw new Error('no legal build cell');
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

console.log('EngineBattlefield + GameActions');

test('buildTower places a tower and charges its cost', () => {
    const engine = new GameEngine({seed: 100, difficulty: 2, initialCash: 200});
    const actions = actionsFor(engine);
    const cell = pickLegal(engine);

    const result = actions.buildTower('canon', cell.i, cell.j);
    assert.strictEqual(result.ok, true, result.message);
    assert.strictEqual(result.data.towerId, `${cell.i}:${cell.j}`);
    assert.strictEqual(engine.cash.getBalance(), 150);
    assert.ok(new EngineBattlefield(engine).towerAt(cell.i, cell.j), 'the tower must be on the grid');
});

test('buildTower rejects an occupied cell without charging twice', () => {
    const engine = new GameEngine({seed: 101, difficulty: 2});
    const actions = actionsFor(engine);
    const cell = pickLegal(engine);

    assert.strictEqual(actions.buildTower('canon', cell.i, cell.j).ok, true);
    const cashAfterFirst = engine.cash.getBalance();
    const second = actions.buildTower('laser', cell.i, cell.j);

    assert.strictEqual(second.error, 'CELL_OCCUPIED');
    assert.strictEqual(engine.cash.getBalance(), cashAfterFirst, 'a rejected build must not charge');
});

test('buildTower fails closed when funds are insufficient', () => {
    const engine = new GameEngine({seed: 102, difficulty: 2, initialCash: 10});
    const cell = pickLegal(engine);
    const result = actionsFor(engine).buildTower('canon', cell.i, cell.j);

    assert.strictEqual(result.error, 'INSUFFICIENT_FUNDS');
    assert.strictEqual(engine.cash.getBalance(), 10);
    assert.strictEqual(new EngineBattlefield(engine).towerAt(cell.i, cell.j), undefined);
});

test('buildTower rejects a placement that would seal the only lane out of a spawn', () => {
    const engine = new GameEngine({seed: 103, difficulty: 1});
    const map = engine.map;
    const base = map.enemyBases[0];

    const neighbors = [
        [base.i - 1, base.j],
        [base.i + 1, base.j],
        [base.i, base.j - 1],
        [base.i, base.j + 1],
    ].filter(([i, j]) => map.grid[i] && map.grid[i][j] !== undefined);

    const freeNeighbors = neighbors.filter(([i, j]) => map.grid[i][j] === 0);
    let target;
    if (freeNeighbors.length > 0) {
        target = freeNeighbors[0];
        for (const [i, j] of neighbors) {
            if (i !== target[0] || j !== target[1]) map.grid[i][j] = 1;
        }
    } else {
        for (const [i, j] of neighbors) map.grid[i][j] = 1;
        target = findFreeCell(map);
    }
    map.invalidatePathsCache();

    const result = actionsFor(engine).buildTower('canon', target[0], target[1]);
    assert.strictEqual(result.error, 'BLOCKS_PATH');
    assert.strictEqual(new EngineBattlefield(engine).towerAt(target[0], target[1]), undefined);
});

function findFreeCell(map) {
    for (let i = 0; i < map.grid.length; ++i) {
        for (let j = 0; j < map.grid[i].length; ++j) {
            if (map.grid[i][j] === 0) return [i, j];
        }
    }
    throw new Error('no free cell found');
}

test('upgradeTower raises the level and charges the upgrade', () => {
    const engine = new GameEngine({seed: 104, difficulty: 2, initialCash: 500});
    const actions = actionsFor(engine);
    const cell = pickLegal(engine);

    assert.strictEqual(actions.buildTower('canon', cell.i, cell.j).ok, true);
    const cashAfterBuild = engine.cash.getBalance();
    const upgrade = actions.upgradeTower(`${cell.i}:${cell.j}`);

    assert.strictEqual(upgrade.ok, true, upgrade.message);
    assert.strictEqual(upgrade.data.level, 2);
    assert.strictEqual(new EngineBattlefield(engine).towerAt(cell.i, cell.j).level, 2);
    assert.ok(engine.cash.getBalance() < cashAfterBuild);
});

test('getState returns a snapshot grounded in the engine', () => {
    const engine = new GameEngine({seed: 105, difficulty: 2, initialCash: 200});
    engine.requestSpawnCount(2);
    engine.spawnSettings.applyPending();

    const snapshot = actionsFor(engine).getState();
    assert.strictEqual(typeof snapshot.wave, 'number');
    assert.strictEqual(snapshot.cash, 200);
    assert.strictEqual(snapshot.grid.width, 61);
    assert.strictEqual(snapshot.grid.height, 31);
    assert.ok(snapshot.towerOptions.length >= 5, 'every tower type must be offered');
    assert.strictEqual(snapshot.lanes.length, engine.map.enemyBases.length);
});

console.log('All EngineBattlefield tests passed.');
