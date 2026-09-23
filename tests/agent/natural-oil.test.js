const assert = require('assert');
const {NaturalOilController, attackClockDelta} = require('../../.test-build/items/NaturalOil.js');

assert.strictEqual(attackClockDelta(16, 200, 1.5), 24);
assert.strictEqual(attackClockDelta(16, 200, 1), 16);
assert.strictEqual(attackClockDelta(16, 0, 1.5), 16);

function cash(balance) {
    return {
        balance,
        canWithdraw(amount) { return this.balance >= amount; },
        withdraw(amount) {
            if (!this.canWithdraw(amount)) return false;
            this.balance -= amount;
            return true;
        }
    };
}

const oil = new NaturalOilController();
const wallet = cash(4000);
assert.deepStrictEqual(oil.state, {kind: 'ready'});
assert.strictEqual(oil.attackSpeedMultiplier, 1);
assert.deepStrictEqual(oil.activate(false, wallet), {ok: false, reason: 'NOT_RUNNING'});
assert.strictEqual(wallet.balance, 4000);
assert.deepStrictEqual(oil.activate(true, cash(999)), {ok: false, reason: 'INSUFFICIENT_FUNDS'});
assert.deepStrictEqual(oil.state, {kind: 'ready'});
assert.deepStrictEqual(oil.activate(true, wallet), {ok: true});
assert.strictEqual(wallet.balance, 3000);
assert.deepStrictEqual(oil.state, {kind: 'active', remainingMs: 5000});
assert.strictEqual(oil.attackSpeedMultiplier, 1.5);
assert.deepStrictEqual(oil.activate(true, wallet), {ok: false, reason: 'ALREADY_ACTIVE'});
assert.strictEqual(wallet.balance, 3000);

oil.update(4999, false);
assert.deepStrictEqual(oil.state, {kind: 'active', remainingMs: 5000});
oil.update(4999, true);
assert.deepStrictEqual(oil.state, {kind: 'active', remainingMs: 1});
oil.update(1, true);
assert.deepStrictEqual(oil.state, {kind: 'cooldown', remainingMs: 10000});
assert.strictEqual(oil.attackSpeedMultiplier, 1);
assert.deepStrictEqual(oil.activate(true, wallet), {ok: false, reason: 'COOLDOWN'});
assert.strictEqual(wallet.balance, 3000);
oil.update(3000, false);
assert.deepStrictEqual(oil.state, {kind: 'cooldown', remainingMs: 10000});
oil.update(9999, true);
assert.deepStrictEqual(oil.state, {kind: 'cooldown', remainingMs: 1});
oil.update(1, true);
assert.deepStrictEqual(oil.state, {kind: 'ready'});
assert.deepStrictEqual(oil.activate(true, wallet), {ok: true});
assert.strictEqual(wallet.balance, 2000);

const failedWithdrawal = new NaturalOilController();
const refusedCash = {canWithdraw: () => true, withdraw: () => false};
assert.deepStrictEqual(failedWithdrawal.activate(true, refusedCash), {ok: false, reason: 'INSUFFICIENT_FUNDS'});
assert.deepStrictEqual(failedWithdrawal.state, {kind: 'ready'});

const overshoot = new NaturalOilController();
assert.deepStrictEqual(overshoot.activate(true, cash(1000)), {ok: true});
overshoot.update(6000, true);
assert.deepStrictEqual(overshoot.state, {kind: 'cooldown', remainingMs: 9000});
overshoot.update(9001, true);
assert.deepStrictEqual(overshoot.state, {kind: 'ready'});

const isolated = new NaturalOilController();
assert.deepStrictEqual(isolated.activate(true, cash(2000)), {ok: true});
const exposed = isolated.state;
exposed.remainingMs = 1;
exposed.kind = 'ready';
assert.deepStrictEqual(isolated.state, {kind: 'active', remainingMs: 5000});
assert.strictEqual(isolated.attackSpeedMultiplier, 1.5);
