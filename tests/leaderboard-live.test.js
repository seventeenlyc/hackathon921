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

async function test(name, fn) {
    try { await fn(); console.log('PASS: ' + name); }
    catch (error) { console.error('FAIL: ' + name, error); process.exitCode = 1; }
}

(async () => {
    await test('plans before every wave, so the AI acts from wave one', async () => {
        const reached = [];
        const order = [];
        let displayedWave = 1;
        let waveManager;
        let delays = 0;
        waveManager = loadSource('WavesManager.ts', {
            './EnemyManager': { enemyManager: { add() {} } },
            './entities/enemies/BossEnemy': { BossEnemy: class {} },
            './Map': { map: { enemyBases: [] } },
            './tools/helphers': { rand: () => 0 },
            './agent/GameLoop': { gameLoop: {
                sleep: async () => {},
                holdForPlanning: async () => {
                    order.push('plan');
                    if (++delays > 3) waveManager.looping = false;
                },
            } },
            './InterfaceManager': { interfaceManager: {
                setWave(wave) { displayedWave = wave; },
                setWaveDelay() {},
                clearWaveDelay() {},
            } },
            './entities/enemies/Enemy': {},
            './entities/terrain/Base': {},
            './entities/enemies/SimpleEnemy': { SimpleEnemy: class {} },
            './entities/enemies/ArmoredEnemy': { ArmoredEnemy: class {} },
            './entities/enemies/FastEnemy': { FastEnemy: class {} },
            './entities/enemies/HealerEnemy': { HealerEnemy: class {} },
        }).waveManager;
        waveManager.onWaveReached = wave => {
            reached.push(wave);
            order.push('wave' + wave);
            if (wave === 3) waveManager.looping = false;
        };
        await waveManager.start();
        assert.deepStrictEqual(reached, [1, 2, 3]);
        // Each wave is planned before it is spawned — including wave 1.
        assert.deepStrictEqual(order, ['plan', 'wave1', 'plan', 'wave2', 'plan', 'wave3']);
        assert.strictEqual(displayedWave, 3);
    });

    await test('a stopped run does not report the next wave after its delay', async () => {
        const reached = [];
        let displayedWave = 1;
        let waveManager;
        let plans = 0;
        waveManager = loadSource('WavesManager.ts', {
            './EnemyManager': { enemyManager: { add() {} } },
            './entities/enemies/BossEnemy': { BossEnemy: class {} },
            './Map': { map: { enemyBases: [] } },
            './tools/helphers': { rand: () => 0 },
            './agent/GameLoop': { gameLoop: {
                sleep: async () => {},
                // Stop the run during the planning window that precedes wave 2.
                holdForPlanning: async () => { if (++plans > 1) waveManager.looping = false; },
            } },
            './InterfaceManager': { interfaceManager: {
                setWave(wave) { displayedWave = wave; },
                setWaveDelay() {},
                clearWaveDelay() {},
            } },
            './entities/enemies/Enemy': {},
            './entities/terrain/Base': {},
            './entities/enemies/SimpleEnemy': { SimpleEnemy: class {} },
            './entities/enemies/ArmoredEnemy': { ArmoredEnemy: class {} },
            './entities/enemies/FastEnemy': { FastEnemy: class {} },
            './entities/enemies/HealerEnemy': { HealerEnemy: class {} },
        }).waveManager;
        waveManager.onWaveReached = wave => reached.push(wave);
        await waveManager.start();
        assert.deepStrictEqual(reached, [1]);
        // Wave 1 was spawned before the stop, so the counter already points at 2;
        // the point is that wave 2 itself is never reported as reached.
        assert.strictEqual(waveManager.waveCounter, 2);
        assert.strictEqual(displayedWave, 2);
    });

    await test('the current player score is submitted at each reached wave and after username entry', () => {
        const submissions = [];
        let username = 'Alice';
        const waveManager = { waveCounter: 1, looping: true, setPlanner() {}, start() { this.onWaveReached(this.waveCounter); } };
        const game = loadSource('Game.ts', {
            './Canvas': { canvas: {}, ctx: {} },
            './config.json': { fps: 60 },
            './Controls': { controls: { on() {}, tabHasFocus: () => true } },
            './Map': { map: { on() {} } },
            './Camera': { camera: {} },
            './EnemyManager': { enemyManager: {} },
            './MunitionManager': { munitionManager: {} },
            './InterfaceManager': { interfaceManager: { showGameOver() {} } },
            './WavesManager': { waveManager },
            './leaderboard/LeaderboardUI': { submitRunScore: (name, wave) => submissions.push([name, wave]) },
            './leaderboard/LeaderboardStore': { readUsernameCookie: () => username },
            './leaderboard/LeaderboardClient': { getSessionToken: () => null },
            './agent/GameLoop': { gameLoop: { setFocused() {}, onChange() {} } },
            './agent/GameActions': { GameActions: class {} },
            './agent/InertBattlefield': { InertBattlefield: class {} },
            './agent/AgentRuntime': { AgentRuntime: class {} },
            './agent/snapshot': { formatSnapshot: () => '' },
            './agent/StrategyStore': { strategyStore: { lock() {} } },
            './StrategyQueue': { queueStrategy: () => ({}), startRun: () => {} },
            './DecisionLog': { decisionLog: { add() {}, error() {} } },
        }, {
            window: {},
            setInterval: () => 1,
            requestAnimationFrame: () => 1,
            setTimeout: fn => fn(),
            clearInterval() {},
        }).game;
        waveManager.waveCounter = 2;
        waveManager.onWaveReached(2);
        username = null;
        waveManager.waveCounter = 3;
        waveManager.onWaveReached(3);
        username = 'Bob';
        game.recordReachedWave();
        // No automatic wave 1 anymore: the run opens in IDLE, so the first entry is
        // wave 2. Wave 3 is skipped while no username is set, then Bob's manual
        // recordReachedWave() picks the current counter back up.
        assert.deepStrictEqual(submissions, [['Alice', 2], ['Bob', 3]]);
    });
})();
