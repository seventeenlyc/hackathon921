const enemies = [];
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

class GridRenderable {}
class Base extends GridRenderable {
    constructor(i, j) { super(); this.i = i; this.j = j; this.traversable = true; }
}
class Rock extends GridRenderable {
    constructor(i, j) { super(); this.i = i; this.j = j; this.traversable = false; }
}
class EventEmitter {
    constructor() { this.events = []; }
    emit(event) { this.events.push(event); }
}

const dependencies = {
    './entities/terrain/Base': {Base},
    './interfaces/GridRenderable': {GridRenderable},
    './entities/terrain/Rock': {Rock},
    './tools/astar': {easyAStar: () => [{x: 0, y: 0}]},
    './tools/helphers': {randIndex: () => 0},
    './EnemyManager': {enemyManager: {canAllReachBase: () => true, all: () => enemies}},
    './tools/EventEmitter': {EventEmitter},
    './tools/shapes': {drawRoundedSquare() {}},
    './agent/SpawnRoutes': (() => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'agent', 'SpawnRoutes.ts'), 'utf8');
        const js = ts.transpileModule(source, {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
        }).outputText;
        const exportsObject = {};
        new Function('exports', js)(exportsObject);
        return exportsObject;
    })(),
};
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'Map.ts'), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
}).outputText;
const moduleObject = {exports: {}};
new Function('module', 'exports', 'require', js)(moduleObject, moduleObject.exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency: ${name}`);
    return dependencies[name];
});
const {Map} = moduleObject.exports;

const map = new Map();
function draw() {
    const strokes = [];
    const cells = [];
    const ctx = {
        fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
        stroke() { strokes.push(this.strokeStyle); },
        strokeRect(x, y, w, h) { cells.push({x, y, w, h, color: this.strokeStyle}); },
    };
    map.drawGrid(ctx);
    assert.ok(strokes.length > 0 && strokes.every(color => color === '#ffffff'), 'ordinary grid and perimeter are white');
    return cells;
}
assert.deepEqual(draw(), [], 'empty map has no red cells');
const enemy = {x: 60, y: 100, alive: true};
enemies.push(enemy, {x: 61, y: 101, alive: true});
assert.deepEqual(draw(), [{x: 40, y: 80, w: 40, h: 40, color: '#ff0000'}], 'shared enemy cell is drawn red once');
enemies.pop();
enemy.x = 80;
assert.deepEqual(draw(), [{x: 80, y: 80, w: 40, h: 40, color: '#ff0000'}], 'movement replaces the highlighted cell at the boundary');
enemy.alive = false;
assert.deepEqual(draw(), [], 'dead enemy leaves no highlight');
enemies.push(...[-1, NaN, Infinity, Map.GRID_W * Map.TILE_SIZE].map(x => ({x, y: 20, alive: true})));
enemies.push({x: 20, y: -1, alive: true}, {x: 20, y: Map.GRID_H * Map.TILE_SIZE, alive: true});
assert.deepEqual(draw(), [], 'invalid and out-of-map positions are ignored');
enemies.length = 0;
enemies.push({x: 0, y: 0, alive: true}, {x: Map.GRID_W * 40 - 1, y: Map.GRID_H * 40 - 1, alive: true});
assert.equal(draw().length, 2, 'both corner cells can be highlighted');
console.log('Enemy grid colors passed.');
