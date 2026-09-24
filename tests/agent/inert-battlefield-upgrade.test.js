const assert = require('assert');
const Module = require('module');

// CashManager touches only the cash label. Returning null keeps this adapter
// test in plain Node without creating a DOM.
global.document = {getElementById: () => null};

// The battlefield adapter imports renderable entities, but these tests exercise
// only their combat state and must not initialize browser canvas controls.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (/(^|[/\\])Canvas(?:\.js)?$/.test(request)) {
        return {canvas: {on() {}, getElement() { return null; }}, ctx: {}};
    }
    if (/(^|[/\\])Controls(?:\.js)?$/.test(request)) {
        return {controls: {on() {}, mouse: {x: 0, y: 0}, mouseInCanvas: false}};
    }
    if (/(^|[/\\])WavesManager(?:\.js)?$/.test(request)) {
        return {waveManager: {}};
    }
    if (/(^|[/\\])Game(?:\.js)?$/.test(request)) {
        return {game: {}};
    }
    if (/(^|[/\\])TextureManager(?:\.js)?$/.test(request)) {
        return {textureManager: {draw() {}, onLoaded() {}}};
    }
    if (/(^|[/\\])texturePaths(?:\.js)?$/.test(request)) {
        return {texturePaths: {enemies: {}, towers: {}, home: {}, terrain: {obstacles: []}}};
    }
    return originalLoad.call(this, request, parent, isMain);
};

const {map, Map} = require('../../.test-build/Map.js');
const {cashManager} = require('../../.test-build/CashManager.js');
const {GameActions} = require('../../.test-build/agent/GameActions.js');
const {InertBattlefield} = require('../../.test-build/agent/InertBattlefield.js');

function resetBattlefield(cash) {
    map.grid = Array.from({length: Map.GRID_W}, () => Array(Map.GRID_H).fill(0));
    map.grid[map.homeBase.i][map.homeBase.j] = map.homeBase;
    for (const base of map.enemyBases) map.grid[base.i][base.j] = base;
    map.invalidatePathsCache();
    cashManager.setBalance(cash);
}

function buildCanon(actions) {
    const result = actions.buildTower('canon', 2, 2);
    assert.strictEqual(result.ok, true);
    return result;
}

function test(name, run) {
    try {
        run();
        console.log(`  ok  ${name}`);
    } catch (error) {
        console.error(`FAIL  ${name}`);
        throw error;
    }
}

console.log('InertBattlefield upgrades');

test('successful upgrade charges once and immediately raises live combat stats', () => {
    resetBattlefield(1000);
    const battlefield = new InertBattlefield();
    const actions = new GameActions(battlefield);
    const build = buildCanon(actions);
    const before = battlefield.towerAt(2, 2);
    const upgrade = actions.upgradeTower(build.data.towerId);

    assert.strictEqual(upgrade.ok, true);
    const after = battlefield.towerAt(2, 2);
    assert.strictEqual(after.level, before.level + 1);
    assert.ok(after.damage > before.damage, 'the live damage value must increase');
    assert.ok(after.reloadMs < before.reloadMs, 'the live reload interval must decrease');
    assert.strictEqual(
        cashManager.getBalance(),
        1000 - build.data.cost - upgrade.data.upgradeCost,
        'the upgrade cost must be withdrawn exactly once'
    );
});

test('slow tower upgrades extend the live radius of its slowing effect', () => {
    resetBattlefield(1000);
    const battlefield = new InertBattlefield();
    const actions = new GameActions(battlefield);
    const build = actions.buildTower('slow', 2, 2);
    assert.strictEqual(build.ok, true);
    const before = battlefield.towerAt(2, 2);

    const upgrade = actions.upgradeTower(build.data.towerId);

    assert.strictEqual(upgrade.ok, true);
    const after = battlefield.towerAt(2, 2);
    assert.strictEqual(after.damage, 0);
    assert.strictEqual(after.reloadMs, 0);
    assert.ok(after.aimRadius > before.aimRadius, 'the live slow-effect radius must increase');
});

test('max-level upgrade leaves the live tower and balance unchanged', () => {
    resetBattlefield(1000);
    const battlefield = new InertBattlefield();
    const actions = new GameActions(battlefield);
    const build = buildCanon(actions);
    const tower = map.grid[2][2];
    tower.level = tower.maxLevel;
    const balance = cashManager.getBalance();
    const damage = tower.damage;
    const reloadMs = tower.reloadDurationMs;

    const result = actions.upgradeTower(build.data.towerId);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'ALREADY_MAX_LEVEL');
    assert.strictEqual(tower.level, tower.maxLevel);
    assert.strictEqual(tower.damage, damage);
    assert.strictEqual(tower.reloadDurationMs, reloadMs);
    assert.strictEqual(cashManager.getBalance(), balance);
});

test('insufficient funds leave the live tower and balance unchanged', () => {
    resetBattlefield(1000);
    const battlefield = new InertBattlefield();
    const actions = new GameActions(battlefield);
    const build = buildCanon(actions);
    const before = battlefield.towerAt(2, 2);
    cashManager.setBalance(before.upgradeCost - 1);
    const balance = cashManager.getBalance();

    const result = actions.upgradeTower(build.data.towerId);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'INSUFFICIENT_FUNDS');
    const after = battlefield.towerAt(2, 2);
    assert.strictEqual(after.level, before.level);
    assert.strictEqual(after.damage, before.damage);
    assert.strictEqual(after.reloadMs, before.reloadMs);
    assert.strictEqual(cashManager.getBalance(), balance);
});

test('a rejected entity mutation refunds the attempted upgrade cost', () => {
    resetBattlefield(1000);
    const battlefield = new InertBattlefield();
    const actions = new GameActions(battlefield);
    const build = buildCanon(actions);
    const tower = map.grid[2][2];
    const balance = cashManager.getBalance();
    const damage = tower.damage;
    tower.applyUpgrade = () => false;

    const result = actions.upgradeTower(build.data.towerId);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'UPGRADE_FAILED');
    assert.strictEqual(tower.level, 1);
    assert.strictEqual(tower.damage, damage);
    assert.strictEqual(cashManager.getBalance(), balance);
});

test('cash changes immediately refresh upgrade affordability', () => {
    resetBattlefield(20);
    const upgradeCost = 50;
    let buttonDisabled = true;
    const refreshButton = () => {
        buttonDisabled = !cashManager.canWithdraw(upgradeCost);
    };
    const unsubscribe = cashManager.onBalanceChange(refreshButton);

    assert.strictEqual(buttonDisabled, true);
    cashManager.add(40);
    assert.strictEqual(buttonDisabled, false, 'a reward must enable an affordable upgrade');
    cashManager.withdraw(20);
    assert.strictEqual(buttonDisabled, true, 'spending must disable an unaffordable upgrade');
    unsubscribe();
    cashManager.add(20);
    assert.strictEqual(buttonDisabled, true, 'an unsubscribed listener must stop updating');
});

console.log('All InertBattlefield upgrade tests passed.');
