const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'leaderboard', 'LeaderboardClient.ts'), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;

function response(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function loadClient(fetchImpl) {
    const moduleObj = { exports: {} };
    new Function('module', 'exports', 'require', 'fetch', 'AbortController', 'setTimeout', 'clearTimeout', js)(
        moduleObj,
        moduleObj.exports,
        name => {
            if (name === './LeaderboardStore') return { sanitizeUsername: value => typeof value === 'string' ? value.trim() : null };
            throw new Error('Unexpected dependency: ' + name);
        },
        fetchImpl,
        undefined,
        () => 1,
        () => {}
    );
    return moduleObj.exports;
}

async function test(name, fn) {
    try { await fn(); console.log('PASS: ' + name); }
    catch (error) { console.error('FAIL: ' + name, error); process.exitCode = 1; }
}

(async () => {
    await test('concurrent session and run requests are each sent once', async () => {
        const pending = [];
        const client = loadClient((url, init) => new Promise(resolve => pending.push({ url, init, resolve })));
        const first = client.ensureSessionToken('Alice');
        const second = client.ensureSessionToken('Alice');
        assert.strictEqual(pending.length, 1);
        pending.shift().resolve(response({ token: 'alice-token', username: 'Alice' }));
        assert.deepStrictEqual(await Promise.all([first, second]), ['alice-token', 'alice-token']);

        const runA = client.ensureRun('Alice');
        const runB = client.ensureRun('Alice');
        await Promise.resolve();
        assert.strictEqual(pending.length, 1);
        pending.shift().resolve(response({ runId: 'run-1' }, 201));
        assert.deepStrictEqual(await Promise.all([runA, runB]), ['run-1', 'run-1']);
    });

    await test('a stale session response cannot overwrite a newer nickname session', async () => {
        const pending = [];
        const client = loadClient((url, init) => new Promise(resolve => pending.push({ url, init, resolve })));
        const alice = client.ensureSessionToken('Alice');
        const bob = client.ensureSessionToken('Bob');
        assert.strictEqual(pending.length, 2);
        pending[1].resolve(response({ token: 'bob-token', username: 'Bob' }));
        assert.strictEqual(await bob, 'bob-token');
        pending[0].resolve(response({ token: 'alice-token', username: 'Alice' }));
        assert.strictEqual(await alice, 'alice-token');
        assert.strictEqual(client.getSessionToken(), 'bob-token');
    });

    await test('a lost prompt response retries the same version and payload for server idempotency', async () => {
        const calls = [];
        const client = loadClient(async (url, init) => {
            calls.push({ url, init });
            if (url.endsWith('/session')) return response({ token: 'alice-token', username: 'Alice' });
            if (url.endsWith('/runs')) return response({ runId: 'run-1' }, 201);
            if (url.endsWith('/prompts')) return { ok: true, status: 200, json: async () => { throw new Error('response lost'); } };
            throw new Error('unexpected request: ' + url);
        });
        await client.ensureRun('Alice');
        assert.strictEqual(await client.recordPromptVersion('Alice', { version: 3, text: 'C', fromWave: 2 }), null);
        assert.strictEqual(await client.recordPromptVersion('Alice', { version: 3, text: 'C', fromWave: 2 }), null);
        const promptCalls = calls.filter(call => call.url.endsWith('/prompts'));
        assert.strictEqual(promptCalls.length, 2);
        assert.deepStrictEqual(JSON.parse(promptCalls[0].init.body), JSON.parse(promptCalls[1].init.body));
    });

    await test('reporting the same wave twice keeps one run and sends no second wave event', async () => {
        const calls = [];
        const client = loadClient(async (url, init) => {
            calls.push({ url, init });
            if (url.endsWith('/session')) return response({ token: 'alice-token', username: 'Alice' });
            if (url.endsWith('/runs')) return response({ runId: 'run-1' }, 201);
            if (url.endsWith('/waves')) return response({ accepted: true, bestWave: 1 });
            throw new Error('unexpected request: ' + url);
        });
        assert.strictEqual(await client.syncReachedWave('Alice', 1), 1);
        assert.strictEqual(await client.syncReachedWave('Alice', 1), 1);
        assert.strictEqual(calls.filter(call => call.url.endsWith('/session')).length, 1);
        assert.strictEqual(calls.filter(call => call.url.endsWith('/runs')).length, 1);
        assert.strictEqual(calls.filter(call => call.url.endsWith('/waves')).length, 1);
    });
})();
