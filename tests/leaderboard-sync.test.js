const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'leaderboard', 'RunSync.ts'), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;

function loadSync(client) {
    const moduleObj = { exports: {} };
    new Function('module', 'exports', 'require', js)(
        moduleObj,
        moduleObj.exports,
        name => {
            if (name === './LeaderboardClient') return client;
            throw new Error('Unexpected dependency: ' + name);
        }
    );
    return moduleObj.exports;
}

async function test(name, fn) {
    try { await fn(); console.log('PASS: ' + name); }
    catch (error) { console.error('FAIL: ' + name, error); process.exitCode = 1; }
}

(async () => {
    await test('prompt and wave events are sent serially on one run in activation order', async () => {
        const sent = [];
        const client = {
            ensureRun: async () => { sent.push({ kind: 'session' }); sent.push({ kind: 'run', runId: 'run-1' }); return 'run-1'; },
            recordPromptVersion: async (username, version) => { sent.push({ kind: `prompt:${version.version}`, runId: 'run-1' }); return { recorded: true, version: version.version, fromWave: version.fromWave }; },
            syncReachedWave: async (username, wave) => { sent.push({ kind: `wave:${wave}`, runId: 'run-1' }); return wave; },
        };
        const { RunSync } = loadSync(client);
        const sync = new RunSync(client, { wait: async () => {} });
        sync.prepareRun('Alice');
        sync.enqueuePrompt('Alice', { version: 1, text: 'A', fromWave: 1 });
        sync.enqueueWave('Alice', 1);
        sync.enqueuePrompt('Alice', { version: 3, text: 'C', fromWave: 2 });
        sync.enqueueWave('Alice', 2);
        await sync.whenIdle();
        assert.deepStrictEqual(sent.map(item => item.kind), ['session', 'run', 'prompt:1', 'wave:1', 'prompt:3', 'wave:2']);
        assert.strictEqual(new Set(sent.filter(item => item.runId).map(item => item.runId)).size, 1);
    });

    await test('a failed prompt stays at the queue head and later waves wait for retry', async () => {
        const sent = [];
        let failures = 0;
        const client = {
            ensureRun: async () => 'run-1',
            recordPromptVersion: async () => {
                sent.push('prompt');
                if (failures++ === 0) return { ok: false, status: 503, retryable: false, reason: 'TEMP' };
                return { ok: true, value: { recorded: true, version: 1, fromWave: 1 } };
            },
            syncReachedWave: async () => { sent.push('wave'); return { ok: true, value: 1 }; },
        };
        const { RunSync } = loadSync(client);
        const sync = new RunSync(client, { wait: async () => {} });
        sync.enqueuePrompt('Alice', { version: 1, text: 'A', fromWave: 1 });
        sync.enqueueWave('Alice', 1);
        await sync.whenIdle();
        assert.deepStrictEqual(sent, ['prompt']);
        sync.retryPending();
        await sync.whenIdle();
        assert.deepStrictEqual(sent, ['prompt', 'prompt', 'wave']);
    });

    await test('network failures retry three times with 1, 2 and 4 second delays', async () => {
        const waits = [];
        let attempts = 0;
        const client = {
            ensureRun: async () => 'run-1',
            recordPromptVersion: async () => {
                attempts += 1;
                return attempts < 4
                    ? { ok: false, status: 503, retryable: true, reason: 'TEMP' }
                    : { ok: true, value: { recorded: true, version: 1, fromWave: 1 } };
            },
            syncReachedWave: async () => ({ ok: true, value: 1 }),
        };
        const { RunSync } = loadSync(client);
        const sync = new RunSync(client, { wait: async ms => waits.push(ms) });
        sync.enqueuePrompt('Alice', { version: 1, text: 'A', fromWave: 1 });
        await sync.whenIdle();
        assert.strictEqual(attempts, 4);
        assert.deepStrictEqual(waits, [1000, 2000, 4000]);
    });

    await test('RunSync keeps separate run promises for AI and human under the same nickname', async () => {
        const runs = [];
        const client = {
            ensureRun: async (username, mode = 'ai') => {
                runs.push({ username, mode });
                return `run-${username}-${mode}`;
            },
            recordPromptVersion: async () => ({ ok: true, value: { recorded: true, version: 1, fromWave: 1 } }),
            syncReachedWave: async () => ({ ok: true, value: 1 }),
        };
        const { RunSync } = loadSync(client);
        const sync = new RunSync(client, { wait: async () => {} });
        sync.prepareRun('Alice', 'ai');
        sync.prepareRun('Alice', 'human');
        await sync.whenIdle();
        assert.strictEqual(runs.length, 2);
        assert.deepStrictEqual(runs, [
            { username: 'Alice', mode: 'ai' },
            { username: 'Alice', mode: 'human' },
        ]);
    });
})();
