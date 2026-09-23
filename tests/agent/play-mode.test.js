const assert = require('assert');
const {readPlayMode, writePlayMode, otherMode, modeUrl} = require('../../.test-build/PlayMode.js');

/**
 * DOM-free tests for the AI / human play-mode switch (docs/PRODUCT_CONCEPT.md §5).
 *
 * The mode decides who controls a run, so the precedence (link > saved > default)
 * and the restart URL are worth pinning down: getting them wrong means a demo
 * link opens the wrong game, or switching modes loses the choice.
 */

function fakeStorage(initial) {
    const values = Object.assign({}, initial);
    return {
        getItem: key => (key in values ? values[key] : null),
        setItem: (key, value) => { values[key] = String(value); },
        removeItem: key => { delete values[key]; },
        clear: () => { for (const key of Object.keys(values)) delete values[key]; },
        key: () => null,
        length: 0,
    };
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
    console.log('PlayMode');

    await test('defaults to ai when there is no link and no saved choice', () => {
        assert.strictEqual(readPlayMode('', null), 'ai');
        assert.strictEqual(readPlayMode('', fakeStorage()), 'ai');
    });

    await test('a ?mode= link forces the mode', () => {
        assert.strictEqual(readPlayMode('?mode=human', null), 'human');
        assert.strictEqual(readPlayMode('?mode=ai', fakeStorage({ 'promptDefense.mode': 'human' })), 'ai');
    });

    await test('the saved choice is used when the link does not specify one', () => {
        assert.strictEqual(readPlayMode('', fakeStorage({ 'promptDefense.mode': 'human' })), 'human');
        assert.strictEqual(readPlayMode('?foo=1', fakeStorage({ 'promptDefense.mode': 'ai' })), 'ai');
    });

    await test('an unknown value falls back to ai', () => {
        assert.strictEqual(readPlayMode('?mode=turbo', null), 'ai');
        assert.strictEqual(readPlayMode('', fakeStorage({ 'promptDefense.mode': 'nonsense' })), 'ai');
    });

    await test('the link wins even when it appears after other params', () => {
        assert.strictEqual(readPlayMode('?foo=1&mode=human&bar=2', null), 'human');
    });

    await test('writePlayMode persists the choice', () => {
        const store = fakeStorage();
        writePlayMode('human', store);
        assert.strictEqual(store.getItem('promptDefense.mode'), 'human');
        assert.strictEqual(readPlayMode('', store), 'human');
    });

    await test('writePlayMode survives a storage that throws', () => {
        const hostile = {
            getItem() { throw new Error('denied'); },
            setItem() { throw new Error('denied'); },
        };
        assert.doesNotThrow(() => writePlayMode('human', hostile));
        assert.strictEqual(readPlayMode('', hostile), 'ai');
    });

    await test('otherMode flips both ways', () => {
        assert.strictEqual(otherMode('ai'), 'human');
        assert.strictEqual(otherMode('human'), 'ai');
    });

    await test('modeUrl removes legacy spawners while setting the mode', () => {
        const url = new URL(modeUrl('https://example.test/?mode=ai&spawners=3', 'human'));
        assert.strictEqual(url.searchParams.get('mode'), 'human');
        assert.strictEqual(url.searchParams.has('spawners'), false);
    });

    console.log('All PlayMode tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
