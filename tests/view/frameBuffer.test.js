const assert = require('assert');
const {FrameBuffer} = require('../../.test-build/view/frameBuffer.js');

function frame(tick, x) {
    return {
        tick, state: 'running', wave: 1, cash: 200, baseLife: 15, baseMaxLife: 15,
        grid: {width: 61, height: 31, tileSize: 40}, spawns: [], bases: [], rocks: [],
        towers: [], munitions: [],
        enemies: x === undefined ? [] : [{id: 1, kind: 'simple', x, y: 0, radius: 8, life: 50, damageTaken: 0}],
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

console.log('FrameBuffer');

test('returns null before any frame arrives', () => {
    assert.strictEqual(new FrameBuffer(150).sample(1000), null);
});

test('returns the only frame when just one arrived', () => {
    const buffer = new FrameBuffer(150);
    const only = frame(1, 0);
    buffer.push(only, 1000);
    assert.strictEqual(buffer.sample(2000), only);
});

test('samples a delayed point between two frames', () => {
    const buffer = new FrameBuffer(150);
    buffer.push(frame(1, 0), 1000);
    buffer.push(frame(2, 100), 1100);
    // now 1200 - 150 buffer = 1050 -> halfway between the two arrivals.
    const sampled = buffer.sample(1200);
    assert.strictEqual(sampled.enemies[0].x, 50);
});

test('holds the oldest frame when the target predates the buffer', () => {
    const buffer = new FrameBuffer(150);
    const first = frame(1, 0);
    buffer.push(first, 1000);
    buffer.push(frame(2, 100), 1100);
    assert.strictEqual(buffer.sample(1010), first);
});

test('holds the newest frame when a gap exceeds the buffer', () => {
    const buffer = new FrameBuffer(150);
    buffer.push(frame(1, 0), 1000);
    const newest = frame(2, 100);
    buffer.push(newest, 1400);
    assert.strictEqual(buffer.sample(2000), newest);
});

test('a late frame only shortens the buffer, it does not stall the timeline', () => {
    const buffer = new FrameBuffer(150);
    buffer.push(frame(1, 0), 1000);   // nominal 50 ms frames
    buffer.push(frame(2, 50), 1050);
    buffer.push(frame(3, 100), 1350); // 300 ms late
    // At 1300 the target is 1150: between frame 2 (1050) and frame 3 (1350).
    const sampled = buffer.sample(1300);
    assert.ok(sampled.enemies[0].x > 50 && sampled.enemies[0].x < 100,
        'expected a blend inside the gap, got ' + sampled.enemies[0].x);
});

test('reset clears history so it never blends across a pause', () => {
    const buffer = new FrameBuffer(150);
    buffer.push(frame(1, 0), 1000);
    buffer.reset();
    assert.strictEqual(buffer.size, 0);
    assert.strictEqual(buffer.sample(1200), null);
});

test('caps the history', () => {
    const buffer = new FrameBuffer(150, 4);
    for (let i = 0; i < 10; i += 1) buffer.push(frame(i, i), 1000 + i * 50);
    assert.strictEqual(buffer.size, 4);
});

console.log('All FrameBuffer tests passed.');
