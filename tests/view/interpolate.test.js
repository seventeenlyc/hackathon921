const assert = require('assert');
const {interpolateSnapshot} = require('../../.test-build/view/interpolate.js');

/**
 * The browser animates between the last two server frames. These tests pin the
 * blend itself: positions, shortest-arc facing, new entities and metadata.
 */

function frame(overrides) {
    return {
        tick: 0, state: 'running', wave: 1, cash: 200, baseLife: 15, baseMaxLife: 15,
        grid: {width: 61, height: 31, tileSize: 40}, spawns: [], bases: [], rocks: [],
        towers: [], enemies: [], munitions: [], ...overrides,
    };
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

console.log('interpolateSnapshot');

test('blends an enemy position half way', () => {
    const previous = frame({tick: 10, enemies: [{id: 1, kind: 'simple', x: 0, y: 0, radius: 8, life: 50, damageTaken: 0}]});
    const latest = frame({tick: 20, enemies: [{id: 1, kind: 'simple', x: 100, y: 40, radius: 8, life: 50, damageTaken: 0}]});

    const blended = interpolateSnapshot(previous, latest, 0.5);
    assert.strictEqual(blended.enemies[0].x, 50);
    assert.strictEqual(blended.enemies[0].y, 20);
    assert.strictEqual(blended.tick, 20, 'metadata always comes from the latest frame');
});

test('alpha 0 is the previous frame and alpha 1 the latest', () => {
    const previous = frame({tick: 1, enemies: [{id: 1, kind: 'simple', x: 0, y: 0, radius: 8, life: 50, damageTaken: 0}]});
    const latest = frame({tick: 2, enemies: [{id: 1, kind: 'simple', x: 10, y: 0, radius: 8, life: 50, damageTaken: 0}]});

    assert.strictEqual(interpolateSnapshot(previous, latest, 0), previous);
    assert.strictEqual(interpolateSnapshot(previous, latest, 1), latest);
    assert.strictEqual(interpolateSnapshot(null, latest, 0.5), latest, 'no previous frame means no interpolation');
});

test('a newly spawned entity is drawn at its first known position', () => {
    const previous = frame({enemies: []});
    const latest = frame({enemies: [{id: 7, kind: 'fast', x: 300, y: 20, radius: 8, life: 200, damageTaken: 0}]});

    const blended = interpolateSnapshot(previous, latest, 0.5);
    assert.strictEqual(blended.enemies[0].x, 300);
    assert.strictEqual(blended.enemies[0].y, 20);
});

test('tower facing interpolates along the shortest arc', () => {
    const previous = frame({towers: [{id: '1:1', type: 'sniper', i: 1, j: 1, x: 60, y: 60, level: 1, angle: 3.0, aimRadius: 250, targetInRange: true}]});
    const latest = frame({towers: [{id: '1:1', type: 'sniper', i: 1, j: 1, x: 60, y: 60, level: 1, angle: -3.0, aimRadius: 250, targetInRange: true}]});

    const blended = interpolateSnapshot(previous, latest, 0.5);
    // Crossing ±pi the short way stays near pi, instead of sweeping back through 0.
    assert.ok(Math.abs(blended.towers[0].angle) > 3.1 && Math.abs(blended.towers[0].angle) <= Math.PI + 1e-9,
        'expected the facing to cross near pi, got ' + blended.towers[0].angle);
});

test('munitions blend position, facing and charge', () => {
    const mk = (x, charge) => ({id: 3, kind: 'laser', x, y: 0, angle: 0, charge, emitterType: 'laser', emitterX: 0, emitterY: 0, targetX: x, targetY: 0});
    const previous = frame({munitions: [mk(0, 0)]});
    const latest = frame({munitions: [mk(10, 1)]});

    const blended = interpolateSnapshot(previous, latest, 0.5);
    assert.strictEqual(blended.munitions[0].x, 5);
    assert.strictEqual(blended.munitions[0].charge, 0.5);
    assert.strictEqual(blended.munitions[0].targetX, 5);
});

console.log('All interpolateSnapshot tests passed.');
