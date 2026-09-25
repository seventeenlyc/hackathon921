const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('index.html');
const placer = read('src/TowerPlacer.ts');
const ui = read('src/InterfaceManager.ts');
const game = read('src/Game.ts');
const styles = read('src/styles/styles.less');
const translations = read('src/i18n.ts');

assert.match(html, /id="tower-upgrade-panel"/, 'the battlefield must mount a selected-tower panel');
assert.match(html, /id="tower-upgrade-level"/, 'the panel must expose the selected tower level');
assert.match(html, /id="tower-upgrade-cost"/, 'the panel must expose the next upgrade cost');
assert.match(html, /id="tower-upgrade-button"/, 'the panel must expose a manual upgrade button');
assert.match(placer, /getState\(\)\.towers/, 'selection must use live engine action state');
assert.match(placer, /upgradeTower\(/, 'manual upgrades must use the validated GameActions port');
assert.match(placer, /playMode !== 'human'/, 'the human action path must reject AI mode');
assert.match(game, /towerPlacer\.setSelectionListener/, 'the selected-tower panel must follow selection changes');
assert.match(ui, /textContent\s*=/, 'selected tower data must be rendered as text');
assert.doesNotMatch(ui, /innerHTML\s*=/, 'selected tower data must never enter HTML parsing');
assert.match(ui, /cashManager\.canWithdraw/, 'the upgrade button must reflect available resources');
assert.match(ui, /tower\.upgradeCost === null/, 'the upgrade button must stop at maximum level');
assert.match(ui, /towerUpgradeButton\.disabled\s*=/, 'invalid upgrade states must disable the button');
assert.match(ui, /tower\.upgrade\.insufficient/, 'unaffordable upgrades must be named on the disabled button');
assert.match(ui, /cashManager\.onBalanceChange\(\(\) => this\.updateTowerUpgradeAvailability\(\)\)/,
    'cash changes must refresh upgrade affordability immediately');
assert.match(styles, /\.tower-upgrade-panel/, 'the panel must use the tactical database visual system');
assert.match(translations, /tower\.upgrade\.button[\s\S]*?zh:[\s\S]*?en:/,
    'upgrade controls must have Chinese and English labels');
assert.match(translations, /tower\.upgrade\.insufficient[\s\S]*?zh:[\s\S]*?en:/,
    'the insufficient-funds button state must have Chinese and English labels');

console.log('Human tower upgrade UI assertions passed.');

// ---------------------------------------------------------------------------
// Behavioral checks: the real TowerPlacer runs here with only its runtime
// ports replaced, so selection and the upgrade request are exercised as code
// instead of as source text (issue #129). The fake engine state only changes
// inside `upgradeTower`, mirroring the engine-owned mutation boundary.
// ---------------------------------------------------------------------------

const TILE_SIZE = 40;

function loadTowerPlacer(mode) {
    const handlers = {};
    const controls = {
        mouse: {x: 0, y: 0},
        mouseInCanvas: true,
        on: (event, handler) => { handlers[event] = handler; },
    };
    const map = {grid: Array.from({length: 10}, () => Array(10).fill(0)), canBePlaced: () => true};
    const messages = [];
    const ports = {
        './Map': {map, Map: {TILE_SIZE}},
        './entities/towers/CanonTower': {CanonTower: class CanonTower { towerType = 'canon'; }},
        './interfaces/Renderable': {Renderable: class Renderable {
            constructor(x = 0, y = 0) { this.x = x; this.y = y; }
            update() {}
            draw() {}
            setCoordinates(x, y) { this.x = x; this.y = y; }
        }},
        './Controls': {controls},
        './Canvas': {canvas: {transformMatrix: {inverse: () => ({
            transformPoint: point => ({x: point.x, y: point.y}),
        })}}},
        './InterfaceManager': {interfaceManager: {snackbar: {toast: text => messages.push(text)}}},
        './PlayMode': {playMode: mode},
    };
    const exportsObject = {};
    vm.runInNewContext(ts.transpileModule(read('src/TowerPlacer.ts'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText, {
        exports: exportsObject,
        require: name => {
            assert.ok(ports[name], `unexpected runtime dependency: ${name}`);
            return ports[name];
        },
    });
    return {
        placer: exportsObject.towerPlacer,
        handlers,
        messages,
        clickCell(i, j) {
            controls.mouse = {x: i * TILE_SIZE + TILE_SIZE / 2, y: j * TILE_SIZE + TILE_SIZE / 2};
            handlers.click();
        },
    };
}

function towerInfo(overrides = {}) {
    return {
        id: '2:2', type: 'canon', i: 2, j: 2, level: 1, upgradeCost: 30,
        aimRadius: 100, damage: 25, reloadMs: 400, dps: 62.5, targetInRange: false,
        ...overrides,
    };
}

function fakeActions(towers, upgrade) {
    return {
        upgrades: [],
        buildTower: () => ({ok: false, error: 'CELL_OCCUPIED', message: 'build rejected'}),
        upgradeTower(id) {
            this.upgrades.push(id);
            return upgrade(id);
        },
        getState: () => ({towers}),
    };
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

console.log('TowerPlacer selection & manual upgrade behavior');

test('clicking the map drives the selected-tower state from live engine snapshots', () => {
    const towers = [towerInfo(), towerInfo({id: '4:1', i: 4, j: 1, type: 'slow', damage: 0, dps: 0, reloadMs: 0})];
    const {placer, clickCell, handlers} = loadTowerPlacer('human');
    const actions = fakeActions(towers, () => { throw new Error('selection must not upgrade'); });
    const selections = [];
    placer.setActions(actions);
    placer.setSelectionListener(tower => selections.push(tower));

    assert.deepStrictEqual(selections, [null], 'the panel must start without a selection');

    clickCell(2, 2);
    assert.strictEqual(selections.at(-1), towers[0], 'a click on a tower must select it');

    clickCell(4, 1);
    assert.strictEqual(selections.at(-1), towers[1], 'clicking another tower must switch the selection');

    clickCell(0, 0);
    assert.strictEqual(selections.at(-1), null, 'clicking an empty cell must clear the selection');

    clickCell(4, 1);
    handlers['keydown:ESCAPE']();
    assert.strictEqual(selections.at(-1), null, 'escape must clear the selection');
});

test('a successful upgrade goes through GameActions once and republishes fresh stats', () => {
    const towers = [towerInfo()];
    const actions = fakeActions(towers, id => {
        // The engine owns the mutation; the UI may only re-read the snapshot.
        const tower = towers.find(item => item.id === id);
        tower.level += 1;
        tower.damage *= 1.5;
        tower.upgradeCost = 45;
        return {ok: true, data: {level: tower.level, upgradeCost: 30}, message: 'UPGRADED 2:2'};
    });
    const {placer, messages, clickCell} = loadTowerPlacer('human');
    const selections = [];
    placer.setActions(actions);
    placer.setSelectionListener(tower => selections.push(tower));
    clickCell(2, 2);

    const result = placer.upgradeSelected();

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(actions.upgrades, ['2:2'], 'the request must hit GameActions.upgradeTower exactly once');
    assert.strictEqual(messages.at(-1), 'UPGRADED 2:2', 'the action result must surface as snackbar feedback');
    const refreshed = selections.at(-1);
    assert.strictEqual(refreshed, towers[0]);
    assert.strictEqual(refreshed.level, 2, 'the panel must show the new level');
    assert.strictEqual(refreshed.damage, 37.5, 'the panel must show the upgraded damage');
    assert.strictEqual(refreshed.upgradeCost, 45, 'the panel must show the next cost, not the charged one');
});

test('rejected upgrades keep the selection and report the reason', () => {
    for (const failure of [
        {ok: false, error: 'ALREADY_MAX_LEVEL', message: '2:2 is already at max level'},
        {ok: false, error: 'INSUFFICIENT_FUNDS', message: 'not enough resources for 2:2'},
    ]) {
        const towers = [towerInfo()];
        const actions = fakeActions(towers, () => failure);
        const {placer, messages, clickCell} = loadTowerPlacer('human');
        const selections = [];
        placer.setActions(actions);
        placer.setSelectionListener(tower => selections.push(tower));
        clickCell(2, 2);
        selections.length = 0;

        const result = placer.upgradeSelected();

        assert.deepStrictEqual(result, failure);
        assert.strictEqual(messages.at(-1), failure.message, 'the rejection reason must reach the snackbar');
        assert.deepStrictEqual(selections, [towers[0]],
            'a surviving tower must stay selected so the panel can explain the blocked upgrade');
    }
});

test('upgrading a selection whose tower no longer exists clears the panel with feedback', () => {
    const towers = [towerInfo()];
    const actions = fakeActions(towers, () => ({ok: false, error: 'TOWER_NOT_FOUND', message: 'no tower at 2:2'}));
    const {placer, messages, clickCell} = loadTowerPlacer('human');
    const selections = [];
    placer.setActions(actions);
    placer.setSelectionListener(tower => selections.push(tower));
    clickCell(2, 2);

    towers.length = 0; // The engine dropped the tower between selection and the request.
    const result = placer.upgradeSelected();

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'TOWER_NOT_FOUND');
    assert.strictEqual(messages.at(-1), 'no tower at 2:2');
    assert.strictEqual(selections.at(-1), null, 'a vanished tower must not keep the panel open');
});

test('entering placement closes the selection and escape unblocks future selections', () => {
    const towers = [towerInfo()];
    const actions = fakeActions(towers, () => { throw new Error('placement must not upgrade'); });
    const {placer, clickCell, handlers} = loadTowerPlacer('human');
    const selections = [];
    placer.setActions(actions);
    placer.setSelectionListener(tower => selections.push(tower));
    clickCell(2, 2);
    assert.strictEqual(selections.at(-1), towers[0]);

    placer.place(class {});
    assert.strictEqual(selections.at(-1), null, 'deploying a new tower must close the panel');

    handlers['keydown:ESCAPE']();
    clickCell(2, 2);
    assert.strictEqual(selections.at(-1), towers[0], 'a cancelled placement must not block later selections');
});

test('AI mode never wires manual upgrades to the player', () => {
    const towers = [towerInfo()];
    const actions = fakeActions(towers, () => { throw new Error('AI mode must not call upgradeTower'); });
    const {placer, handlers, messages} = loadTowerPlacer('ai');
    const selections = [];
    placer.setActions(actions);
    placer.setSelectionListener(tower => selections.push(tower));

    assert.deepStrictEqual(Object.keys(handlers), [], 'AI mode must not bind click or escape handlers');
    assert.strictEqual(placer.upgradeSelected(), null, 'manual upgrades must be a no-op in AI mode');
    assert.deepStrictEqual(actions.upgrades, [], 'no upgrade request may reach the engine in AI mode');
    assert.deepStrictEqual(selections, [null], 'AI mode must keep the selected-tower panel empty');
    assert.deepStrictEqual(messages, [], 'AI mode must not surface upgrade feedback');
});

console.log('All human tower upgrade tests passed.');
