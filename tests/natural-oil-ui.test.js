const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const gameSource = read('src/Game.ts');
const styles = read('src/styles/styles.less');

function loadSource(file, dependencies, globals = {}) {
    const js = ts.transpileModule(read(file), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
    }).outputText;
    const loaded = {exports: {}};
    const names = ['module', 'exports', 'require', ...Object.keys(globals)];
    const values = [loaded, loaded.exports, name => {
        if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
        return dependencies[name];
    }, ...Object.values(globals)];
    new Function(...names, js)(...values);
    return loaded.exports;
}

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.listeners = {};
        this.textContent = '';
        this.disabled = false;
        this.hidden = false;
        this.classList = {add() {}, remove() {}};
    }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    setAttribute(name, value) { this[name] = String(value); }
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    click() { if (!this.disabled) for (const listener of this.listeners.click || []) listener(); }
    getContext() { return {}; }
}

class FakeDocument {
    constructor() { this.elements = new Map(); }
    getElementById(id) {
        if (!this.elements.has(id)) this.elements.set(id, new FakeElement(id === 'natural-oil' ? 'button' : 'div'));
        return this.elements.get(id);
    }
    createElement(tagName) { return new FakeElement(tagName); }
    querySelectorAll() { return []; }
}

function mountedInterface() {
    const document = new FakeDocument();
    const i18n = loadSource('src/i18n.ts', {}, {document, location: {search: '?lang=zh'}});
    const {NaturalOilController} = require('../.test-build/items/NaturalOil.js');
    const naturalOilController = new NaturalOilController();
    const cashManager = loadSource('src/CashManager.ts', {
        './config.json': {initialBalance: 200},
    }, {document}).cashManager;
    cashManager.add(2000);
    const listeners = [];
    const gameLoop = {
        state: 'idle', speed: 1,
        onChange(listener) { listeners.push(listener); },
        change(state) { this.state = state; listeners.forEach(listener => listener(state)); },
    };
    class FakeTower {
        constructor() {
            this.name = 'Canon'; this.cost = 50; this.texturePath = 'canon';
        }
        setCoordinates() {}
        draw() {}
    }
    const tower = {CanonTower: FakeTower, GatlingTower: FakeTower, SlowTower: FakeTower,
        SniperTower: FakeTower, LaserTower: FakeTower};
    const dependencies = {
        './../package.json': {version: 'test'},
        './tools/Snackbar': {Snackbar: class {}},
        './entities/towers/LaserTower': {LaserTower: tower.LaserTower},
        './entities/towers/SlowTower': {SlowTower: tower.SlowTower},
        './tools/TextureManager': {textureManager: {onLoaded() {}}},
        './agent/GameLoop': {gameLoop, nextSpeed: () => 1},
        './PlayMode': {playMode: 'ai', otherMode: () => 'human', switchPlayMode() {}},
        './entities/towers/CanonTower': {CanonTower: tower.CanonTower},
        './entities/towers/GatlingTower': {GatlingTower: tower.GatlingTower},
        './entities/towers/SniperTower': {SniperTower: tower.SniperTower},
        './Map': {Map: {TILE_SIZE: 32}},
        './TowerPlacer': {towerPlacer: {place() {}}},
        './ControlLayer': {getControlLayer: () => ({hide() {}})},
        './i18n': i18n,
        './AudioManager': {audioManager: {isMuted: () => false, setMuted() {}, startMusic() {}}},
        './CashManager': {cashManager},
        './items/NaturalOil': {naturalOilController},
    };
    const interfaceManager = loadSource('src/InterfaceManager.ts', dependencies, {document}).interfaceManager;
    return {button: document.getElementById('natural-oil'),
        status: document.getElementById('natural-oil-status'), cashManager,
        naturalOilController, gameLoop, interfaceManager};
}

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
assert.match(gameSource, /for \(let step = 0; step < gameLoop\.speed; \+\+step\) \{[\s\S]*naturalOilController\.update\(1000 \/ fps, gameLoop\.state === 'running'\)/,
    'oil time must advance once per simulation step inside the speed loop');

const ui = mountedInterface();
assert.strictEqual(ui.button.disabled, true, 'item is disabled before RUNNING');
ui.button.click();
assert.strictEqual(ui.cashManager.getBalance(), 2200, 'idle click cannot charge');
assert.strictEqual(ui.naturalOilController.attackSpeedMultiplier, 1, 'idle click cannot activate');
ui.gameLoop.change('running');
assert.strictEqual(ui.button.disabled, false, 'running makes ready item usable');
ui.button.click();
assert.strictEqual(ui.cashManager.getBalance(), 200, 'click charges exactly 2000');
assert.strictEqual(ui.naturalOilController.attackSpeedMultiplier, 1.5);
assert.strictEqual(ui.button.disabled, true, 'active item cannot be bought again');
assert.match(ui.status.textContent, /生效中/);
ui.button.click();
assert.strictEqual(ui.cashManager.getBalance(), 200, 'active click cannot charge again');
ui.naturalOilController.update(5000, true);
ui.interfaceManager.updateNaturalOil();
assert.strictEqual(ui.button.disabled, true, 'cooldown keeps item disabled');
assert.match(ui.status.textContent, /冷却中/);
ui.naturalOilController.update(10000, true);
ui.interfaceManager.updateNaturalOil();
ui.gameLoop.change('planning');
assert.strictEqual(ui.button.disabled, true, 'ready item stays disabled during PLANNING');
ui.gameLoop.change('running');
assert.strictEqual(ui.button.disabled, false, 'item enables again when ready during RUNNING');
assert.strictEqual(ui.cashManager.withdraw(2000), false, 'rejected withdrawal reports failure');
assert.strictEqual(ui.cashManager.getBalance(), 200, 'rejected withdrawal leaves balance alone');
ui.button.click();
assert.strictEqual(ui.cashManager.getBalance(), 200, 'insufficient funds cannot charge');
assert.strictEqual(ui.naturalOilController.attackSpeedMultiplier, 1);
assert.match(ui.status.textContent, /金币不足/);

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

console.log('Natural Oil UI click, state, wallet, and simulation timing assertions passed.');
