const assert = require('assert');
const {TacticalItemsController, ITEM_KEYS} = require('../../.test-build/items/TacticalItems.js');

function makeWallet(balance) {
    return {
        balance,
        canWithdraw(amount) { return this.balance >= amount; },
        withdraw(amount) {
            if (!this.canWithdraw(amount)) return false;
            this.balance -= amount;
            return true;
        },
    };
}

class FakeEnemy {
    constructor(life) {
        this.life = life;
        this.alive = true;
        this.damageTaken = 0;
    }
    takeDamage(amount) {
        this.damageTaken += amount;
        if (this.damageTaken >= this.life) this.alive = false;
    }
}

class FakeBase {
    constructor(maxLife = 20, currentLife = 10) {
        this.maxLife = maxLife;
        this.life = currentLife;
    }
    getLife() { return this.life; }
    getMaxLife() { return this.maxLife; }
    heal(amount) {
        this.life = Math.min(this.maxLife, this.life + amount);
    }
}

console.log('TacticalItems');

// 1. Initial state and costs
const controller = new TacticalItemsController();
assert.strictEqual(controller.attackSpeedMultiplier, 1.0);
assert.strictEqual(controller.damageMultiplier, 1.0);
assert.strictEqual(controller.cost('tripo'), 1000);
assert.strictEqual(controller.cost('seeed_studio'), 1000);
assert.strictEqual(controller.cost('natural_oil'), 1000);
assert.strictEqual(controller.cost('hypershell'), 1000);
assert.strictEqual(controller.cost('evomap'), 0, 'evomap 1st use is free');

// 2. Reject when idle
const wallet = makeWallet(5000);
assert.deepStrictEqual(controller.activate('tripo', false, wallet), {ok: false, reason: 'NOT_RUNNING'});

// 3. Tripo: 300% firepower for 5s
assert.deepStrictEqual(controller.activate('tripo', true, wallet), {ok: true});
assert.strictEqual(wallet.balance, 4000);
assert.strictEqual(controller.damageMultiplier, 3.0);
assert.strictEqual(controller.getState('tripo').kind, 'active');

// Cannot re-activate while active
assert.deepStrictEqual(controller.activate('tripo', true, wallet), {ok: false, reason: 'ALREADY_ACTIVE'});

// Update 5s -> enters cooldown for 10s
controller.update(5000, true);
assert.strictEqual(controller.damageMultiplier, 1.0);
assert.strictEqual(controller.getState('tripo').kind, 'cooldown');
assert.deepStrictEqual(controller.activate('tripo', true, wallet), {ok: false, reason: 'COOLDOWN'});

// Update 10s -> ready
controller.update(10000, true);
assert.strictEqual(controller.getState('tripo').kind, 'ready');

// 4. Seeed Studio: 150% attack speed for 5s
assert.deepStrictEqual(controller.activate('seeed_studio', true, wallet), {ok: true});
assert.strictEqual(wallet.balance, 3000);
assert.strictEqual(controller.attackSpeedMultiplier, 1.5);
controller.update(5000, true);
assert.strictEqual(controller.attackSpeedMultiplier, 1.0);
controller.update(10000, true);
assert.strictEqual(controller.getState('seeed_studio').kind, 'ready');

// 5. EvoMap: 2 free uses, 2% max HP AOE, 3rd costs 1000
const e1 = new FakeEnemy(100);
const e2 = new FakeEnemy(500);
const enemyManager = { all: () => [e1, e2] };

// Use 1 (free)
assert.strictEqual(controller.cost('evomap'), 0);
assert.deepStrictEqual(controller.activate('evomap', true, wallet, {enemyManager}), {ok: true});
assert.strictEqual(wallet.balance, 3000, 'first evomap use does not deduct cash');
assert.strictEqual(e1.damageTaken, 2, '2% of 100 is 2');
assert.strictEqual(e2.damageTaken, 10, '2% of 500 is 10');
controller.update(10000, true); // cooldown finish

// Use 2 (free)
assert.strictEqual(controller.cost('evomap'), 0);
assert.deepStrictEqual(controller.activate('evomap', true, wallet, {enemyManager}), {ok: true});
assert.strictEqual(wallet.balance, 3000, 'second evomap use does not deduct cash');
assert.strictEqual(e1.damageTaken, 4);
assert.strictEqual(e2.damageTaken, 20);
controller.update(10000, true);

// Use 3 (costs 1000)
assert.strictEqual(controller.cost('evomap'), 1000);
assert.deepStrictEqual(controller.activate('evomap', true, wallet, {enemyManager}), {ok: true});
assert.strictEqual(wallet.balance, 2000, 'third evomap use costs 1000 cash');
assert.strictEqual(e1.damageTaken, 6);
assert.strictEqual(e2.damageTaken, 30);
controller.update(10000, true);

// 6. HyperShell: heals 25% max life
const base = new FakeBase(20, 10);
assert.deepStrictEqual(controller.activate('hypershell', true, wallet, {homeBase: base}), {ok: true});
assert.strictEqual(wallet.balance, 1000);
assert.strictEqual(base.getLife(), 15, '20 * 0.25 = 5 healed, 10 + 5 = 15');
controller.update(10000, true);

// HyperShell does not exceed maxLife
base.life = 18;
assert.deepStrictEqual(controller.activate('hypershell', true, wallet, {homeBase: base}), {ok: true});
assert.strictEqual(wallet.balance, 0);
assert.strictEqual(base.getLife(), 20, 'healed capped at maxLife 20');

// 7. getAllItemSnapshots
const snapshots = controller.getAllItemSnapshots();
assert.strictEqual(snapshots.length, 5);
assert.deepStrictEqual(snapshots.map(s => s.name), ['natural_oil', 'tripo', 'seeed_studio', 'evomap', 'hypershell']);

console.log('All TacticalItems tests passed.');
