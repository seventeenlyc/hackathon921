const assert = require('assert');
const {STRATEGY_EXAMPLES, randomStrategy} = require('../../.test-build/agent/StrategyLibrary.js');

/**
 * DOM-free tests for the beginner strategy examples (docs/PRODUCT_CONCEPT.md §6).
 *
 * The examples are the only content a first-time player gets for free, so they
 * must be non-empty, readable, and actually different from one another — a
 * library of near-duplicates would not demonstrate that the Prompt matters.
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
    console.log('StrategyLibrary');

    await test('ships several non-empty examples', () => {
        assert.ok(STRATEGY_EXAMPLES.length >= 4, 'expected at least four examples');
        for (const example of STRATEGY_EXAMPLES) {
            assert.strictEqual(typeof example, 'string');
            assert.ok(example.trim().length > 0, 'examples must not be blank');
        }
    });

    await test('examples are distinct', () => {
        assert.strictEqual(new Set(STRATEGY_EXAMPLES).size, STRATEGY_EXAMPLES.length);
    });

    await test('randomStrategy always returns one of the examples', () => {
        for (let i = 0; i < 50; ++i) {
            assert.ok(STRATEGY_EXAMPLES.indexOf(randomStrategy()) !== -1);
        }
    });

    await test('randomStrategy is deterministic for an injected rand', () => {
        assert.strictEqual(randomStrategy(() => 0), STRATEGY_EXAMPLES[0]);
        assert.strictEqual(randomStrategy(() => 0.5), STRATEGY_EXAMPLES[Math.floor(0.5 * STRATEGY_EXAMPLES.length)]);
    });

    await test('randomStrategy clamps a rand returning exactly 1', () => {
        assert.strictEqual(randomStrategy(() => 1), STRATEGY_EXAMPLES[STRATEGY_EXAMPLES.length - 1]);
    });

    console.log('All StrategyLibrary tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
