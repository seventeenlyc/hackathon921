const assert = require('assert');
const {GameLoop} = require('../../.test-build/agent/GameLoop.js');

/**
 * DOM-free tests for the decision cadence (issue #17).
 *
 * GameLoop is the seam where PAUSED / PLANNING / speed / focus decide whether
 * the deterministic simulation and the wave spawner are allowed to advance.
 * Keeping it dependency-free is what makes it verifiable here.
 */

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    console.log('GameLoop');

    await test('starts running and stepping', () => {
        const loop = new GameLoop();
        assert.strictEqual(loop.state, 'running');
        assert.strictEqual(loop.isStepping(), true);
        assert.strictEqual(loop.speed, 1);
    });

    await test('pause is sticky and only an explicit resume clears it', () => {
        const loop = new GameLoop();
        loop.pause();
        assert.strictEqual(loop.state, 'paused');
        assert.strictEqual(loop.isStepping(), false);
        loop.resume();
        assert.strictEqual(loop.state, 'running');
    });

    await test('resume is a no-op while running, pause is a no-op while paused', () => {
        const loop = new GameLoop();
        loop.resume();
        assert.strictEqual(loop.state, 'running');
        loop.pause();
        loop.pause();
        assert.strictEqual(loop.state, 'paused');
    });

    await test('losing focus freezes stepping without entering PAUSED', () => {
        const loop = new GameLoop();
        loop.setFocused(false);
        assert.strictEqual(loop.state, 'running');
        assert.strictEqual(loop.isStepping(), false);
        loop.setFocused(true);
        assert.strictEqual(loop.isStepping(), true);
    });

    await test('listeners observe state transitions in order', () => {
        const loop = new GameLoop();
        const seen = [];
        loop.onChange(state => seen.push(state));
        loop.pause();
        loop.resume();
        assert.deepStrictEqual(seen, ['paused', 'running']);
    });

    await test('holdForPlanning freezes, runs the planner, then returns to running', async () => {
        const loop = new GameLoop();
        const seen = [];
        let ran = false;
        loop.onChange(state => seen.push(state));

        await loop.holdForPlanning({
            plan: async () => {
                ran = true;
                assert.strictEqual(loop.state, 'planning');
                assert.strictEqual(loop.isStepping(), false);
            }
        });

        assert.strictEqual(ran, true);
        assert.strictEqual(loop.state, 'running');
        assert.deepStrictEqual(seen, ['planning', 'running']);
    });

    await test('a throwing planner still returns the loop to running', async () => {
        const loop = new GameLoop();
        await assert.rejects(loop.holdForPlanning({
            plan: async () => {
                throw new Error('boom');
            }
        }));
        assert.strictEqual(loop.state, 'running');
    });

    await test('sleep does not elapse while paused, then completes after resume', async () => {
        const loop = new GameLoop();
        let resolved = false;
        const sleeping = loop.sleep(30).then(() => {
            resolved = true;
        });

        loop.pause();
        await delay(120);
        assert.strictEqual(resolved, false, 'sleep must not resolve while paused');

        loop.resume();
        await sleeping;
        assert.strictEqual(resolved, true);
    });

    await test('sleep does not elapse while planning', async () => {
        const loop = new GameLoop();
        let resolved = false;
        const sleeping = loop.sleep(30).then(() => {
            resolved = true;
        });

        await loop.holdForPlanning({
            plan: async () => {
                await delay(120);
                assert.strictEqual(resolved, false, 'sleep must not resolve while planning');
            }
        });

        await sleeping;
        assert.strictEqual(resolved, true);
    });

    await test('fast mode makes sleep elapse roughly twice as fast', async () => {
        const slow = new GameLoop();
        const fast = new GameLoop();
        fast.setSpeed(2);

        const slowStart = Date.now();
        await slow.sleep(200);
        const slowMs = Date.now() - slowStart;

        const fastStart = Date.now();
        await fast.sleep(200);
        const fastMs = Date.now() - fastStart;

        assert.ok(fastMs < slowMs, `fast (${fastMs}ms) should beat slow (${slowMs}ms)`);
        assert.ok(fastMs < slowMs * 0.7, `fast (${fastMs}ms) should be clearly under slow (${slowMs}ms)`);
    });

    console.log('All GameLoop tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
