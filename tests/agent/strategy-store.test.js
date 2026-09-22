const assert = require('assert');
const {StrategyStore, effectiveWave} = require('../../.test-build/agent/StrategyStore.js');

/**
 * DOM-free tests for the strategy versioning rules (issue #17).
 *
 * StrategyStore owns when a player's prompt takes effect: a submission is only
 * queued, PLANNING locks it for the upcoming wave, and edits between two
 * boundaries overwrite one another. Those rules are what makes "my edit changes
 * the AI's behaviour at the next wave, and never mid-wave" true, so they are
 * verified here rather than through the browser.
 */

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ok  ${name}`);
    } catch (error) {
        console.error(`FAIL  ${name}`);
        throw error;
    }
}

(async () => {
    console.log('StrategyStore');

    await test('starts with the initial version active and nothing queued', () => {
        const store = new StrategyStore('hold the base', 1);
        assert.deepStrictEqual(store.active(), {version: 0, text: 'hold the base', fromWave: 1});
        assert.strictEqual(store.queued(), null);
        assert.deepStrictEqual(store.history(), [{version: 0, text: 'hold the base', fromWave: 1}]);
    });

    await test('a submission is queued without changing the active version', () => {
        const store = new StrategyStore('', 1);
        const submitted = store.submit('keep 30% cash', 2);

        assert.strictEqual(submitted.version, 1);
        assert.strictEqual(submitted.fromWave, 2);
        assert.strictEqual(store.queued().text, 'keep 30% cash');
        // The wave in progress must not observe the new strategy.
        assert.strictEqual(store.active().version, 0);
    });

    await test('the last submission before a lock wins', () => {
        const store = new StrategyStore('', 1);
        store.submit('first idea', 2);
        const last = store.submit('second idea', 2);

        assert.strictEqual(store.queued().version, last.version);
        assert.strictEqual(store.queued().text, 'second idea');
    });

    await test('lock promotes the queued version and clears the queue', () => {
        const store = new StrategyStore('', 1);
        store.submit('slow the fast ones', 2);
        const active = store.lock();

        assert.strictEqual(active.text, 'slow the fast ones');
        assert.strictEqual(active.fromWave, 2);
        assert.strictEqual(store.active().version, 1);
        assert.strictEqual(store.queued(), null);
    });

    await test('lock is a no-op when nothing is queued', () => {
        const store = new StrategyStore('unchanged', 1);
        const active = store.lock();

        assert.strictEqual(active.text, 'unchanged');
        assert.deepStrictEqual(store.history(), [{version: 0, text: 'unchanged', fromWave: 1}]);
    });

    await test('activateForRun applies the opening prompt before the run starts', () => {
        const store = new StrategyStore('', 1);
        store.submit('snake around the spawn', 1);

        const opened = store.activateForRun();

        // Wave 1 plans with this version even if the first PLANNING lock is missed.
        assert.strictEqual(opened.text, 'snake around the spawn');
        assert.strictEqual(store.active().version, 1);
        assert.strictEqual(store.queued(), null);
    });

    await test('activateForRun is idempotent and safe to call again at PLANNING', () => {
        const store = new StrategyStore('', 1);
        store.submit('hold the base', 1);
        store.activateForRun();

        // The loop still fires the PLANNING lock; it must not create a phantom version.
        const locked = store.lock();
        assert.strictEqual(locked.text, 'hold the base');
        assert.deepStrictEqual(store.history().map(version => version.text), ['', 'hold the base']);
    });

    await test('activateForRun refuses an empty prompt', () => {
        const store = new StrategyStore('', 1);
        assert.strictEqual(store.activateForRun(), null);

        store.submit('   ', 1);
        assert.strictEqual(store.activateForRun(), null);
        assert.strictEqual(store.queued().text, '   ', 'a blank submission is not silently applied');
    });

    await test('history keeps every version that took effect', () => {
        const store = new StrategyStore('v0', 1);
        store.submit('v1', 2);
        store.lock();
        store.submit('v2', 3);
        store.lock();

        assert.deepStrictEqual(store.history().map(version => version.text), ['v0', 'v1', 'v2']);
        assert.deepStrictEqual(store.history().map(version => version.fromWave), [1, 2, 3]);
    });

    await test('listeners fire on submit and on lock', () => {
        const store = new StrategyStore('', 1);
        let notifications = 0;
        store.onChange(() => { notifications += 1; });

        store.submit('a', 2);
        assert.strictEqual(notifications, 1);
        store.lock();
        assert.strictEqual(notifications, 2);
        // A no-op lock must not notify.
        store.lock();
        assert.strictEqual(notifications, 2);
    });

    await test('the opening prompt submitted while IDLE is active from wave 1', () => {
        assert.strictEqual(effectiveWave(1, true), 1);
    });

    await test('a submission after starting lands on the next wave boundary', () => {
        // PLANNING now precedes each wave, so the counter names the wave being
        // planned/running and the next boundary is always currentWave + 1 — for a
        // RUNNING edit and a PLANNING edit alike (the wave in flight is locked).
        assert.strictEqual(effectiveWave(5, false), 6);
    });

    console.log('All StrategyStore tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
