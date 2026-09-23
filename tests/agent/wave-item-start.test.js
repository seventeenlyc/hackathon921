const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadWaveManager(dependencies) {
    const source = fs.readFileSync(path.join(__dirname, '../../src/WavesManager.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
    }).outputText;
    const moduleObj = {exports: {}};
    new Function('module', 'exports', 'require', js)(moduleObj, moduleObj.exports, name => {
        if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
        return dependencies[name];
    });
    return moduleObj.exports.waveManager;
}

async function main() {
    const order = [];
    let waveManager;
    class Enemy {
        constructor(base) {
            this.base = base;
            this.life = 100;
            this.speed = 1;
        }
    }

    waveManager = loadWaveManager({
        './EnemyManager': {enemyManager: {add: enemy => order.push(`spawn:${enemy.base.name}`)}},
        './entities/enemies/BossEnemy': {BossEnemy: Enemy},
        './Map': {map: {
            enemyBases: [{name: 'north'}, {name: 'south'}],
            setSpawnCount() {},
        }},
        './tools/helphers': {rand: () => 0},
        './agent/SpawnRoutes': {spawnCountForWave: () => 1},
        './agent/GameLoop': {gameLoop: {
            holdForPlanning: async planner => {
                order.push('planning');
                await planner.plan();
            },
            sleep: async () => {
                order.push('sleep');
                waveManager.looping = false;
            },
        }},
        './InterfaceManager': {interfaceManager: {}},
        './entities/enemies/Enemy': {Enemy},
        './entities/terrain/Base': {Base: class {}},
        './entities/enemies/SimpleEnemy': {SimpleEnemy: Enemy},
        './entities/enemies/ArmoredEnemy': {ArmoredEnemy: Enemy},
        './entities/enemies/FastEnemy': {FastEnemy: Enemy},
        './entities/enemies/HealerEnemy': {HealerEnemy: Enemy},
    });

    waveManager.waveCounter = 1;
    waveManager.setPlanner({plan: async () => { order.push('plan'); }});
    waveManager.onWaveStarted = wave => order.push(`started:${wave}`);
    await waveManager.start();

    assert.deepStrictEqual(order.slice(0, 5), [
        'planning',
        'plan',
        'spawn:north',
        'spawn:south',
        'started:1',
    ], 'the item activation hook runs once after the first enemy batch exists');
    assert.strictEqual(order.filter(item => item === 'started:1').length, 1);
    console.log('Wave item start timing passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
