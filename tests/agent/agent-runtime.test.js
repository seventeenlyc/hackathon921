const assert = require('assert');
const {AgentRuntime} = require('../../.test-build/agent/AgentRuntime.js');
const {StrategyStore} = require('../../.test-build/agent/StrategyStore.js');

/**
 * DOM-free tests for the AI decision loop (issue #25).
 *
 * The action port, the proxy and the strategy store are all injected, so these
 * pin down the behaviour that matters: actions reach the engine through
 * GameActions, engine rejections are surfaced, and every failure is fail-closed.
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

function jsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

class FakeActions {
    constructor(options = {}) {
        this._state = options.state || {wave: 3, cash: 100, baseLife: 15, towers: []};
        this.buildResult = options.buildResult;
        this.upgradeResult = options.upgradeResult;
        this.buildCalls = [];
        this.upgradeCalls = [];
    }

    getState() {
        return this._state;
    }

    buildTower(type, i, j) {
        this.buildCalls.push({type, i, j});
        return this.buildResult || {ok: true, data: {towerId: `${i}:${j}`, cost: 50}, message: `Built a ${type}.`};
    }

    upgradeTower(id) {
        this.upgradeCalls.push(id);
        return this.upgradeResult || {ok: true, data: {level: 2, upgradeCost: 30}, message: `Upgraded ${id}.`};
    }
}

function makeStore(text = 'hold the base') {
    return new StrategyStore(text, 1);
}

(async () => {
    console.log('AgentRuntime');

    await test('sends the active strategy + state and executes the returned actions', async () => {
        const actions = new FakeActions({state: {wave: 5, cash: 200, baseLife: 12, towers: []}});
        const decisions = [];
        let sent;
        const runtime = new AgentRuntime({
            actions,
            store: makeStore('prioritize the base'),
            fetchImpl: async (url, options) => {
                sent = {url, body: JSON.parse(options.body)};
                return jsonResponse(200, {
                    ok: true,
                    actions: [
                        {name: 'build_tower', arguments: {type: 'canon', i: 4, j: 7}},
                        {name: 'upgrade_tower', arguments: {id: '2:3'}},
                    ],
                });
            },
            onDecision: entry => decisions.push(entry),
        });

        await runtime.plan();

        assert.strictEqual(sent.url, '/api/agent/decide');
        assert.strictEqual(sent.body.strategy, 'prioritize the base');
        assert.strictEqual(sent.body.state.wave, 5);

        assert.deepStrictEqual(actions.buildCalls, [{type: 'canon', i: 4, j: 7}]);
        assert.deepStrictEqual(actions.upgradeCalls, ['2:3']);

        assert.strictEqual(decisions.length, 2);
        assert.deepStrictEqual(decisions.map(d => d.wave), [5, 5], 'decisions govern the wave the snapshot names');
        assert.strictEqual(decisions[0].ok, true);
        assert.strictEqual(decisions[0].action, 'build_tower');
    });

    await test('ignores unknown action names without executing them', async () => {
        const actions = new FakeActions();
        const decisions = [];
        const runtime = new AgentRuntime({
            actions,
            store: makeStore(),
            fetchImpl: async () => jsonResponse(200, {
                ok: true,
                actions: [{name: 'nuke_everything', arguments: {}}],
            }),
            onDecision: entry => decisions.push(entry),
        });

        await runtime.plan();

        assert.deepStrictEqual(actions.buildCalls, []);
        assert.deepStrictEqual(actions.upgradeCalls, []);
        assert.strictEqual(decisions.length, 1);
        assert.strictEqual(decisions[0].ok, false);
        assert.ok(decisions[0].message.includes('nuke_everything'));
    });

    await test('surfaces an engine rejection instead of hiding it', async () => {
        const actions = new FakeActions({
            buildResult: {ok: false, error: 'BLOCKS_PATH', message: 'Placing a tower at (3, 3) would block the path.'},
        });
        const decisions = [];
        const runtime = new AgentRuntime({
            actions,
            store: makeStore(),
            fetchImpl: async () => jsonResponse(200, {
                ok: true,
                actions: [{name: 'build_tower', arguments: {type: 'canon', i: 3, j: 3}}],
            }),
            onDecision: entry => decisions.push(entry),
        });

        await runtime.plan();

        assert.strictEqual(decisions[0].ok, false);
        assert.ok(decisions[0].message.includes('block the path'));
    });

    await test('fail-closed: a network error takes no action and reports', async () => {
        const actions = new FakeActions();
        const errors = [];
        const runtime = new AgentRuntime({
            actions,
            store: makeStore(),
            fetchImpl: async () => {
                throw new Error('ECONNREFUSED');
            },
            onError: message => errors.push(message),
        });

        await runtime.plan();

        assert.deepStrictEqual(actions.buildCalls, []);
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].includes('agent proxy'));
    });

    await test('fail-closed: a non-OK HTTP status reports without acting', async () => {
        const actions = new FakeActions();
        const errors = [];
        const runtime = new AgentRuntime({
            actions,
            store: makeStore(),
            fetchImpl: async () => jsonResponse(503, {ok: false, error: 'PROVIDER_NOT_CONFIGURED'}),
            onError: message => errors.push(message),
        });

        await runtime.plan();

        assert.deepStrictEqual(actions.buildCalls, []);
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].includes('503'));
    });

    await test('fail-closed: prefers the proxy\'s own failure message over the status code', async () => {
        const errors = [];
        const runtime = new AgentRuntime({
            actions: new FakeActions(),
            store: makeStore(),
            fetchImpl: async () => jsonResponse(503, {ok: false, error: 'PROVIDER_NOT_CONFIGURED', message: 'The agent proxy has no DEEPSEEK_API_KEY configured.'}),
            onError: message => errors.push(message),
        });

        await runtime.plan();
        assert.deepStrictEqual(errors, ['The agent proxy has no DEEPSEEK_API_KEY configured.']);
    });

    await test('fail-closed: a rejected payload reports the server message', async () => {
        const errors = [];
        const runtime = new AgentRuntime({
            actions: new FakeActions(),
            store: makeStore(),
            fetchImpl: async () => jsonResponse(200, {ok: false, error: 'RATE_LIMITED', message: 'Too many decisions.'}),
            onError: message => errors.push(message),
        });

        await runtime.plan();
        assert.deepStrictEqual(errors, ['Too many decisions.']);
    });

    await test('does not call the proxy when no strategy has been written', async () => {
        let called = false;
        const errors = [];
        const runtime = new AgentRuntime({
            actions: new FakeActions(),
            store: makeStore('   '),
            fetchImpl: async () => {
                called = true;
                return jsonResponse(200, {ok: true, actions: []});
            },
            onError: message => errors.push(message),
        });

        await runtime.plan();

        assert.strictEqual(called, false);
        assert.strictEqual(errors.length, 1);
    });

    await test('caps the number of actions executed per wave', async () => {
        const actions = new FakeActions();
        const runtime = new AgentRuntime({
            actions,
            store: makeStore(),
            maxActions: 2,
            fetchImpl: async () => jsonResponse(200, {
                ok: true,
                actions: [
                    {name: 'build_tower', arguments: {type: 'canon', i: 1, j: 1}},
                    {name: 'build_tower', arguments: {type: 'canon', i: 2, j: 2}},
                    {name: 'build_tower', arguments: {type: 'canon', i: 3, j: 3}},
                ],
            }),
        });

        await runtime.plan();
        assert.strictEqual(actions.buildCalls.length, 2);
    });

    await test('an edit made while the AI is thinking defers to the next wave', async () => {
        const actions = new FakeActions();
        const store = makeStore('A');
        let sentStrategy;
        let release;
        const gate = new Promise(resolve => {
            release = resolve;
        });

        const runtime = new AgentRuntime({
            actions,
            store,
            fetchImpl: async (url, options) => {
                sentStrategy = JSON.parse(options.body).strategy;
                await gate;
                return jsonResponse(200, {ok: true, actions: []});
            },
        });

        const planning = runtime.plan();
        await delay(10);
        // The player edits while PLANNING is in flight; the wave must still obey A.
        store.submit('B', 2);
        release();
        await planning;

        assert.strictEqual(sentStrategy, 'A');
        assert.strictEqual(store.active().text, 'A');
        assert.strictEqual(store.queued().text, 'B');
    });

    await test('attaches the session token when one is available', async () => {
        let sentToken = null;
        const runtime = new AgentRuntime({
            actions: new FakeActions(),
            store: makeStore(),
            getToken: () => 'session-token-123',
            fetchImpl: async (url, options) => {
                sentToken = options.headers.authorization;
                return jsonResponse(200, {ok: true, actions: []});
            },
        });

        await runtime.plan();
        assert.strictEqual(sentToken, 'Bearer session-token-123');
    });

    await test('fail-closed: a hung request times out instead of freezing PLANNING', async () => {
        const errors = [];
        const runtime = new AgentRuntime({
            actions: new FakeActions(),
            store: makeStore(),
            timeoutMs: 20,
            fetchImpl: (url, options) => new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => {
                    const error = new Error('aborted');
                    error.name = 'AbortError';
                    reject(error);
                });
            }),
            onError: message => errors.push(message),
        });

        await runtime.plan();
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].includes('did not answer within 20ms'));
    });

    console.log('All AgentRuntime tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
