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
    './EnemyManager': {enemyManager: {canAllReachBase: () => true}},
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
assert.equal(map.enemyBases.length, 1, 'the initial wave uses one active spawn');
for (const point of Map.SPAWN_POINTS) {
    assert.equal(map.canBePlaced(point.i, point.j), false,
        `spawn (${point.i}, ${point.j}) stays reserved before activation`);
}

const fourth = Map.SPAWN_POINTS[3];
const checked = [];
map.pathFind = (i, j) => {
    checked.push(`${i}:${j}`);
    return i === fourth.i && j === fourth.j ? false : [{x: i, y: j}];
};
assert.equal(map.canBePlaced(10, 10), false, 'a blocked future spawn route rejects placement');
assert.ok(checked.includes(`${fourth.i}:${fourth.j}`), 'placement checks the fourth route');
assert.equal(map.grid[10][10], 0, 'the rejected probe restores the candidate cell');
map.pathFind = (i, j) => [{x: i, y: j}];
assert.equal(map.canBePlaced(10, 10), true, 'an ordinary non-blocking cell remains placeable');

const second = Map.SPAWN_POINTS[1];
map.grid[second.i][second.j] = new Rock(second.i, second.j);
assert.equal(map.setSpawnCount(2), 2, 'a Rock is cleared when its lane activates');
assert.ok(map.grid[second.i][second.j] instanceof Base);
const third = Map.SPAWN_POINTS[2];
map.grid[third.i][third.j] = {traversable: false};
assert.throws(() => map.setSpawnCount(3), {message: 'SPAWN_ROUTE_UNREACHABLE'},
    'an occupied spawn cannot silently reduce the requested lane count');
assert.equal(map.enemyBases.length, 2, 'failed activation leaves the lane count unchanged');
map.grid[third.i][third.j] = 0;
assert.equal(map.setSpawnCount(4), 4, 'all four reserved points can become active lanes');
assert.ok(map.events.includes('added'), 'lane activation still notifies active enemies');

console.log('Map future spawn routes passed.');
