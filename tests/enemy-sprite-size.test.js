const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the actual Enemy.draw -> SimpleEnemy.draw path with only canvas/map ports
// replaced. The drawing size may change; the collision radius must not.
const TILE_SIZE = 40;
const draws = [];
const bars = [];
const mapPort = {Map: {TILE_SIZE}, map: {getPathFromGridCell: () => false}};
const paths = {simple: 'simple.png', fast: 'fast.png', armored: 'armored.png', healer: 'healer.png', boss: 'boss.png'};
const modules = {
    '../../interfaces/Renderable': {Renderable: class { constructor(x, y) { this.x = x; this.y = y; } }},
    '../../Map': mapPort,
    '../../config.json': {colors: {enemyBase: {primary: '#f00'}}},
    '../../tools/shapes': {drawRoundedSquare: (ctx, x, y, width, height) => bars.push({x, y, width, height})},
    '../../CashManager': {cashManager: {add() {}}},
    '../../EnemyManager': {enemyManager: {getAllInRadius: () => []}},
    '../effects/HealEffect': {HealEffect: class {}},
    '../../tools/TextureManager': {textureManager: {draw: (ctx, src, x, y, width, height, rotation = 0) => {
        draws.push({src, x, y, width, height, rotation});
        return true;
    }}},
    '../../tools/texturePaths': {texturePaths: {enemies: paths}},
};

function load(name) {
    const exportsObject = {};
    const compiled = ts.transpileModule(fs.readFileSync(`src/entities/enemies/${name}.ts`, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText;
    vm.runInNewContext(compiled, {
        exports: exportsObject,
        require: path => {
            assert.ok(modules[path], `Unexpected dependency in ${name}: ${path}`);
            return modules[path];
        },
    });
    return exportsObject[name];
}

const Enemy = load('Enemy');
modules['./Enemy'] = {Enemy};
const SimpleEnemy = load('SimpleEnemy');
const others = [
    ['fast', load('FastEnemy'), 18.4],
    ['armored', load('ArmoredEnemy'), 18.4],
    ['healer', load('HealerEnemy'), 18.4],
    ['boss', load('BossEnemy'), 36.8],
];
const base = {center: {x: TILE_SIZE / 2, y: TILE_SIZE / 2}};
const ctx = {fill() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}};

const simple = new SimpleEnemy(base);
simple.damageTaken = 10;
simple.draw(ctx);
assert.equal(simple.radius, 8, 'collision radius stays at 8');
assert.equal(simple.speed, 2.5, 'movement speed is unchanged');
assert.equal(draws[0].src, 'simple.png');
assert.equal(draws[0].width, 34.5, 'the small normal enemy display box is enlarged by 15%');
assert.equal(draws[0].height, 34.5, 'the display box preserves the source aspect ratio');
assert.equal(draws[0].rotation, 0, 'the enemy remains upright');
assert.ok(draws[0].width <= TILE_SIZE && draws[0].height <= TILE_SIZE, 'art fits one tile');
assert.equal(bars.length, 2, 'damaged enemy still displays its health bar');
assert.ok(bars.every(bar => bar.y >= simple.y + 15 && bar.y + bar.height <= simple.y + TILE_SIZE / 2),
    'health bar clears the enlarged sprite but stays inside the tile');
console.log('  ok  Simple sprite is readable within one tile; collision, movement and HP bar unchanged');

for (const [role, EnemyClass, size] of others) {
    draws.length = 0;
    new EnemyClass(base).draw(ctx);
    assert.equal(draws[0].src, `${role}.png`);
    assert.equal(draws[0].width, size, `${role} retains its current display size`);
    assert.equal(draws[0].height, size);
}
console.log('  ok  other four enemy textures are enlarged by 15%');
console.log('All enemy sprite size tests passed.');
