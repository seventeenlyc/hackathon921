const assert = require('assert');
const {
    TacticalItemsController,
    ITEM_KEYS,
    ITEM_BASE_COST,
    ITEM_BUFF_DURATION_MS,
    ITEM_COOLDOWN_MS,
} = require('../../.test-build/items/TacticalItems.js');
const {GameActions} = require('../../.test-build/agent/GameActions.js');

/**
 * Independent, DOM-free audit of the tactical item core (issue #69).
 *
 * These tests drive the *real* `TacticalItemsController` and the *real*
 * `GameActions` through minimal CashPort / enemy / base doubles. The doubles
 * mirror the live engine semantics rather than replacing the effect under test:
 *
 *  - a real `Enemy` keeps `life` as a fixed per-type nominal HP and accumulates
 *    damage in `damageTaken`; `alive` flips when `damageTaken >= life`
 *    (src/entities/enemies/Enemy.ts). The double below reproduces exactly that,
 *    which is what makes the EvoMap life-base question observable.
 *  - a real `Base.heal` caps at `maxLife` and rounds the amount
 *    (src/entities/terrain/Base.ts).
 *
 * Deliberately NOT covered as "passing", because the capability does not exist:
 * inventory quantity / consumption / ownership, and a programmatic new-run
 * reset. Those are recorded as observations, not faked into green assertions.
 */

// ---------------------------------------------------------------------------
// Minimal test doubles (faithful to the live engine semantics)
// ---------------------------------------------------------------------------

function makeWallet(balance) {
    return {
        balance,
        canWithdraw(amount) {
            return this.balance >= amount;
        },
        withdraw(amount) {
            if (!this.canWithdraw(amount)) return false;
            this.balance -= amount;
            return true;
        },
    };
}

/** Mirrors src/entities/enemies/Enemy.ts: `life` is nominal and never decremented. */
class FakeEnemy {
    constructor(nominalLife, alive = true) {
        this.life = nominalLife;
        this.alive = alive;
        this.damageTaken = 0;
    }
    takeDamage(amount) {
        this.damageTaken += amount;
        if (this.damageTaken >= this.life && this.alive) this.alive = false;
    }
    get remainingLife() {
        return Math.max(0, this.life - this.damageTaken);
    }
}

/** Mirrors src/entities/terrain/Base.ts heal(): caps at maxLife, rounds. */
class FakeBase {
    constructor(maxLife, life) {
        this.maxLife = maxLife;
        this.life = life;
    }
    getLife() {
        return this.life;
    }
    getMaxLife() {
        return this.maxLife;
    }
    heal(amount) {
        this.life = Math.min(this.maxLife, this.life + Math.round(amount));
    }
}

function freshController() {
    return new TacticalItemsController();
}

function activate(id, key, wallet, context) {
    return freshController().activate(key, true, wallet, context);
}

console.log('TacticalItems core audit (issue #69)');

// ---------------------------------------------------------------------------
// 1. Stable identifiers and catalog shape
// ---------------------------------------------------------------------------
{
    const controller = freshController();
    assert.strictEqual(ITEM_KEYS.length, 5, 'five internal item ids');
    assert.deepStrictEqual(
        [...ITEM_KEYS],
        ['natural_oil', 'tripo', 'seeed_studio', 'evomap', 'hypershell'],
        'ids are stable and ordered'
    );
    for (const key of ITEM_KEYS) {
        assert.deepStrictEqual(controller.getState(key), {kind: 'ready'}, `${key} starts ready`);
    }
    assert.strictEqual(ITEM_BASE_COST, 1000);
    assert.strictEqual(ITEM_BUFF_DURATION_MS, 5000);
    assert.strictEqual(ITEM_COOLDOWN_MS, 10000);
}

// ---------------------------------------------------------------------------
// 2. Legal activation, charged cost, effect and full lifecycle for each id
// ---------------------------------------------------------------------------
{
    // Tripo: 3x tower damage while active.
    const tripo = freshController();
    const wallet = makeWallet(1000);
    assert.strictEqual(tripo.damageMultiplier, 1.0);
    assert.deepStrictEqual(tripo.activate('tripo', true, wallet), {ok: true});
    assert.strictEqual(wallet.balance, 0, 'tripo charges 1000');
    assert.strictEqual(tripo.damageMultiplier, 3.0);
    assert.strictEqual(tripo.getState('tripo').kind, 'active');
}

{
    // Seeed Studio and natural_oil: 1.5x attack speed while active.
    for (const key of ['seeed_studio', 'natural_oil']) {
        const controller = freshController();
        const wallet = makeWallet(1000);
        assert.strictEqual(controller.attackSpeedMultiplier, 1.0, `${key} baseline speed`);
        assert.deepStrictEqual(controller.activate(key, true, wallet), {ok: true}, `${key} activates`);
        assert.strictEqual(wallet.balance, 0, `${key} charges 1000`);
        assert.strictEqual(controller.attackSpeedMultiplier, 1.5, `${key} gives 1.5x`);
        assert.strictEqual(controller.getState(key).kind, 'active');
    }
}

{
    // EvoMap: one-shot AOE, free for the first two uses, then 1000; goes straight
    // to cooldown (no active window).
    const evomap = freshController();
    const wallet = makeWallet(5000);
    const enemies = {all: () => [new FakeEnemy(100)]};
    assert.strictEqual(evomap.cost('evomap'), 0);
    assert.deepStrictEqual(evomap.activate('evomap', true, wallet, {enemyManager: enemies}), {ok: true});
    assert.strictEqual(wallet.balance, 5000, 'first use is free');
    assert.strictEqual(evomap.getState('evomap').kind, 'cooldown', 'evomap skips active phase');
    assert.strictEqual(evomap.cost('evomap'), 0, 'still free before the second use');
}

{
    // HyperShell: one-shot base heal; goes straight to cooldown.
    const hyper = freshController();
    const wallet = makeWallet(1000);
    const base = new FakeBase(20, 10);
    assert.deepStrictEqual(hyper.activate('hypershell', true, wallet, {homeBase: base}), {ok: true});
    assert.strictEqual(wallet.balance, 0, 'hypershell charges 1000');
    assert.strictEqual(base.getLife(), 15, 'heals 25% of max');
    assert.strictEqual(hyper.getState('hypershell').kind, 'cooldown');
}

// ---------------------------------------------------------------------------
// 3. Structured failures: NOT_RUNNING / ALREADY_ACTIVE / COOLDOWN /
//    INSUFFICIENT_FUNDS, and "no mutation on failure"
// ---------------------------------------------------------------------------
{
    for (const key of ITEM_KEYS) {
        const controller = freshController();
        const wallet = makeWallet(100000);
        const result = controller.activate(key, false, wallet);
        assert.deepStrictEqual(result, {ok: false, reason: 'NOT_RUNNING'}, `${key} rejects when frozen`);
        assert.strictEqual(wallet.balance, 100000, `${key} charges nothing when frozen`);
        assert.deepStrictEqual(controller.getState(key), {kind: 'ready'}, `${key} stays ready`);
    }
}

{
    // Direct controller call with a foreign id fails closed.
    const controller = freshController();
    const result = controller.activate('super_bomb', true, makeWallet(9999));
    assert.deepStrictEqual(result, {ok: false, reason: 'UNKNOWN_ITEM'});
}

{
    // Buff items reject a second activation while the first is still active.
    for (const key of ['tripo', 'seeed_studio', 'natural_oil']) {
        const controller = freshController();
        const wallet = makeWallet(2000);
        assert.deepStrictEqual(controller.activate(key, true, wallet), {ok: true});
        const again = controller.activate(key, true, wallet);
        assert.deepStrictEqual(again, {ok: false, reason: 'ALREADY_ACTIVE'}, `${key} rejects re-activation`);
        assert.strictEqual(wallet.balance, 1000, `${key} does not double-charge`);
    }
}

{
    // Cooldown rejects until the 10s window elapses.
    const BUFF_ITEMS = ['tripo', 'seeed_studio', 'natural_oil'];
    for (const key of ITEM_KEYS) {
        const controller = freshController();
        const wallet = makeWallet(5000);
        const context = {enemyManager: {all: () => []}, homeBase: new FakeBase(20, 10)};
        assert.strictEqual(controller.activate(key, true, wallet, context).ok, true, `${key} first use`);
        // Buff items must first finish their 5s active window; one-shot items
        // (evomap / hypershell) enter cooldown immediately.
        if (BUFF_ITEMS.includes(key)) controller.update(ITEM_BUFF_DURATION_MS, true);
        controller.update(ITEM_COOLDOWN_MS - 1, true);
        assert.deepStrictEqual(controller.activate(key, true, wallet, context), {ok: false, reason: 'COOLDOWN'}, `${key} blocked on cooldown`);
        controller.update(1, true);
        assert.strictEqual(controller.getState(key).kind, 'ready', `${key} ready after cooldown`);
    }
}

{
    // Insufficient funds: state and wallet untouched.
    for (const key of ['tripo', 'seeed_studio', 'natural_oil', 'hypershell']) {
        const controller = freshController();
        const wallet = makeWallet(999);
        assert.deepStrictEqual(controller.activate(key, true, wallet), {ok: false, reason: 'INSUFFICIENT_FUNDS'}, `${key} needs 1000`);
        assert.strictEqual(wallet.balance, 999);
        assert.deepStrictEqual(controller.getState(key), {kind: 'ready'});
    }
}

{
    // A wallet that says yes to canWithdraw but refuses withdraw() must not let
    // the activation succeed (fail closed).
    const controller = freshController();
    const refused = {canWithdraw: () => true, withdraw: () => false};
    assert.deepStrictEqual(controller.activate('tripo', true, refused), {ok: false, reason: 'INSUFFICIENT_FUNDS'});
    assert.deepStrictEqual(controller.getState('tripo'), {kind: 'ready'});
}

// ---------------------------------------------------------------------------
// 4. EvoMap free-use accounting and cost transition
// ---------------------------------------------------------------------------
{
    const controller = freshController();
    const wallet = makeWallet(5000);
    const manager = {all: () => [new FakeEnemy(100)]};

    assert.strictEqual(controller.cost('evomap'), 0);
    assert.strictEqual(controller.activate('evomap', true, wallet, {enemyManager: manager}).ok, true);
    controller.update(ITEM_COOLDOWN_MS, true);
    assert.strictEqual(controller.cost('evomap'), 0, 'second use still free');
    assert.strictEqual(controller.activate('evomap', true, wallet, {enemyManager: manager}).ok, true);
    assert.strictEqual(wallet.balance, 5000, 'two free uses deduct nothing');
    controller.update(ITEM_COOLDOWN_MS, true);

    assert.strictEqual(controller.cost('evomap'), ITEM_BASE_COST, 'third use costs 1000');
    assert.strictEqual(controller.activate('evomap', true, wallet, {enemyManager: manager}).ok, true);
    assert.strictEqual(wallet.balance, 4000, 'third use charges 1000');
    controller.update(ITEM_COOLDOWN_MS, true);
    assert.strictEqual(controller.cost('evomap'), 1000, 'fourth use still costs 1000');

    // Once paid, an unaffordable fourth use is rejected without side effects.
    const poor = freshController();
    const poorWallet = makeWallet(0);
    poor.cost('evomap');
    // Burn the two free uses through the real controller.
    const burn = {enemyManager: {all: () => []}};
    poor.activate('evomap', true, poorWallet, burn);
    poor.update(ITEM_COOLDOWN_MS, true);
    poor.activate('evomap', true, poorWallet, burn);
    poor.update(ITEM_COOLDOWN_MS, true);
    assert.strictEqual(poor.cost('evomap'), 1000);
    assert.deepStrictEqual(poor.activate('evomap', true, poorWallet, burn), {ok: false, reason: 'INSUFFICIENT_FUNDS'});
}

// ---------------------------------------------------------------------------
// 5. Effect application details
// ---------------------------------------------------------------------------
{
    // EvoMap hits only living enemies; each takes max(1, round(life * 0.02)).
    const controller = freshController();
    const big = new FakeEnemy(500);
    const mid = new FakeEnemy(100);
    const tiny = new FakeEnemy(10); // 0.2 -> rounds to 0 -> clamped to 1
    const corpse = new FakeEnemy(100, false); // already dead
    const manager = {all: () => [big, mid, tiny, corpse]};
    assert.strictEqual(controller.activate('evomap', true, makeWallet(0), {enemyManager: manager}).ok, true);
    assert.strictEqual(big.damageTaken, 10, '2% of 500');
    assert.strictEqual(mid.damageTaken, 2, '2% of 100');
    assert.strictEqual(tiny.damageTaken, 1, 'minimum 1 damage');
    assert.strictEqual(corpse.damageTaken, 0, 'dead enemies are skipped');
}

{
    // SPEC EVIDENCE — EvoMap life base.
    // A real Enemy keeps `life` as its fixed nominal HP and records damage in
    // `damageTaken`; `life` is never decremented. So the computed 2% is of the
    // enemy's full nominal HP ("max HP"), independent of how much damage it has
    // already taken. The product doc §5 wording "当前生命值 2%" (current life)
    // does not describe the code: the code never observes current/remaining HP.
    const controller = freshController();
    const wounded = new FakeEnemy(100);
    wounded.takeDamage(90); // nominal 100, effectively 10 HP remaining
    assert.strictEqual(wounded.remainingLife, 10);
    assert.strictEqual(controller.activate('evomap', true, makeWallet(0), {enemyManager: {all: () => [wounded]}}).ok, true);
    assert.strictEqual(
        wounded.damageTaken,
        92,
        'damage is 2% of nominal 100 (=2), NOT 2% of remaining 10 (=1)'
    );
}

{
    // EvoMap with no enemy manager still activates cleanly (empty map).
    const controller = freshController();
    assert.deepStrictEqual(controller.activate('evomap', true, makeWallet(0)), {ok: true});
}

{
    // HyperShell heals 25% of max and never exceeds the cap; full base stays full.
    const full = new FakeBase(20, 20);
    const healFull = freshController();
    assert.strictEqual(healFull.activate('hypershell', true, makeWallet(1000), {homeBase: full}).ok, true);
    assert.strictEqual(full.getLife(), 20, 'heal is capped at max');

    const near = new FakeBase(20, 18);
    const healNear = freshController();
    assert.strictEqual(healNear.activate('hypershell', true, makeWallet(1000), {homeBase: near}).ok, true);
    assert.strictEqual(near.getLife(), 20, '18 + 5 caps to 20');

    const odd = new FakeBase(15, 1);
    const healOdd = freshController();
    assert.strictEqual(healOdd.activate('hypershell', true, makeWallet(1000), {homeBase: odd}).ok, true);
    assert.strictEqual(odd.getLife(), 5, 'round(15 * 0.25) = 4, 1 + 4 = 5');
}

{
    // HyperShell with no home base still activates (no crash, base untouched).
    const controller = freshController();
    assert.deepStrictEqual(controller.activate('hypershell', true, makeWallet(1000)), {ok: true});
}

// ---------------------------------------------------------------------------
// 6. Effects coexist without cross-contamination or unintended stacking
// ---------------------------------------------------------------------------
{
    const controller = freshController();
    const wallet = makeWallet(3000);

    assert.strictEqual(controller.activate('tripo', true, wallet).ok, true);
    // Stagger the start so Tripo can expire while the speed buffs stay active.
    controller.update(2000, true);
    assert.strictEqual(controller.activate('seeed_studio', true, wallet).ok, true);

    // Both buffs are live at the same time.
    assert.strictEqual(controller.damageMultiplier, 3.0, 'tripo damage still applies');
    assert.strictEqual(controller.attackSpeedMultiplier, 1.5, 'seeed speed still applies');

    // Natural oil added on top of Seeed Studio must not push speed above 1.5.
    assert.strictEqual(controller.activate('natural_oil', true, wallet).ok, true);
    assert.strictEqual(controller.attackSpeedMultiplier, 1.5, 'attack speed does not stack');
    assert.strictEqual(controller.damageMultiplier, 3.0);

    // Expiring Tripo must not disturb the speed buffs.
    controller.update(3000, true);
    assert.strictEqual(controller.damageMultiplier, 1.0, 'tripo expired');
    assert.strictEqual(controller.attackSpeedMultiplier, 1.5, 'speed buffs still active');
}

// ---------------------------------------------------------------------------
// 7. Simulated time: RUNNING advances, PAUSED/PLANNING freeze, speed scales
// ---------------------------------------------------------------------------
{
    // Frozen time (PAUSED / PLANNING) must not advance any timer.
    const controller = freshController();
    const wallet = makeWallet(1000);
    assert.strictEqual(controller.activate('tripo', true, wallet).ok, true);
    controller.update(99999, false);
    assert.deepStrictEqual(controller.getState('tripo'), {kind: 'active', remainingMs: ITEM_BUFF_DURATION_MS});

    // Speed mode just runs the same small delta more times; chunking must not
    // change the outcome.
    const chunked = freshController();
    chunked.activate('tripo', true, makeWallet(1000));
    for (let i = 0; i < 8; ++i) chunked.update(ITEM_BUFF_DURATION_MS / 8, true);
    assert.strictEqual(chunked.getState('tripo').kind, 'cooldown', 'x8 style stepping expires the buff');

    const once = freshController();
    once.activate('tripo', true, makeWallet(1000));
    once.update(ITEM_BUFF_DURATION_MS, true);
    assert.strictEqual(once.getState('tripo').kind, 'cooldown');
    assert.deepStrictEqual(chunked.getState('tripo'), once.getState('tripo'), 'chunking invariant');
}

{
    // Effect ends FIRST, then the leftover delta flows into the cooldown.
    const controller = freshController();
    controller.activate('seeed_studio', true, makeWallet(1000));
    controller.update(ITEM_BUFF_DURATION_MS + 1000, true);
    assert.deepStrictEqual(controller.getState('seeed_studio'), {kind: 'cooldown', remainingMs: 9000});
    assert.strictEqual(controller.attackSpeedMultiplier, 1.0, 'buff is off during cooldown');
}

// ---------------------------------------------------------------------------
// 8. New run / restart reset — and the capabilities that do NOT exist
// ---------------------------------------------------------------------------
{
    // A fresh controller (what a page load / new module graph gives) is clean.
    const controller = freshController();
    assert.strictEqual(controller.cost('evomap'), 0, 'free uses reset with a new instance');
    for (const key of ITEM_KEYS) {
        assert.deepStrictEqual(controller.getState(key), {kind: 'ready'}, `${key} ready on new run`);
    }

    // OBSERVATION (not a passing product requirement): the core exposes no
    // programmatic reset. The game resets by reloading the page
    // (index.html "重新部署" calls location.reload()), which drops the module
    // singletons — so the singleton state is only reset by a full reload, not by
    // any in-code new-run path.
    assert.strictEqual(typeof controller.reset, 'undefined', 'no reset() API exists');

    // The singleton accumulates state and has no way to be reset in-process.
    const singletonProbe = freshController();
    singletonProbe.activate('hypershell', true, makeWallet(1000), {homeBase: new FakeBase(20, 10)});
    singletonProbe.update(ITEM_COOLDOWN_MS, true);
    singletonProbe.activate('hypershell', true, makeWallet(1000), {homeBase: new FakeBase(20, 10)});
    assert.strictEqual(singletonProbe.getState('hypershell').kind, 'cooldown', 'state persists on the instance');
}

{
    // OBSERVATION: issue #69 asks for inventory quantity / consumption /
    // ownership. The current core has none of that; only evomap has a free-use
    // counter. These assertions document the ABSENCE rather than faking a pass.
    const controller = freshController();
    assert.strictEqual(typeof controller.getInventory, 'undefined', 'no inventory API');
    assert.strictEqual(typeof controller.quantityOf, 'undefined', 'no quantity API');
    assert.strictEqual(typeof controller.owns, 'undefined', 'no ownership API');
    assert.strictEqual(typeof controller.consume, 'undefined', 'no consumption API');
}

// ---------------------------------------------------------------------------
// 9. GameActions -> engine item entry: model parameters cannot bypass the rules
// ---------------------------------------------------------------------------
{
    // The battlefield double mirrors InertBattlefield.useItem: it forwards to
    // the REAL TacticalItemsController with the REAL wallet. Funds, cooldown and
    // legality are therefore enforced by the real core, not by the double.
    function makeBattlefield(controller, wallet) {
        return {
            gridWidth: 10,
            gridHeight: 10,
            maxTowerLevel: 5,
            cash: () => wallet.balance,
            towerOptions: () => [],
            towers: () => [],
            towerAt: () => undefined,
            canPlaceAt: () => ({ok: true}),
            canAfford: amount => wallet.canWithdraw(amount),
            build: () => undefined,
            upgrade: () => false,
            snapshot: () => ({}),
            useItem(item) {
                const result = controller.activate(item, true, wallet, {});
                if (result.ok) return {ok: true};
                return {ok: false, error: result.reason};
            },
        };
    }

    const controller = freshController();
    const wallet = makeWallet(1000);
    const actions = new GameActions(makeBattlefield(controller, wallet));

    // Success path is real and deducts real cash.
    const ok = actions.useItem('tripo');
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(wallet.balance, 0);

    // A second activation through the model cannot bypass ALREADY_ACTIVE.
    const blocked = actions.useItem('tripo');
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.error, 'ALREADY_ACTIVE');
    assert.strictEqual(wallet.balance, 0, 'no extra charge on rejection');

    // During cooldown the model is rejected.
    controller.update(ITEM_BUFF_DURATION_MS, true);
    const cooling = actions.useItem('tripo');
    assert.strictEqual(cooling.ok, false);
    assert.strictEqual(cooling.error, 'COOLDOWN');

    // Unknown / spoofed item ids are rejected before reaching the engine.
    for (const bogus of ['super_bomb', 'TRIPO', 'tripo ', '']) {
        const result = actions.useItem(bogus);
        assert.strictEqual(result.ok, false, `rejects ${JSON.stringify(bogus)}`);
        assert.strictEqual(result.error, 'UNKNOWN_ITEM');
    }
}

{
    // Insufficient funds through GameActions: rejected, no state advance.
    const controller = freshController();
    const wallet = makeWallet(999);
    const actions = new GameActions({
        gridWidth: 10, gridHeight: 10, maxTowerLevel: 5,
        cash: () => wallet.balance,
        towerOptions: () => [], towers: () => [], towerAt: () => undefined,
        canPlaceAt: () => ({ok: true}), canAfford: a => wallet.canWithdraw(a),
        build: () => undefined, upgrade: () => false, snapshot: () => ({}),
        useItem(item) {
            const r = controller.activate(item, true, wallet, {});
            return r.ok ? {ok: true} : {ok: false, error: r.reason};
        },
    });
    const result = actions.useItem('hypershell');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'INSUFFICIENT_FUNDS');
    assert.strictEqual(wallet.balance, 999);
    assert.deepStrictEqual(controller.getState('hypershell'), {kind: 'ready'});
}

{
    // FINDING — the running-state gate is NOT reachable through the agent path.
    // InertBattlefield.useItem (src/agent/InertBattlefield.ts) calls
    // `tacticalItemsController.activate(item, true, cashManager, ...)` with
    // `isRunning` hard-coded to true. Replicating that exact forwarding shows the
    // controller's NOT_RUNNING guard can never fire for the model, even though
    // the UI path (src/InterfaceManager.ts) passes the real loop state. Funds,
    // cooldown and legality are still enforced; only the frozen-sim gate leaks.
    const controller = freshController();
    const wallet = makeWallet(5000);
    const actions = new GameActions({
        gridWidth: 10, gridHeight: 10, maxTowerLevel: 5,
        cash: () => wallet.balance,
        towerOptions: () => [], towers: () => [], towerAt: () => undefined,
        canPlaceAt: () => ({ok: true}), canAfford: a => wallet.canWithdraw(a),
        build: () => undefined, upgrade: () => false, snapshot: () => ({}),
        useItem(item) {
            // Exact shape of InertBattlefield.useItem.
            const r = controller.activate(item, true, wallet, {});
            return r.ok ? {ok: true} : {ok: false, error: r.reason};
        },
    });
    const gameIsPaused = true;
    assert.strictEqual(gameIsPaused, true, 'stand-in for paused/planning state');
    assert.strictEqual(actions.useItem('natural_oil').ok, true, 'agent path activates while sim is frozen');
}

console.log('All TacticalItems core audit checks passed.');
