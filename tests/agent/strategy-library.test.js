const assert = require('assert');
const {STRATEGY_KEYS, randomStrategy} = require('../../.test-build/agent/StrategyLibrary.js');
const {t} = require('../../.test-build/i18n.js');

/**
 * DOM-free tests for the beginner strategy examples (docs/PRODUCT_CONCEPT.md §6).
 *
 * The examples are the only content a first-time player gets for free, so they
 * must be non-empty, readable, and actually different from one another — a
 * library of near-duplicates would not demonstrate that the Prompt matters.
 *
 * The text itself lives in i18n.ts (so it follows the UI language); this module
 * owns the selection.
 */

async function test(name, fn) {
    await fn();
    console.log(`  ok  ${name}`);
}

(async () => {
    console.log('StrategyLibrary');

    await test('ships several non-empty examples', () => {
        assert.ok(STRATEGY_KEYS.length >= 4, 'expected at least four examples');
        for (const key of STRATEGY_KEYS) {
            assert.strictEqual(typeof key, 'string');
            assert.ok(t(key).trim().length > 0, `${key} must not translate to a blank example`);
        }
    });

    await test('examples are distinct', () => {
        assert.strictEqual(new Set(STRATEGY_KEYS).size, STRATEGY_KEYS.length);
        const text = STRATEGY_KEYS.map(t);
        assert.strictEqual(new Set(text).size, text.length, 'examples must not be near-duplicates');
    });

    await test('randomStrategy always returns a translated example', () => {
        for (let i = 0; i < 50; ++i) {
            const picked = randomStrategy();
            assert.ok(STRATEGY_KEYS.some(key => t(key) === picked), 'must return one of the examples');
        }
    });

    await test('randomStrategy is deterministic for an injected rand', () => {
        assert.strictEqual(randomStrategy(() => 0), t(STRATEGY_KEYS[0]));
        assert.strictEqual(randomStrategy(() => 0.5), t(STRATEGY_KEYS[Math.floor(0.5 * STRATEGY_KEYS.length)]));
    });

    await test('randomStrategy clamps a rand returning exactly 1', () => {
        assert.strictEqual(randomStrategy(() => 1), t(STRATEGY_KEYS[STRATEGY_KEYS.length - 1]));
    });

    console.log('All StrategyLibrary tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
