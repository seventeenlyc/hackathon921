const assert = require('assert');
const {GameEngine} = require('../../.test-build/engine/GameEngine.js');
const {GameActions} = require('../../.test-build/agent/GameActions.js');
const {EngineBattlefield} = require('../../.test-build/engine/EngineBattlefield.js');

/**
 * The render snapshot is the payload the frontend draws from (phase C). It must
 * be plain, JSON-serialisable data with stable entity ids, and it must be
 * deterministic so a run replays identically.
 */

function flush() {
    return new Promise(resolve => setImmediate(resolve));
}

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

(async function main() {
    console.log('RenderSnapshot');

    const engine = new GameEngine({seed: 31, difficulty: 2});
    engine.start();
    await run(engine, 120);
    const snap = engine.renderSnapshot();

    assert.strictEqual(snap.grid.width, 61);
    assert.strictEqual(snap.grid.height, 31);
    assert.strictEqual(snap.grid.tileSize, 40);
    assert.strictEqual(snap.cash, 200);
    assert.ok(snap.bases.some(b => b.isHome), 'the home base must be present');
    assert.strictEqual(snap.spawns.length, 2);
    assert.ok(snap.rocks.length > 0, 'rocks must be present');
    assert.ok(snap.enemies.length > 0, 'enemies must be on the field');
    assert.strictEqual(snap.state, engine.state);
    assert.strictEqual(snap.tick, engine.currentTick);

    const ids = snap.enemies.map(e => e.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'enemy ids must be unique');
    for (const enemy of snap.enemies) {
        assert.ok(Number.isInteger(enemy.id) && enemy.id > 0, 'enemy id must be a positive integer');
        assert.ok(typeof enemy.x === 'number' && typeof enemy.y === 'number');
        assert.ok(enemy.life > 0);
        assert.ok(typeof enemy.kind === 'string');
    }

    assert.deepStrictEqual(JSON.parse(JSON.stringify(snap)), snap, 'the frame must be JSON round-trippable');

    // Determinism: same seed + same tick count => identical frames.
    const twin = new GameEngine({seed: 31, difficulty: 2});
    twin.start();
    await run(twin, 120);
    assert.strictEqual(JSON.stringify(twin.renderSnapshot()), JSON.stringify(engine.renderSnapshot()));

    // A built tower appears, and a firing tower produces munitions with a kind.
    const combat = new GameEngine({seed: 9090, difficulty: 2});
    combat.start();
    await run(combat, 70);
    const battlefield = new EngineBattlefield(combat);
    const actions = new GameActions(battlefield);
    const candidates = actions.getState().buildCandidates;
    assert.ok(candidates.length > 0, 'the engine must offer build candidates once enemies are moving');
    // Pick the cell closest to a spawn so enemies reach it early in the run; the
    // list is ranked base-first and enemies need hundreds of ticks to cross.
    const candidate = candidates.slice().sort((a, b) => b.distanceToBase - a.distanceToBase)[0];
    assert.strictEqual(actions.buildTower('canon', candidate.i, candidate.j).ok, true);

    let munition = null;
    for (let attempt = 0; attempt < 250 && !munition; attempt += 1) {
        await run(combat, 1);
        const frame = combat.renderSnapshot();
        if (frame.munitions.length > 0) munition = frame.munitions[0];
    }

    const frame = combat.renderSnapshot();
    const tower = frame.towers.find(t => t.id === candidate.i + ':' + candidate.j);
    assert.ok(tower, 'the built tower must appear in the frame');
    assert.strictEqual(tower.type, 'canon');
    assert.strictEqual(tower.level, 1);
    assert.ok(typeof tower.angle === 'number');

    assert.ok(munition, 'a firing tower must produce at least one munition frame');
    assert.ok(['bullet', 'sniper', 'laser'].includes(munition.kind));
    assert.ok(Number.isInteger(munition.id) && munition.id > 0);
    assert.ok(typeof munition.emitterX === 'number' && typeof munition.targetX === 'number');

    console.log('All RenderSnapshot tests passed.');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
