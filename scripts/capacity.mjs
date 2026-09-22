// 容量实测（阶段 E）：单进程能同时推进多少托管对局。
//
// 计划 §7 要求容量测试包含 8 倍速、多路线、高波次与同时 AI 思考，并「由测量决定
// 是否采用 Worker 池，首版不预设分布式」。本脚本据此测原始模拟吞吐，并可注入 AI
// 思考延迟来观察「引擎在 PLANNING 期间冻结」对吞吐的影响。
//
// 为了让对局持续（而不是几波就基地失守、测量提前结束），每个对局给足金币并由
// planner 每波建塔/升级——这更接近真实负载：有敌人、有交火、有塔。
//
// 用法：node scripts/capacity.mjs [games] [difficulty] [speed] [seconds] [aiDelayMs]
// 结果只代表本机，用于给出数量级与瓶颈，不是生产容量承诺。

import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const enginePath = relative => require(path.join(root, 'server-dist/src/engine', relative));
const {GameEngine} = enginePath('GameEngine.js');
const {EngineBattlefield} = enginePath('EngineBattlefield.js');
const {GameActions} = require(path.join(root, 'server-dist/src/agent/GameActions.js'));

const games = Number(process.argv[2] || 8);
const difficulty = Number(process.argv[3] || 4);
const speed = Number(process.argv[4] || 8);
const seconds = Number(process.argv[5] || 5);
const aiDelayMs = Number(process.argv[6] || 0);
/** NO_SNAPSHOT=1 skips the AI observation, isolating raw simulation cost. */
const useSnapshot = process.env.NO_SNAPSHOT !== '1';

const heapBefore = process.memoryUsage().heapUsed;
const constructStart = Date.now();
const engines = [];
const snapshotStats = {count: 0, ms: 0, enemies: 0};

for (let i = 0; i < games; i += 1) {
    const engine = new GameEngine({seed: 1000 + i, difficulty, interWaveDelayMs: 0, initialCash: 1_000_000});
    // Benchmark only: keep the run alive so the measurement is steady-state CPU,
    // not "how fast does an undefended base fall".
    engine.map.homeBase.handleDamage = () => {};
    const actions = new GameActions(new EngineBattlefield(engine));

    engine.setPlanner({plan: async () => {
        if (aiDelayMs > 0) await new Promise(resolve => setTimeout(resolve, aiDelayMs));
        if (!useSnapshot) return;
        const before = Date.now();
        const state = actions.getState();
        snapshotStats.count += 1;
        snapshotStats.ms += Date.now() - before;
        snapshotStats.enemies += engine.enemies.all().length;
        const candidate = state.buildCandidates[0];
        if (candidate) actions.buildTower('canon', candidate.i, candidate.j);
        else if (state.towers[0]) actions.upgradeTower(state.towers[0].id);
    }});

    engine.start();
    engines.push(engine);
}
const constructMs = Date.now() - constructStart;
const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);

const flush = () => new Promise(resolve => setImmediate(resolve));
await flush();

const startedAt = Date.now();
while (Date.now() - startedAt < seconds * 1000) {
    for (const engine of engines) {
        for (let step = 0; step < speed; step += 1) {
            engine.tick();
        }
    }
    await flush();
}
const elapsedMs = Date.now() - startedAt;

const ticks = engines.reduce((sum, engine) => sum + engine.currentTick, 0);
const waves = engines.reduce((sum, engine) => sum + engine.wave, 0);
const enemies = engines.reduce((sum, engine) => sum + engine.enemies.all().length, 0);

console.log(JSON.stringify({
    games, difficulty, speed, aiDelayMs, useSnapshot,
    constructMs,
    heapDeltaMb: Number(heapDeltaMb.toFixed(1)),
    heapKbPerGame: Math.round((heapDeltaMb * 1024) / games),
    elapsedMs,
    ticks,
    ticksPerSecond: Math.round((ticks / elapsedMs) * 1000),
    ticksPerSecondPerGame: Math.round((ticks / elapsedMs) * 1000 / games),
    // 8 倍速实时推进需要 8 * 30 = 240 tick/秒/局；低于它就说明该并发下跑不满 8x。
    realtimeBudgetPerGame: speed * 30,
    avgWave: Number((waves / games).toFixed(1)),
    liveEnemies: enemies,
    over: engines.filter(engine => engine.isOver).length,
    // One AI observation (`getState`) per wave; its A* probes are the usual bottleneck.
    snapshots: snapshotStats.count,
    snapshotMsAvg: snapshotStats.count ? Number((snapshotStats.ms / snapshotStats.count).toFixed(1)) : 0,
    snapshotEnemiesAvg: snapshotStats.count ? Number((snapshotStats.enemies / snapshotStats.count).toFixed(1)) : 0,
}, null, 2));
