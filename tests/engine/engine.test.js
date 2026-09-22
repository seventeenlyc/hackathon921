const assert = require('assert');
const {GameEngine} = require('../../.test-build/engine/GameEngine.js');
const {GameActions} = require('../../.test-build/agent/GameActions.js');
const {EngineBattlefield} = require('../../.test-build/engine/EngineBattlefield.js');
const {Rock} = require('../../.test-build/engine/entities/Rock.js');
const {Tower} = require('../../.test-build/engine/entities/Tower.js');

/**
 * Headless engine tests. They run in a plain Node process with no DOM, which is
 * the Phase A acceptance criterion: the simulation must be runnable and
 * replayable without a browser, and two runs must not interfere.
 */

function flush() {
    return new Promise(resolve => setImmediate(resolve));
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

function digest(engine) {
    return JSON.stringify({
        tick: engine.currentTick,
        wave: engine.wave,
        cash: engine.cash.getBalance(),
        baseLife: engine.map.homeBase.getLife(),
        enemies: engine.enemies.all()
            .map(e => [e.kind, round(e.x), round(e.y), e.life, e.damageTaken])
            .sort(),
        towers: countTowers(engine),
        rocks: countRocks(engine),
    });
}

function countTowers(engine) {
    let count = 0;
    for (const row of engine.map.grid) {
        for (const cell of row) if (cell instanceof Tower) count += 1;
    }
    return count;
}

function countRocks(engine) {
    let count = 0;
    for (const row of engine.map.grid) {
        for (const cell of row) if (cell instanceof Rock) count += 1;
    }
    return count;
}

/** First cell the engine itself reports as buildable; deterministic per seed. */
function firstLegalCell(engine) {
    const battlefield = new EngineBattlefield(engine);
    for (let i = 0; i < engine.map.grid.length; ++i) {
        for (let j = 0; j < engine.map.grid[i].length; ++j) {
            if (engine.map.grid[i][j] === 0 && battlefield.canPlaceAt(i, j).ok) return {i, j};
        }
    }
    throw new Error('no legal build cell');
}

/**
 * Drive exactly `ticks` effective simulation steps.
 *
 * `tick()` is a no-op while a PLANNING window is open, so the harness resolves
 * any planner after every step. That keeps the number of effective ticks
 * identical across engines, which is what makes the determinism assertions
 * meaningful rather than timing-dependent.
 */
async function run(engine, ticks) {
    let advanced = 0;
    let guard = 0;
    while (advanced < ticks && guard < ticks * 4 + 100) {
        const before = engine.currentTick;
        engine.tick();
        if (engine.currentTick > before) advanced += 1;
        await flush();
        guard += 1;
    }
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
    console.log('GameEngine');

    await test('an engine runs headless and starts idle', async () => {
        const engine = new GameEngine({seed: 1, difficulty: 2});
        assert.strictEqual(engine.isIdle(), true);
        assert.strictEqual(engine.isStepping(), false);
        assert.strictEqual(engine.currentTick, 0);
        // Ticking before start must do nothing.
        engine.tick();
        assert.strictEqual(engine.currentTick, 0);
    });

    await test('same seed + same ticks produce an identical battle', async () => {
        const a = new GameEngine({seed: 424242, difficulty: 2});
        const b = new GameEngine({seed: 424242, difficulty: 2});
        a.start();
        b.start();
        await run(a, 600);
        await run(b, 600);
        assert.strictEqual(digest(a), digest(b));
    });

    await test('same seed + same actions produce an identical battle', async () => {
        const build = engine => {
            const actions = new GameActions(new EngineBattlefield(engine));
            const cell = firstLegalCell(engine);
            return actions.buildTower('canon', cell.i, cell.j);
        };

        const a = new GameEngine({seed: 9090, difficulty: 2});
        const b = new GameEngine({seed: 9090, difficulty: 2});
        a.start();
        b.start();
        await run(a, 40);
        await run(b, 40);
        assert.strictEqual(build(a).ok, true);
        assert.strictEqual(build(b).ok, true);
        await run(a, 400);
        await run(b, 400);
        assert.strictEqual(digest(a), digest(b));
    });

    await test('different seeds produce different battles', async () => {
        const a = new GameEngine({seed: 1, difficulty: 2});
        const b = new GameEngine({seed: 2, difficulty: 2});
        assert.notStrictEqual(digest(a), digest(b), 'different seeds must scatter rocks differently');
    });

    await test('two engines do not share state', async () => {
        const a = new GameEngine({seed: 777, difficulty: 2});
        const b = new GameEngine({seed: 777, difficulty: 2});
        const beforeB = digest(b);

        // Mutate A only: spend cash and add a tower.
        const actions = new GameActions(new EngineBattlefield(a));
        const cell = firstLegalCell(a);
        assert.strictEqual(actions.buildTower('canon', cell.i, cell.j).ok, true);
        a.start();
        await run(a, 120);

        assert.strictEqual(digest(b), beforeB, 'B must be untouched by A');
        assert.strictEqual(b.cash.getBalance(), 200);
    });

    await test('pause freezes the simulation, resume continues it', async () => {
        const engine = new GameEngine({seed: 5, difficulty: 1});
        engine.start();
        await run(engine, 30);
        const paused = digest(engine);

        engine.pause();
        engine.tick();
        engine.tick();
        assert.strictEqual(digest(engine), paused, 'paused ticks must not advance');

        engine.resume();
        engine.tick();
        assert.notStrictEqual(digest(engine), paused);
    });

    await test('speed is a host multiplier; one tick is always one step', async () => {
        const engine = new GameEngine({seed: 6, difficulty: 1});
        engine.setSpeed(8);
        assert.strictEqual(engine.speed, 8);
        engine.start();
        await flush(); // let wave-1 planning resolve so the next tick is a real step
        engine.tick();
        assert.strictEqual(engine.currentTick, 1, 'a single tick is one base step regardless of speed');
    });

    await test('waves spawn on the simulation clock and advance the counter', async () => {
        const engine = new GameEngine({seed: 31, difficulty: 2});
        const reached = [];
        engine.onWaveReached(wave => reached.push(wave));
        engine.start();
        await run(engine, 500);

        assert.ok(engine.enemies.all().length > 0, 'wave 1 must have spawned enemies');
        assert.ok(reached.indexOf(1) !== -1, 'wave 1 must report as reached');
        assert.ok(engine.wave >= 2, 'the wave counter must advance after wave 1 spawns out');
    });

    await test('human mode waits a fixed pause between waves', async () => {
        const fast = new GameEngine({seed: 41, difficulty: 1, interWaveDelayMs: 0});
        const slow = new GameEngine({seed: 41, difficulty: 1, interWaveDelayMs: 7000});
        let fastReached = 0;
        let slowReached = 0;
        fast.onWaveReached(() => {
            fastReached += 1;
        });
        slow.onWaveReached(() => {
            slowReached += 1;
        });
        fast.start();
        slow.start();
        await run(fast, 260);
        await run(slow, 260);

        assert.ok(slowReached <= fastReached, 'the inter-wave pause must not speed waves up');
    });

    await test('losing the base ends the run and freezes it', async () => {
        const engine = new GameEngine({seed: 8, difficulty: 1});
        for (let i = 0; i < 15; ++i) engine.map.homeBase.handleDamage();

        assert.strictEqual(engine.isOver, true);
        assert.strictEqual(engine.isStepping(), false);
        const frozen = engine.currentTick;
        engine.tick();
        assert.strictEqual(engine.currentTick, frozen);
    });

    await test('building a tower recomputes the paths of enemies in flight', async () => {
        const engine = new GameEngine({seed: 12, difficulty: 2});
        engine.start();
        await run(engine, 60);

        const enemies = engine.enemies.all();
        assert.ok(enemies.length > 0);
        let recomputes = 0;
        for (const enemy of enemies) {
            const original = enemy.updatePath.bind(enemy);
            enemy.updatePath = () => {
                recomputes += 1;
                original();
            };
        }

        const actions = new GameActions(new EngineBattlefield(engine));
        const cell = firstLegalCell(engine);
        const result = actions.buildTower('canon', cell.i, cell.j);
        assert.strictEqual(result.ok, true, result.message);
        assert.ok(recomputes >= enemies.length, 'every in-flight enemy must re-route after a build');
    });

    await test('changing the lane count recomputes enemy paths', async () => {
        const engine = new GameEngine({seed: 13, difficulty: 1});
        engine.start();
        await run(engine, 60);

        const enemies = engine.enemies.all();
        let recomputes = 0;
        for (const enemy of enemies) {
            const original = enemy.updatePath.bind(enemy);
            enemy.updatePath = () => {
                recomputes += 1;
                original();
            };
        }

        // Applied at the wave boundary; call through the engine's public surface.
        engine.requestSpawnCount(3);
        engine.spawnSettings.applyPending();
        assert.ok(recomputes >= enemies.length, 'a lane change must re-route in-flight enemies');
        assert.strictEqual(engine.map.enemyBases.length, 3);
    });

    await test('the planner runs before every wave, including wave 1', async () => {
        const engine = new GameEngine({seed: 77, difficulty: 1});
        const planned = [];
        engine.setPlanner({plan: async () => { planned.push(engine.wave); }});
        engine.start();
        await run(engine, 300);

        assert.ok(planned.length >= 2, 'the planner must run once per wave');
        assert.strictEqual(planned[0], 1, 'wave 1 must be planned before it spawns');
        assert.strictEqual(planned[1], 2);
    });

    await test('human mode reports a descending inter-wave countdown', async () => {
        const engine = new GameEngine({seed: 78, difficulty: 1, interWaveDelayMs: 7000});
        const seconds = [];
        engine.onCountdown(value => seconds.push(value));
        engine.start();
        await run(engine, 800);

        assert.ok(seconds.length > 0, 'the countdown must be reported');
        assert.strictEqual(seconds[0], 7);
        assert.ok(seconds[seconds.length - 1] < 7, 'the countdown must descend');
    });

    await test('a finished run reports no further waves', async () => {
        const engine = new GameEngine({seed: 79, difficulty: 1});
        const reached = [];
        engine.onWaveReached(wave => reached.push(wave));
        for (let i = 0; i < 15; ++i) engine.map.homeBase.handleDamage();
        assert.strictEqual(engine.isOver, true);

        const before = reached.length;
        engine.tick();
        engine.tick();
        assert.strictEqual(reached.length, before);
    });

    await test('freezing discards the plan in flight; unfreeze re-runs it', async () => {
        const engine = new GameEngine({seed: 55, difficulty: 1});
        let resolvePlan = null;
        let planCount = 0;
        engine.setPlanner({plan: () => {
            planCount += 1;
            return new Promise(resolve => {
                resolvePlan = resolve;
            });
        }});

        const reached = [];
        engine.onWaveReached(wave => reached.push(wave));
        engine.start();
        await flush();
        assert.strictEqual(planCount, 1, 'planning must be waiting on the planner');

        engine.freeze();
        assert.strictEqual(engine.state, 'paused');
        const frozenTick = engine.currentTick;
        engine.tick();
        assert.strictEqual(engine.currentTick, frozenTick, 'a frozen engine must not advance');

        resolvePlan();
        await flush();
        engine.tick();
        engine.tick();
        assert.deepStrictEqual(reached, [], 'a late plan must not open a wave');

        engine.unfreeze();
        await flush();
        assert.strictEqual(planCount, 2, 'unfreeze re-runs the cancelled planning round');
    });

    console.log('All GameEngine tests passed.');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
