const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const interfaceSource = read('src/InterfaceManager.ts');
const gameSource = read('src/Game.ts');
const cashSource = read('src/CashManager.ts');
const styles = read('src/styles/styles.less');

const palette = index.indexOf('id="towers-wrapper"');
const item = index.indexOf('id="natural-oil"');
const stats = index.indexOf('id="towers-stats"');
assert.ok(palette >= 0 && item > palette && item < stats,
    'Natural Oil must appear below the tower choices in both modes');
assert.match(index.slice(item, stats), /天然机油/);
assert.match(index.slice(item, stats), /2000/);
assert.match(index.slice(item, stats), /aria-live="polite"/);
assert.match(styles, /\.natural-oil-icon[\s\S]*background:/,
    'the item needs a CSS color-block icon');
assert.match(interfaceSource, /naturalOilController\.activate\(gameLoop\.state === 'running', cashManager\)/,
    'clicks must consult the running state and real wallet');
assert.match(interfaceSource, /naturalOilButton\.disabled = state\.kind !== 'ready' \|\| gameLoop\.state !== 'running'/,
    'active, cooldown, and non-running states must disable the button');
assert.match(gameSource, /for \(let step = 0; step < gameLoop\.speed; \+\+step\) \{[\s\S]*naturalOilController\.update\(1000 \/ fps, gameLoop\.state === 'running'\)/,
    'oil time must advance once per simulation step inside the speed loop');
assert.match(cashSource, /withdraw\(amount: number\): boolean[\s\S]*return false;[\s\S]*return true;/,
    'withdraw must report failure and success');

const {NaturalOilController} = require('../.test-build/items/NaturalOil.js');
function wallet(balance) {
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
const cash = wallet(4000);
assert.deepStrictEqual(oil.activate(false, cash), {ok: false, reason: 'NOT_RUNNING'});
assert.strictEqual(cash.balance, 4000);
assert.strictEqual(oil.attackSpeedMultiplier, 1);
assert.deepStrictEqual(oil.activate(true, cash), {ok: true});
assert.strictEqual(cash.balance, 2000);
oil.update(16, false);
assert.deepStrictEqual(oil.state, {kind: 'active', remainingMs: 5000});
oil.update(16, true);
assert.deepStrictEqual(oil.state, {kind: 'active', remainingMs: 4984});
const fast = new NaturalOilController();
fast.activate(true, wallet(2000));
for (let step = 0; step < 4; step++) fast.update(16, true);
assert.deepStrictEqual(fast.state, {kind: 'active', remainingMs: 4936});
oil.update(4984, true);
assert.deepStrictEqual(oil.state, {kind: 'cooldown', remainingMs: 10000});
oil.update(16, false);
assert.deepStrictEqual(oil.state, {kind: 'cooldown', remainingMs: 10000});

console.log('Natural Oil UI placement, state wiring, and simulation timing assertions passed.');
