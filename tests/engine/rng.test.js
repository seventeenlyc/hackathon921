const assert = require('assert');
const {Rng} = require('../../.test-build/engine/Rng.js');

/**
 * The engine's randomness must be reproducible: same seed, same sequence. These
 * tests pin that contract, because the backend replay/verification story depends
 * on it.
 */

function sequence(seed, count) {
    const rng = new Rng(seed);
    const values = [];
    for (let i = 0; i < count; ++i) values.push(rng.next());
    return values;
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

console.log('Rng');

test('same seed produces the same sequence', () => {
    assert.deepStrictEqual(sequence(12345, 20), sequence(12345, 20));
});

test('different seeds diverge', () => {
    assert.notDeepStrictEqual(sequence(1, 20), sequence(2, 20));
});

test('output stays in [0, 1)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 1000; ++i) {
        const value = rng.next();
        assert.ok(value >= 0 && value < 1, `out of range: ${value}`);
    }
});

test('the sequence is reproducible after any number of draws', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    for (let i = 0; i < 137; ++i) {
        a.next();
        b.next();
    }
    assert.strictEqual(a.next(), b.next());
    assert.strictEqual(a.snapshot(), b.snapshot());
});

test('range matches the old rand(min, max) including fractional bounds', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 500; ++i) {
        const value = rng.range(0, 2.6);
        assert.ok(value >= 0 && value < 2.6);
        assert.ok(Number.isInteger(value));
    }
});

test('int stays below the exclusive bound', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 500; ++i) {
        const value = rng.int(10);
        assert.ok(value >= 0 && value < 10);
    }
});

test('two instances keep independent state', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    a.next();
    a.next();
    assert.strictEqual(b.snapshot(), new Rng(5).snapshot(), 'b must be untouched by a');
});

test('shuffle is a deterministic permutation', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const first = new Rng(11).shuffle(input.slice());
    const second = new Rng(11).shuffle(input.slice());
    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(first.slice().sort((x, y) => x - y), input);
});

console.log('All Rng tests passed.');
