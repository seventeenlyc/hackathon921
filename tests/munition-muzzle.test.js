const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

class RenderablePort {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
}

const tacticalItemsController = {damageMultiplier: 1};
const modules = {
    '../../interfaces/Renderable': {Renderable: RenderablePort},
    '../../tools/constants': {PI2: Math.PI * 2},
    '../../items/TacticalItems': {tacticalItemsController},
    '../../config.json': {fps: 30},
};

function loadModule(relativePath, exportName) {
    const exportsObject = {};
    const compiled = ts.transpileModule(fs.readFileSync(relativePath, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText;
    vm.runInNewContext(compiled, {
        exports: exportsObject,
        require: dependency => {
            assert.ok(modules[dependency], `Unexpected dependency in ${relativePath}: ${dependency}`);
            return modules[dependency];
        },
    });
    return exportsObject[exportName];
}

modules['./Munition'] = {Munition: loadModule('src/entities/munitions/Munition.ts', 'Munition')};
modules['./BasicBulletMunition'] = {
    BasicBulletMunition: loadModule('src/entities/munitions/BasicBulletMunition.ts', 'BasicBulletMunition'),
};
const SniperBulletMunition = loadModule('src/entities/munitions/SniperBulletMunition.ts', 'SniperBulletMunition');
const LaserMunition = loadModule('src/entities/munitions/LaserMunition.ts', 'LaserMunition');
const BasicBulletMunition = modules['./BasicBulletMunition'].BasicBulletMunition;

let muzzle = {x: 37, y: 61};
const emitter = {
    center: {x: 20, y: 30},
    colors: {primary: '#fff'},
    damage: 10,
    reloadDurationMs: 1000,
    targetInRange: true,
    getMuzzlePosition() { return muzzle; },
};
const target = {x: 100, y: 120, alive: true, takeDamage() {}};

function assertStartsAtMuzzle(munition, kind) {
    assert.deepEqual([munition.x, munition.y], [muzzle.x, muzzle.y], `${kind} starts at the emitter muzzle`);
}

const bullet = new BasicBulletMunition(target, emitter);
assertStartsAtMuzzle(bullet, 'ordinary bullet');

const sniper = new SniperBulletMunition(target, emitter);
assertStartsAtMuzzle(sniper, 'sniper shot');
muzzle = {x: 41, y: 67};
let sniperStart;
sniper.draw({
    beginPath() {},
    moveTo(x, y) { sniperStart = [x, y]; },
    lineTo() {},
    stroke() {},
});
assert.deepEqual(sniperStart, [muzzle.x, muzzle.y], 'sniper trace follows the emitter muzzle');

const laser = new LaserMunition(target, emitter);
assertStartsAtMuzzle(laser, 'laser beam');
let laserStart;
laser.draw({
    beginPath() {},
    moveTo(x, y) { laserStart = [x, y]; },
    lineTo() {},
    stroke() {},
});
assert.deepEqual(laserStart, [muzzle.x, muzzle.y], 'laser beam follows the emitter muzzle');

console.log('All projectile muzzle tests passed.');
