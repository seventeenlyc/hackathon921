// 开发模式控制器与 StrategyQueue 集成测试（无 DOM、无网络）。
// 通过 transpile + 注入依赖的方式，验证：
//   1. DevController 状态机、密码映射、数值校验；
//   2. 解锁后 startRun 跳过 RunSync 并把起始波次/资源应用到引擎；
//   3. 未解锁时 startRun 仍走计榜路径（回归保护）。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadSource(file, dependencies, globals = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    const names = ['module', 'exports', 'require', ...Object.keys(globals)];
    const values = [moduleObj, moduleObj.exports, name => {
        if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
        return dependencies[name];
    }, ...Object.values(globals)];
    new Function(...names, js)(...values);
    return moduleObj.exports;
}

function test(name, fn) {
    const p = fn();
    if (p && typeof p.then === 'function') {
        return p.then(
            () => console.log('PASS: ' + name),
            error => { console.error('FAIL: ' + name, error); process.exitCode = 1; },
        );
    }
    console.log('PASS: ' + name);
    return undefined;
}

function makeTransport(responses) {
    const calls = [];
    return {
        calls,
        async post(path, body, token) {
            calls.push({ path, body, token });
            const key = path;
            const r = responses[key] || { ok: false, status: 500, body: { error: 'UNKNOWN' } };
            return r;
        },
    };
}

(async () => {
    await test('DevController 默认锁定，配置为默认值', () => {
        const { DevController } = loadSource('dev/DevController.ts', {});
        const c = new DevController(() => 'tok', { transport: makeTransport({}), defaultStartCash: 200 });
        assert.equal(c.isUnlocked, false);
        assert.equal(c.state, 'locked');
        assert.deepStrictEqual(c.getConfig(), { startWave: 1, startCash: 200 });
    });

    await test('unlock 成功后切为 unlocked，重复调用幂等', async () => {
        const transport = makeTransport({ '/dev/unlock': { ok: true, status: 200, body: { enabled: true } } });
        const { DevController } = loadSource('dev/DevController.ts', {});
        const c = new DevController(() => 'tok', { transport, defaultStartCash: 200 });
        let changed = 0;
        c.onChange(() => { changed += 1; });
        const r1 = await c.unlock('section9-placeholder');
        assert.deepStrictEqual(r1, { ok: true });
        assert.equal(c.isUnlocked, true);
        assert.equal(changed, 1);
        const r2 = await c.unlock('again');
        assert.deepStrictEqual(r2, { ok: true });
        assert.equal(changed, 1, '重复解锁不重复通知');
        assert.equal(transport.calls.length, 1, '已解锁不再发请求');
        assert.equal(transport.calls[0].token, 'tok');
    });

    await test('unlock 服务端各错误码映射到 reason', async () => {
        const cases = [
            { status: 503, body: { error: 'DEV_MODE_UNAVAILABLE' }, reason: 'DEV_MODE_UNAVAILABLE' },
            { status: 401, body: { error: 'INVALID_SESSION' }, reason: 'INVALID_SESSION' },
            { status: 401, body: { error: 'INVALID_PASSWORD' }, reason: 'INVALID_PASSWORD' },
            { status: 409, body: { error: 'RUN_ALREADY_STARTED' }, reason: 'RUN_ALREADY_STARTED' },
            { status: 0, body: null, reason: 'NETWORK_ERROR' },
            { status: 500, body: { error: 'WEIRD' }, reason: 'UNKNOWN' },
        ];
        for (const c of cases) {
            const transport = makeTransport({ '/dev/unlock': { ok: false, status: c.status, body: c.body } });
            const { DevController } = loadSource('dev/DevController.ts', {});
            const ctrl = new DevController(() => 'tok', { transport, defaultStartCash: 200 });
            const r = await ctrl.unlock('x');
            assert.equal(r.ok, false);
            assert.equal(r.reason, c.reason, JSON.stringify(c));
            assert.equal(ctrl.isUnlocked, false);
        }
    });

    await test('无会话 token 时 unlock 拒绝；空密码拒绝', async () => {
        const transport = makeTransport({});
        const { DevController } = loadSource('dev/DevController.ts', {});
        const c = new DevController(() => null, { transport, defaultStartCash: 200 });
        const r = await c.unlock('x');
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'NO_SESSION');
        assert.equal(transport.calls.length, 0);
        const c2 = new DevController(() => 'tok', { transport, defaultStartCash: 200 });
        const empty = await c2.unlock('');
        assert.equal(empty.ok, false);
        assert.equal(empty.reason, 'INVALID_PASSWORD');
    });

    await test('setStartWave / setStartCash 校验整数与范围', () => {
        const { DevController } = loadSource('dev/DevController.ts', {});
        const c = new DevController(() => 'tok', { transport: makeTransport({}), defaultStartCash: 200 });

        assert.equal(c.setStartWave(151).ok, true);
        assert.equal(c.getConfig().startWave, 151);
        assert.equal(c.setStartWave(1.5).ok, false);
        assert.equal(c.setStartWave(0).ok, false);
        assert.equal(c.setStartWave(10000).ok, false);
        assert.equal(c.setStartWave(9999).ok, true);
        assert.equal(c.getConfig().startWave, 9999);

        assert.equal(c.setStartCash(5000).ok, true);
        assert.equal(c.getConfig().startCash, 5000);
        assert.equal(c.setStartCash(-1).ok, false);
        assert.equal(c.setStartCash(1.5).ok, false);
        assert.equal(c.setStartCash(1_000_000_001).ok, false);
        assert.equal(c.setStartCash(1_000_000_000).ok, true);
    });

    await test('解锁后 startRun 跳过 RunSync 并把起始波次/资源写入引擎', () => {
        const events = [];
        const deps = {
            './agent/GameLoop': { gameLoop: { isIdle: () => true, start: () => events.push('game-start') } },
            './agent/StrategyStore': {
                effectiveWave: (wave, isIdle) => isIdle ? Math.max(1, wave) : wave + 1,
                strategyStore: {
                    submit: (text, fromWave) => ({ version: 1, text, fromWave }),
                    activateForRun: () => ({ version: 1, text: 'prompt', fromWave: 151 }),
                },
            },
            './WavesManager': { waveManager: { waveCounter: 1, start: () => events.push('wave-start') } },
            './leaderboard/SessionIdentity': { getSessionUsername: () => 'Alice' },
            './PlayMode': { playMode: 'ai' },
            './leaderboard/RunSync': {
                runSync: {
                    prepareRun: () => events.push('ranked-prepare'),
                    enqueuePrompt: () => events.push('ranked-prompt'),
                },
            },
            './AudioManager': { audioManager: { setWave: w => events.push(['music-wave', w]), startMusic: () => events.push('music-start') } },
            './CashManager': { cashManager: { setBalance: v => events.push(['cash', v]) } },
            './InterfaceManager': { interfaceManager: { setWave: w => events.push(['display-wave', w]) } },
            './dev': {
                devController: {
                    isUnlocked: true,
                    getConfig: () => ({ startWave: 151, startCash: 5000 }),
                    onChange: () => {},
                },
                DEV_MAX_START_WAVE: 9999,
                DEV_MAX_START_CASH: 1_000_000_000,
            },
        };
        const { startRun } = loadSource('StrategyQueue.ts', deps);
        startRun();
        // 引擎拿到开发参数
        assert.ok(events.find(e => Array.isArray(e) && e[0] === 'display-wave' && e[1] === 151), '波次写入引擎显示');
        assert.ok(events.find(e => Array.isArray(e) && e[0] === 'cash' && e[1] === 5000), '战术资源写入引擎');
        assert.ok(events.find(e => Array.isArray(e) && e[0] === 'music-wave' && e[1] === 151), '音频波次随开发波次');
        // 不计榜：没有 ranked-prepare / ranked-prompt
        assert.equal(events.indexOf('ranked-prepare'), -1, '开发对局不创建计榜 run');
        assert.equal(events.indexOf('ranked-prompt'), -1, '开发对局不写 Prompt 链');
        assert.ok(events.indexOf('game-start') !== -1);
        assert.ok(events.indexOf('wave-start') !== -1);
    });

    await test('未解锁时 startRun 仍走计榜路径（回归）', () => {
        const events = [];
        const deps = {
            './agent/GameLoop': { gameLoop: { isIdle: () => true, start: () => events.push('game-start') } },
            './agent/StrategyStore': {
                effectiveWave: (wave, isIdle) => isIdle ? Math.max(1, wave) : wave + 1,
                strategyStore: {
                    submit: (text, fromWave) => ({ version: 1, text, fromWave }),
                    activateForRun: () => ({ version: 1, text: 'prompt', fromWave: 1 }),
                },
            },
            './WavesManager': { waveManager: { waveCounter: 1, start: () => events.push('wave-start') } },
            './leaderboard/SessionIdentity': { getSessionUsername: () => 'Alice' },
            './PlayMode': { playMode: 'ai' },
            './leaderboard/RunSync': {
                runSync: {
                    prepareRun: () => events.push('ranked-prepare'),
                    enqueuePrompt: () => events.push('ranked-prompt'),
                },
            },
            './AudioManager': { audioManager: { setWave: w => events.push(['music-wave', w]), startMusic: () => events.push('music-start') } },
            './CashManager': { cashManager: { setBalance: () => events.push('cash-set') } },
            './InterfaceManager': { interfaceManager: { setWave: () => events.push('display-wave-set') } },
            './dev': {
                devController: { isUnlocked: false, getConfig: () => ({ startWave: 1, startCash: 200 }), onChange: () => {} },
                DEV_MAX_START_WAVE: 9999,
                DEV_MAX_START_CASH: 1_000_000_000,
            },
        };
        const { startRun } = loadSource('StrategyQueue.ts', deps);
        startRun();
        assert.ok(events.indexOf('ranked-prepare') !== -1, '未解锁仍创建计榜 run');
        assert.ok(events.indexOf('ranked-prompt') !== -1, '未解锁仍写 Prompt 链');
        assert.equal(events.indexOf('cash-set'), -1, '未解锁不重置战术资源');
    });
})();
