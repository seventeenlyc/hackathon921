const assert = require('assert');
const {STRATEGY_MAX_LENGTH, strategyLength, isStrategyTooLong} = require('../../.test-build/agent/StrategyLimits.js');

/**
 * DOM-free tests for the client-side mirror of the server's strategy cap.
 *
 * The server (`server/src/agent.ts`) stays authoritative and rejects oversize
 * prompts; this mirror only warns early, so the important properties are that it
 * agrees on the value (5000) and that it measures exactly what the server checks
 * — the trimmed string the panel submits.
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
    console.log('StrategyLimits');

    await test('mirrors the server cap of 5000 characters', () => {
        // Must match MAX_STRATEGY_LENGTH in server/src/agent.ts.
        assert.strictEqual(STRATEGY_MAX_LENGTH, 5000);
    });

    await test('measures the trimmed length the server receives', () => {
        assert.strictEqual(strategyLength('  hold the base  '), 13);
        assert.strictEqual(strategyLength('   '), 0);
    });

    await test('accepts exactly the cap and rejects one character over', () => {
        assert.strictEqual(isStrategyTooLong('x'.repeat(STRATEGY_MAX_LENGTH)), false);
        assert.strictEqual(isStrategyTooLong('x'.repeat(STRATEGY_MAX_LENGTH + 1)), true);
    });

    await test('surrounding whitespace does not count toward the cap', () => {
        assert.strictEqual(isStrategyTooLong(`   ${'x'.repeat(STRATEGY_MAX_LENGTH)}   `), false);
    });

    console.log('All StrategyLimits tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
