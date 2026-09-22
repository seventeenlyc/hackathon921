const assert = require('assert');
const {SpawnSettings, clampSpawnCount, MIN_SPAWNS, MAX_SPAWNS} = require('../../.test-build/agent/SpawnSettings.js');

/**
 * DOM-free tests for the queued lane changes (issue #40).
 *
 * The rule that matters: a request must NOT take effect immediately, because the
 * current wave already had its PLANNING round — the change has to wait for the
 * next boundary so the AI can plan for the new route.
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

function makeSettings(initialCount, applyImpl) {
    const state = {current: initialCount, applied: []};
    const settings = new SpawnSettings(
        count => {
            state.applied.push(count);
            state.current = applyImpl ? applyImpl(count) : count;
            return state.current;
        },
        () => state.current
    );
    return {settings, state};
}

console.log('SpawnSettings');

test('clampSpawnCount keeps lane counts within 1..4', () => {
    assert.strictEqual(clampSpawnCount(0), MIN_SPAWNS);
    assert.strictEqual(clampSpawnCount(-3), MIN_SPAWNS);
    assert.strictEqual(clampSpawnCount(9), MAX_SPAWNS);
    assert.strictEqual(clampSpawnCount(2.9), 2);
    assert.strictEqual(clampSpawnCount(Number.NaN), MIN_SPAWNS);
});

test('starts with nothing pending', () => {
    const {settings} = makeSettings(2);
    assert.strictEqual(settings.applied, 2);
    assert.strictEqual(settings.requested, 2);
    assert.strictEqual(settings.isPending, false);
    assert.strictEqual(settings.applyPending(), false, 'nothing queued means nothing to apply');
});

test('a request is queued, not applied, until the boundary', () => {
    const {settings, state} = makeSettings(1);

    settings.request(3);

    assert.strictEqual(settings.requested, 3);
    assert.strictEqual(settings.applied, 1, 'the map must not change mid-wave');
    assert.strictEqual(settings.isPending, true);
    assert.deepStrictEqual(state.applied, [], 'the map is untouched until applyPending');

    assert.strictEqual(settings.applyPending(), true);
    assert.deepStrictEqual(state.applied, [3]);
    assert.strictEqual(settings.applied, 3);
    assert.strictEqual(settings.isPending, false);
});

test('requesting the current count clears any queued change', () => {
    const {settings, state} = makeSettings(2);

    settings.request(4);
    settings.request(2);

    assert.strictEqual(settings.isPending, false);
    assert.strictEqual(settings.applyPending(), false);
    assert.deepStrictEqual(state.applied, []);
});

test('a request is clamped before it is queued', () => {
    const {settings} = makeSettings(1);
    assert.strictEqual(settings.request(99), MAX_SPAWNS);
    assert.strictEqual(settings.requested, MAX_SPAWNS);
});

test('the map may accept fewer lanes than requested (a tower can block one)', () => {
    const {settings} = makeSettings(1, () => 2);

    settings.request(4);
    settings.applyPending();

    assert.strictEqual(settings.applied, 2, 'the applied count is whatever the map accepted');
    assert.strictEqual(settings.requested, 2);
    assert.strictEqual(settings.isPending, false);
});

console.log('All SpawnSettings tests passed.');
