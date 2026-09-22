const assert = require('assert');
const {
    buildSnapshot,
    formatSnapshot,
    MAX_SNAPSHOT_CHARS,
    MAX_TOWERS_IN_SNAPSHOT,
    MAX_BUILD_CANDIDATES,
} = require('../../.test-build/agent/snapshot.js');

/**
 * DOM-free tests for the compressed observation (issue #4).
 *
 * buildSnapshot is pure and injected, so the metrics the model reasons over —
 * composition, urgency, route shape, candidate placements, size — are all
 * pinned down here without touching the engine.
 */

function test(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (error) {
        console.error(`FAIL  ${name}`);
        throw error;
    }
}

function enemy(type, over = {}) {
    return {type, life: 100, damageTaken: 0, i: 0, j: 0, etaSeconds: 10, ...over};
}

function tower(i, j, level = 1, dps = 50) {
    return {
        id: `${i}:${j}`,
        type: 'canon',
        i,
        j,
        level,
        upgradeCost: 30,
        aimRadius: 100,
        damage: 25,
        reloadMs: 400,
        dps,
        targetInRange: false,
    };
}

function baseInput(over = {}) {
    return {
        wave: 4,
        cash: 250,
        baseLife: 12,
        baseMaxLife: 15,
        gridWidth: 8,
        gridHeight: 3,
        base: {i: 4, j: 0},
        spawns: [{i: 0, j: 0}],
        enemies: [],
        towers: [],
        towerOptions: [{type: 'canon', name: 'Canon', description: '', cost: 50, aimRadius: 100, dps: 62.5}],
        route: null,
        isFree: () => true,
        isBuildable: () => true,
        ...over,
    };
}

console.log('snapshot');

test('groups enemies by type with average life and remaining life', () => {
    const snapshot = buildSnapshot(baseInput({
        enemies: [
            enemy('simple', {life: 100, damageTaken: 0}),
            enemy('simple', {life: 100, damageTaken: 40}),
            enemy('fast', {life: 60, damageTaken: 0}),
        ],
    }));

    assert.strictEqual(snapshot.enemies.total, 3);

    const simple = snapshot.enemies.groups.find(group => group.type === 'simple');
    assert.strictEqual(simple.count, 2);
    assert.strictEqual(simple.avgLife, 100);
    assert.strictEqual(simple.avgRemainingLife, 80);

    const fast = snapshot.enemies.groups.find(group => group.type === 'fast');
    assert.strictEqual(fast.count, 1);
});

test('nearestThreat is the enemy with the smallest ETA', () => {
    const snapshot = buildSnapshot(baseInput({
        enemies: [
            enemy('simple', {etaSeconds: 30, remainingLife: 100}),
            enemy('boss', {etaSeconds: 4, life: 500, damageTaken: 120, i: 3, j: 2}),
        ],
    }));

    assert.deepStrictEqual(snapshot.enemies.nearestThreat, {
        type: 'boss',
        i: 3,
        j: 2,
        remainingLife: 380,
        etaSeconds: 4,
    });
});

test('no enemies means no threat', () => {
    const snapshot = buildSnapshot(baseInput());
    assert.strictEqual(snapshot.enemies.nearestThreat, null);
    assert.deepStrictEqual(snapshot.enemies.groups, []);
});

test('route is compressed to its turns and measured in tiles', () => {
    const straight = buildSnapshot(baseInput({
        route: [{i: 0, j: 0}, {i: 1, j: 0}, {i: 2, j: 0}, {i: 3, j: 0}],
    }));
    assert.deepStrictEqual(straight.path, {waypoints: [{i: 0, j: 0}, {i: 3, j: 0}], length: 3});

    const elbow = buildSnapshot(baseInput({
        route: [{i: 0, j: 0}, {i: 1, j: 0}, {i: 2, j: 0}, {i: 2, j: 1}, {i: 2, j: 2}],
    }));
    assert.deepStrictEqual(elbow.path, {
        waypoints: [{i: 0, j: 0}, {i: 2, j: 0}, {i: 2, j: 2}],
        length: 4,
    });
});

test('no route means no path and no candidates', () => {
    const snapshot = buildSnapshot(baseInput());
    assert.strictEqual(snapshot.path, null);
    assert.deepStrictEqual(snapshot.buildCandidates, []);
});

test('build candidates are off-route, free, legal, and ranked by coverage', () => {
    const route = [{i: 0, j: 0}, {i: 1, j: 0}, {i: 2, j: 0}, {i: 3, j: 0}, {i: 4, j: 0}];
    const snapshot = buildSnapshot(baseInput({
        route,
        isFree: (i, j) => !(i === 1 && j === 1),
        isBuildable: (i, j) => !(i === 3 && j === 1),
    }));

    const candidates = snapshot.buildCandidates;
    assert.ok(candidates.length > 0);

    for (const candidate of candidates) {
        assert.ok(!(candidate.j === 0 && candidate.i <= 4), 'route cells must not be candidates');
        assert.ok(candidate.coverage > 0);
        assert.ok(candidate.distanceToBase >= 0);
    }

    assert.ok(!candidates.some(c => c.i === 1 && c.j === 1), 'occupied cells are excluded');
    assert.ok(!candidates.some(c => c.i === 3 && c.j === 1), 'cells the engine rejects are excluded');

    for (let index = 1; index < candidates.length; ++index) {
        const previous = candidates[index - 1];
        const current = candidates[index];
        assert.ok(
            previous.coverage > current.coverage ||
                (previous.coverage === current.coverage && previous.distanceToBase <= current.distanceToBase),
            'candidates must be ranked by coverage then closeness to base'
        );
    }

    // (2,1) sees route cells 1..3 (coverage 3) and is the deepest such cell.
    assert.deepStrictEqual(candidates[0], {i: 2, j: 1, coverage: 3, distanceToBase: 1});
});

test('build candidates are capped', () => {
    const route = [];
    for (let i = 0; i < 40; ++i) route.push({i: i % 40, j: 0});

    const snapshot = buildSnapshot(baseInput({
        gridWidth: 60,
        gridHeight: 3,
        route,
    }));

    assert.ok(snapshot.buildCandidates.length <= MAX_BUILD_CANDIDATES);
});

test('towers are ranked by level and capped', () => {
    const towers = [];
    for (let index = 0; index < 80; ++index) towers.push(tower(index % 40, Math.floor(index / 40) + 1, (index % 5) + 1));

    const snapshot = buildSnapshot(baseInput({gridWidth: 40, gridHeight: 10, towers}));

    assert.strictEqual(snapshot.towers.length, MAX_TOWERS_IN_SNAPSHOT);
    for (let index = 1; index < snapshot.towers.length; ++index) {
        assert.ok(snapshot.towers[index - 1].level >= snapshot.towers[index].level);
    }
});

test('a busy battlefield still fits the token budget', () => {
    const enemies = [];
    const types = ['simple', 'fast', 'armored', 'healer', 'boss'];
    for (let index = 0; index < 300; ++index) {
        enemies.push(enemy(types[index % types.length], {i: index % 60, j: index % 30, etaSeconds: 100 - (index % 90)}));
    }

    const towers = [];
    for (let index = 0; index < 80; ++index) towers.push(tower(index % 60, index % 30, 3));

    const route = [];
    for (let i = 0; i < 120; ++i) route.push({i: i % 60, j: Math.floor(i / 60)});

    const snapshot = buildSnapshot(baseInput({
        gridWidth: 61,
        gridHeight: 31,
        enemies,
        towers,
        route,
        spawns: [{i: 0, j: 0}, {i: 0, j: 30}, {i: 60, j: 0}, {i: 60, j: 30}],
    }));

    const size = JSON.stringify(snapshot).length;
    assert.ok(size <= MAX_SNAPSHOT_CHARS, `snapshot is ${size} chars, budget is ${MAX_SNAPSHOT_CHARS}`);
});

test('formatSnapshot renders the facts the model saw', () => {
    const snapshot = buildSnapshot(baseInput({
        enemies: [enemy('fast', {etaSeconds: 3})],
        towers: [{...tower(2, 1, 2), targetInRange: true}],
        route: [{i: 0, j: 0}, {i: 1, j: 0}, {i: 2, j: 0}],
    }));

    const text = formatSnapshot(snapshot);
    assert.ok(text.includes('Wave 4'));
    assert.ok(text.includes('fast x1'));
    assert.ok(text.includes('ETA 3s'));
    assert.ok(text.includes('canon L2@(2,1)*'));
    assert.ok(text.includes('2 waypoints'));
    assert.ok(text.includes('Build candidates'));
});

console.log('All snapshot tests passed.');
