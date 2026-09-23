const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual tower draw call sites without a DOM or running simulation.
// The shared texture renderer receives the recorded angle through drawTexture.
class TowerPort {
    constructor(x, y, width) {
        this.width = width;
        this.halfWidth = width / 2;
        this.center = {x: x + width / 2, y: y + width / 2};
    }
    drawTexture(ctx, rotation = 0) {
        ctx.sprites.push({path: this.texturePath, rotation});
    }
    draw(ctx) { ctx.rangeCalls++; }
    update() {}
    setCoordinates(x, y) {
        this.center = {x: x + this.halfWidth, y: y + this.halfWidth};
    }
}

const paths = Object.fromEntries(['canon', 'gatling', 'slow', 'sniper', 'laser'].map(name => [name, `${name}.png`]));
const shots = [];
class MunitionPort {
    constructor(target, tower) { this.target = target; this.tower = tower; }
}
const modules = {
    './Tower': {Tower: TowerPort},
    '../../MunitionManager': {munitionManager: {add: shot => shots.push(shot)}},
    '../../EnemyManager': {enemyManager: {getAllInRadius: () => []}},
    '../munitions/BasicBulletMunition': {BasicBulletMunition: MunitionPort},
    '../munitions/SniperBulletMunition': {SniperBulletMunition: MunitionPort},
    '../munitions/LaserMunition': {LaserMunition: MunitionPort},
    '../effects/SlowEffect': {SlowEffect: class {}},
    '../../tools/texturePaths': {texturePaths: {towers: paths}},
};

function loadTower(name) {
    const exportsObject = {};
    const source = fs.readFileSync(`src/entities/towers/${name}.ts`, 'utf8');
    const compiled = ts.transpileModule(source, {
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

const CanonTower = loadTower('CanonTower');
modules['./CanonTower'] = {CanonTower};
const towers = [
    ['canon', CanonTower],
    ['gatling', loadTower('GatlingTower')],
    ['slow', loadTower('SlowTower')],
    ['sniper', loadTower('SniperTower')],
    ['laser', loadTower('LaserTower')],
];

for (const [type, TowerClass] of towers) {
    const tower = new TowerClass(0, 0, 40);
    for (const target of [{x: tower.center.x + 50, y: tower.center.y}, {x: tower.center.x, y: tower.center.y + 50}, undefined]) {
        tower.target = target;
        tower.update();
        const ctx = {sprites: [], rangeCalls: 0};
        tower.draw(ctx);
        assert.equal(ctx.sprites.length, 1, `${type} must draw one sprite`);
        assert.equal(ctx.sprites[0].path, `${type}.png`, `${type} must keep its texture`);
        assert.equal(ctx.sprites[0].rotation, 0, `${type} sprite must remain upright while targeting`);
        assert.equal(ctx.rangeCalls, 1, `${type} must still draw the selection/range overlay`);
    }
    if (type !== 'slow') {
        const target = {x: tower.center.x + 50, y: tower.center.y + 50};
        tower.target = target;
        const before = shots.length;
        if (type === 'laser') tower.onNewTargetInRange();
        else tower.shoot();
        assert.equal(shots.length, before + 1, `${type} must still fire`);
        assert.equal(shots.at(-1).target, target, `${type} must still aim its munition at the target`);
    }
    console.log(`  ok  ${type} texture stays upright, even when the target moves`);
}
console.log('All tower orientation tests passed.');
