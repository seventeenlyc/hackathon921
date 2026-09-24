const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadWaveManager(randomValue = 0) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'WavesManager.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    const classes = {
        BossEnemy: class BossEnemy { life = 2000; speed = 2.5; cash = 100; radius = 16; },
        SimpleEnemy: class SimpleEnemy {},
        ArmoredEnemy: class ArmoredEnemy {},
        FastEnemy: class FastEnemy {},
        HealerEnemy: class HealerEnemy {},
    };
    const dependencies = {
        './EnemyManager': { enemyManager: { add() {} } },
        './entities/enemies/BossEnemy': { BossEnemy: classes.BossEnemy },
        './Map': { map: { enemyBases: [], setSpawnCount() {} } },
        './tools/helphers': { rand: () => 0 },
        './InterfaceManager': { interfaceManager: {} },
        './entities/enemies/Enemy': {},
        './entities/terrain/Base': {},
        './entities/enemies/SimpleEnemy': { SimpleEnemy: classes.SimpleEnemy },
        './entities/enemies/ArmoredEnemy': { ArmoredEnemy: classes.ArmoredEnemy },
        './entities/enemies/FastEnemy': { FastEnemy: classes.FastEnemy },
        './entities/enemies/HealerEnemy': { HealerEnemy: classes.HealerEnemy },
        './agent/GameLoop': { gameLoop: { sleep: async () => {}, holdForPlanning: async () => {} } },
        './agent/SpawnRoutes': { spawnCountForWave: () => 1 },
        './tools/enemyScaling': {
            waveLifeRatio: wave => 1 + wave / 10,
            waveSpeedMultiplier: (wave, cap) => Math.min(1 + wave / 30, cap),
            earlyWaveReliefFactor: (wave, alwaysApply) => alwaysApply
                ? (wave <= 200 ? 0.52 : 0.4)
                : (wave <= 200 ? 0.52 : 1),
        },
    };
    const math = Object.create(Math);
    math.random = () => randomValue;
    new Function('module', 'exports', 'require', 'Math', js)(
        moduleObj,
        moduleObj.exports,
        name => {
            if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
            return dependencies[name];
        },
        math,
    );
    return { waveManager: moduleObj.exports.waveManager, classes };
}

{
    const { waveManager } = loadWaveManager();
    class StatsEnemy { life = 100; speed = 10; }

    waveManager.waveCounter = 200;
    const beforeBoundary = waveManager.enemyFactory(StatsEnemy, { life: 2, speed: 1.5 }, {});
    assert.equal(beforeBoundary.life, 104, 'wave 200 life uses the 30% boosted relief factor after normal wave scaling');
    assert.ok(Math.abs(beforeBoundary.speed - 7.8) < 1e-9, 'wave 200 speed uses the 30% boosted relief factor after normal wave scaling');

    waveManager.waveCounter = 201;
    const atBoundary = waveManager.enemyFactory(StatsEnemy, { life: 2.1, speed: 1.7 }, {});
    assert.equal(atBoundary.life, 210, 'wave 201 does not receive an extra stat bonus');
    assert.equal(atBoundary.speed, 17, 'wave 201 does not receive an extra stat bonus');
}

{
    const { waveManager, classes } = loadWaveManager();
    waveManager.waveCounter = 200;
    const wave200 = waveManager.generateWave();
    assert.equal(wave200.length, 1);
    assert.equal(wave200[0].enemyClass, classes.BossEnemy);
    assert.equal(wave200[0].quantity, 20, 'wave 200 keeps its existing boss-wave quantity');
    const wave200Boss = waveManager.enemyFactory(wave200[0].enemyClass, wave200[0].enemySpecsMultiplier, {});
    assert.equal(wave200Boss.life, 21840, 'wave 200 boss life includes the 30% boost');
    assert.ok(Math.abs(wave200Boss.speed - 1.3) < 1e-9, 'wave 200 boss speed includes the 30% boost');

    waveManager.waveCounter = 201;
    const wave201 = waveManager.generateWave();
    assert.equal(wave201.length, 1, 'wave 201 contains no ordinary or support enemies');
    assert.equal(wave201[0].enemyClass, classes.BossEnemy, 'wave 201 uses bosses as elite enemies');
    assert.equal(wave201[0].quantity, 152 / 10, 'wave 201 keeps the wave 152 boss quantity');
}

{
    const { waveManager } = loadWaveManager();
    const stats = enemy => ({ life: enemy.life, speed: enemy.speed, cash: enemy.cash, radius: enemy.radius });

    waveManager.waveCounter = 152;
    const wave152BossGroup = waveManager.generateWave()[0];
    const wave152Boss = waveManager.enemyFactory(wave152BossGroup.enemyClass, wave152BossGroup.enemySpecsMultiplier, {});
    const boostedWave152Stats = { life: 16848, speed: 1.3, cash: 100, radius: 16 };
    const originalWave152Stats = { life: 12960, speed: 1, cash: 100, radius: 16 };
    assert.deepEqual(stats(wave152Boss), boostedWave152Stats, 'wave 152 boss stats receive the 30% boost');

    for (const wave of [201, 202, 300]) {
        waveManager.waveCounter = wave;
        const bossGroup = waveManager.generateWave()[0];
        const boss = waveManager.enemyFactory(bossGroup.enemyClass, bossGroup.enemySpecsMultiplier, {});
        assert.deepEqual(stats(boss), originalWave152Stats, `wave ${wave} bosses keep the original wave-152 attributes`);
        assert.equal(bossGroup.quantity, wave152BossGroup.quantity, `wave ${wave} boss quantity matches wave 152`);
    }
}

console.log('PASS: enemy wave balance');
