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
    await test('reaching each wave notifies the game, including wave one', async () => {
        const reached = [];
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
            if (wave === 3) waveManager.looping = false;
        };
        await waveManager.start();
        assert.deepStrictEqual(reached, [1, 2, 3]);
        assert.strictEqual(displayedWave, 3);
    });

    await test('a stopped run does not report the next wave after its delay', async () => {
        const reached = [];
        let waveManager;
        waveManager = loadSource('WavesManager.ts', {
            './EnemyManager': { enemyManager: { add() {} } },
            './entities/enemies/BossEnemy': { BossEnemy: class {} },
            './Map': { map: { enemyBases: [] } },
            './tools/helphers': { rand: () => 0 },
            './agent/GameLoop': { gameLoop: {
                sleep: async () => {},
                holdForPlanning: async () => { waveManager.looping = false; },
            } },
            './InterfaceManager': { interfaceManager: { setWave() {}, setWaveDelay() {}, clearWaveDelay() {} } },
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
        assert.strictEqual(waveManager.waveCounter, 1);
    });

    await test('the current player score is submitted at each reached wave and after username entry', () => {
        const submissions = [];
        let username = 'Alice';
        const waveManager = { waveCounter: 1, looping: true, start() { this.onWaveReached(this.waveCounter); } };
        const game = loadSource('Game.ts', {
            './Canvas': { canvas: {}, ctx: {} },
            './config.json': { fps: 60 },
            './Controls': { controls: { on() {}, tabHasFocus: () => true } },
            './Map': { map: { on() {} } },
            './Camera': { camera: {} },
            './EnemyManager': { enemyManager: {} },
            './MunitionManager': { munitionManager: {} },
            './TowerPlacer': { towerPlacer: {} },
            './InterfaceManager': { interfaceManager: { showGameOver() {} } },
            './WavesManager': { waveManager },
            './leaderboard/LeaderboardUI': { submitRunScore: (name, wave) => submissions.push([name, wave]) },
            './leaderboard/LeaderboardStore': { readUsernameCookie: () => username },
            './agent/GameLoop': { gameLoop: { setFocused() {} } },
            './agent/GameActions': { GameActions: class {} },
            './agent/InertBattlefield': { InertBattlefield: class {} },
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
        assert.deepStrictEqual(submissions, [['Alice', 1], ['Alice', 2], ['Bob', 3]]);
    });
})();
