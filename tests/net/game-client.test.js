const assert = require('assert');
const {GameClient, GameClientError} = require('../../.test-build/net/GameClient.js');

/**
 * The browser's command/stream client, tested with injected fetch and
 * EventSource so no DOM or network is needed. Phase C's contract is "browser
 * sends intents, server owns the truth", so these assertions are about the exact
 * routes, auth header and frame handling.
 */

class FakeEventSource {
    constructor(url) {
        this.url = url;
        this.listeners = {};
        this.closed = false;
        FakeEventSource.last = this;
    }

    addEventListener(type, listener) {
        (this.listeners[type] = this.listeners[type] || []).push(listener);
    }

    close() {
        this.closed = true;
    }

    emit(type, data) {
        (this.listeners[type] || []).forEach(listener => listener({data}));
    }
}

function fakeFetch(responses) {
    const calls = [];
    const impl = async (url, init) => {
        calls.push({url, init});
        const next = responses.shift() || {ok: true, status: 200, body: {}};
        return {
            ok: next.ok !== false,
            status: next.status || 200,
            json: async () => next.body,
        };
    };
    impl.calls = calls;
    return impl;
}

function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(
                () => console.log(`  ok  ${name}`),
                error => {
                    console.error(`FAIL  ${name}`);
                    throw error;
                },
            );
        }
        console.log(`  ok  ${name}`);
    } catch (error) {
        console.error(`FAIL  ${name}`);
        throw error;
    }
}

(async function main() {
    console.log('GameClient');

    await test('createGame posts to /api/games with the session token', async () => {
        const fetchImpl = fakeFetch([{body: {id: 'g1', mode: 'human', state: 'idle'}}]);
        const client = new GameClient({getToken: () => 'tok', fetchImpl});

        const game = await client.createGame({mode: 'human', difficulty: 1});
        assert.strictEqual(game.id, 'g1');
        assert.strictEqual(fetchImpl.calls[0].url, '/api/games');
        assert.strictEqual(fetchImpl.calls[0].init.method, 'POST');
        assert.strictEqual(fetchImpl.calls[0].init.headers.authorization, 'Bearer tok');
        assert.deepStrictEqual(JSON.parse(fetchImpl.calls[0].init.body), {mode: 'human', difficulty: 1});
    });

    await test('commands hit their routes', async () => {
        const fetchImpl = fakeFetch([{body: {}}, {body: {}}, {body: {}}, {body: {}}]);
        const client = new GameClient({getToken: () => 'tok', fetchImpl});

        await client.start('g 1');
        await client.pause('g 1');
        await client.setSpeed('g 1', 4);
        await client.humanBuild('g 1', 'canon', 3, 4);

        assert.strictEqual(fetchImpl.calls[0].url, '/api/games/g%201/start');
        assert.strictEqual(fetchImpl.calls[1].url, '/api/games/g%201/pause');
        assert.strictEqual(fetchImpl.calls[2].url, '/api/games/g%201/speed');
        assert.deepStrictEqual(JSON.parse(fetchImpl.calls[2].init.body), {speed: 4});
        assert.strictEqual(fetchImpl.calls[3].url, '/api/games/g%201/actions');
        assert.deepStrictEqual(JSON.parse(fetchImpl.calls[3].init.body), {action: 'build_tower', type: 'canon', i: 3, j: 4});
    });

    await test('a rejected command surfaces the server error code', async () => {
        const fetchImpl = fakeFetch([{ok: false, status: 409, body: {error: 'CELL_OCCUPIED'}}]);
        const client = new GameClient({getToken: () => 'tok', fetchImpl});

        await assert.rejects(
            () => client.humanBuild('g1', 'canon', 1, 1),
            error => error instanceof GameClientError && error.status === 409 && error.code === 'CELL_OCCUPIED',
        );
    });

    await test('connect streams snapshots and closes cleanly', async () => {
        const frames = [];
        let over = null;
        const client = new GameClient({
            getToken: () => 'tok',
            fetchImpl: fakeFetch([]),
            eventSourceFactory: url => new FakeEventSource(url),
        });

        const disconnect = client.connect('g1', {
            onSnapshot: frame => frames.push(frame),
            onOver: summary => {
                over = summary;
            },
        });

        const source = FakeEventSource.last;
        assert.strictEqual(source.url, '/api/games/g1/stream?token=tok');

        source.emit('snapshot', JSON.stringify({tick: 3, cash: 200}));
        assert.strictEqual(frames.length, 1);
        assert.strictEqual(frames[0].tick, 3);
        assert.strictEqual(client.lastSnapshot.tick, 3);

        source.emit('over', JSON.stringify({state: 'over', wave: 9}));
        assert.strictEqual(over.wave, 9);

        disconnect();
        assert.strictEqual(source.closed, true);
    });

    await test('a malformed frame reports an error instead of throwing', async () => {
        const errors = [];
        const client = new GameClient({
            getToken: () => null,
            fetchImpl: fakeFetch([]),
            eventSourceFactory: url => new FakeEventSource(url),
        });

        client.connect('g1', {onSnapshot: () => assert.fail('must not deliver'), onError: message => errors.push(message)});
        FakeEventSource.last.emit('snapshot', 'not json');
        assert.deepStrictEqual(errors, ['BAD_FRAME']);
    });

    console.log('All GameClient tests passed.');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
