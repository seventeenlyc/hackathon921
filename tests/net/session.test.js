const assert = require('assert');
const {GameSession} = require('../../.test-build/net/session.js');

/**
 * The browser-side session hub: owns the last summary/frame, forwards intents,
 * and mirrors server state so the UI can read one source. Tested with a fake
 * client, so no DOM or network.
 */

class FakeClient {
    constructor() {
        this.calls = [];
        this.handlers = null;
        this.closed = false;
        this.created = {
            id: 'g1', username: 'u', mode: 'human', state: 'idle',
            wave: 1, speed: 1, cash: 200, baseLife: 15, tick: 0,
        };
    }

    async createGame(options) {
        this.calls.push(['createGame', options]);
        return this.created;
    }

    connect(id, handlers) {
        this.calls.push(['connect', id]);
        this.handlers = handlers;
        return () => {
            this.closed = true;
        };
    }

    async start() {
        return {...this.created, state: 'planning'};
    }

    async pause() {
        return {...this.created, state: 'paused'};
    }

    async resume() {
        return {...this.created, state: 'running'};
    }

    async setSpeed(id, speed) {
        return {...this.created, speed};
    }

    async submitStrategy(id, text) {
        this.calls.push(['submitStrategy', text]);
        return {accepted: true, version: 1, effectiveWave: 1};
    }

    async requestLanes(id, count) {
        return {accepted: true, requested: count, appliedLanes: 1};
    }

    async humanBuild(id, type, i, j) {
        this.calls.push(['humanBuild', type, i, j]);
        return {ok: true};
    }

    async humanUpgrade(id, towerId) {
        return {ok: true};
    }
}

function frame(overrides) {
    return {
        tick: 0, state: 'running', wave: 1, cash: 200, baseLife: 15, baseMaxLife: 15,
        grid: {width: 61, height: 31, tileSize: 40}, spawns: [], bases: [], rocks: [],
        towers: [], enemies: [], munitions: [], ...overrides,
    };
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
    console.log('GameSession');

    await test('open creates the game, subscribes, and tracks frames', async () => {
        const client = new FakeClient();
        const frames = [];
        const session = new GameSession({
            mode: 'human',
            difficulty: 1,
            ensureToken: async () => 'tok',
            getToken: () => 'tok',
            client,
            onSnapshot: f => frames.push(f),
        });

        const summary = await session.open();
        assert.strictEqual(summary.id, 'g1');
        assert.deepStrictEqual(client.calls[0], ['createGame', {mode: 'human', difficulty: 1}]);
        assert.deepStrictEqual(client.calls[1], ['connect', 'g1']);
        assert.strictEqual(session.isIdle, true);
        assert.strictEqual(session.id, 'g1');

        client.handlers.onSnapshot(frame({state: 'running', wave: 3, cash: 150, tick: 99, spawns: [{i: 1, j: 2}, {i: 3, j: 4}]}));
        assert.strictEqual(session.state, 'running');
        assert.strictEqual(session.wave, 3);
        assert.strictEqual(session.cash, 150);
        assert.strictEqual(session.appliedLaneCount, 2);
        assert.strictEqual(session.lastSnapshot.tick, 99);
        assert.strictEqual(frames.length, 1);
    });

    await test('commands forward to the client and update the summary', async () => {
        const session = new GameSession({
            mode: 'ai',
            difficulty: 2,
            ensureToken: async () => 'tok',
            getToken: () => 'tok',
            client: new FakeClient(),
        });
        await session.open();

        await session.start();
        assert.strictEqual(session.state, 'planning');
        await session.pause();
        assert.strictEqual(session.state, 'paused');
        await session.resume();
        assert.strictEqual(session.state, 'running');
        await session.setSpeed(4);
        assert.strictEqual(session.speed, 4);
    });

    await test('lane changes stay pending until a frame reflects them', async () => {
        const client = new FakeClient();
        const session = new GameSession({
            mode: 'human', difficulty: 1,
            ensureToken: async () => 'tok', getToken: () => 'tok', client,
        });
        await session.open();
        client.handlers.onSnapshot(frame({spawns: [{i: 1, j: 2}]}));
        assert.strictEqual(session.appliedLaneCount, 1);

        await session.requestLanes(3);
        assert.strictEqual(session.requestedLaneCount, 3);
        assert.strictEqual(session.isLaneChangePending, true);

        client.handlers.onSnapshot(frame({spawns: [{i: 1, j: 2}, {i: 3, j: 4}, {i: 5, j: 6}]}));
        assert.strictEqual(session.appliedLaneCount, 3);
        assert.strictEqual(session.isLaneChangePending, false);
    });

    await test('game over is surfaced, and close disconnects', async () => {
        const client = new FakeClient();
        let over = null;
        const session = new GameSession({
            mode: 'ai', difficulty: 1,
            ensureToken: async () => 'tok', getToken: () => 'tok', client,
            onGameOver: summary => {
                over = summary;
            },
        });
        await session.open();
        client.handlers.onOver({state: 'over', wave: 12});
        assert.strictEqual(over.wave, 12);
        assert.strictEqual(session.state, 'over');

        session.close();
        assert.strictEqual(client.closed, true);
    });

    await test('a missing session fails closed', async () => {
        const session = new GameSession({
            mode: 'ai', difficulty: 1,
            ensureToken: async () => null, getToken: () => null,
            client: new FakeClient(),
        });
        await assert.rejects(() => session.open(), /NO_SESSION/);
    });

    console.log('All GameSession tests passed.');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
