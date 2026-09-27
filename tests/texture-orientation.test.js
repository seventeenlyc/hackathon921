const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const textures = [];
const texturePaths = Object.fromEntries(
    ['canon', 'gatling', 'slow', 'sniper', 'laser'].map(name => [name, `${name}.png`])
);
// The forward muzzle direction in each source PNG, measured from the sprite center.
const muzzleAngles = {
    canon: -Math.PI / 2,
    gatling: -Math.PI / 2,
    sniper: -Math.PI / 2,
    laser: -Math.PI / 2,
};
const shots = [];

const enemyManager = {
    entities: [],
    getClosestPointInRadius(x, y, radius) {
        let closest;
        let shortestDistanceSquared = radius * radius;
        for (const enemy of this.entities) {
            const dx = enemy.x - x;
            const dy = enemy.y - y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared <= shortestDistanceSquared) {
                shortestDistanceSquared = distanceSquared;
                closest = enemy;
            }
        }
        return closest;
    },
    getAllInRadius() {
        return this.entities;
    },
};

class GridRenderablePort {
    constructor(i, j, width) {
        this.i = i;
        this.j = j;
        this.width = width;
        this.isHovered = false;
        this.setCoordinates(i * width, j * width);
    }
    update() {}
    setCoordinates(x, y) {
        this.x = x;
        this.y = y;
        this.halfWidth = this.width / 2;
        this.center = {x: x + this.halfWidth, y: y + this.halfWidth};
    }
}

class MunitionPort {
    constructor(target, tower) {
        this.target = target;
        this.tower = tower;
    }
}

const modules = {
    '../../interfaces/GridRenderable': {GridRenderable: GridRenderablePort},
    '../../config.json': {fps: 30},
    '../../tools/helphers': {
        euclideanDistanceSquared: (x1, y1, x2, y2) => (x2 - x1) ** 2 + (y2 - y1) ** 2,
    },
    '../../EnemyManager': {enemyManager},
    '../../tools/constants': {PI2: Math.PI * 2},
    '../../tools/TextureManager': {
        textureManager: {
            draw(ctx, path, x, y, width, height, rotation = 0) {
                ctx.sprites.push({path, rotation});
                textures.push({path, rotation});
            },
        },
    },
    '../../items/NaturalOil': {
        attackClockDelta: delta => delta,
        naturalOilController: {attackSpeedMultiplier: 1},
    },
    '../../items/TacticalItems': {tacticalItemsController: {attackSpeedMultiplier: 1}},
    '../../i18n': {t: key => key},
    '../../MunitionManager': {munitionManager: {add: shot => shots.push(shot)}},
    '../../tools/texturePaths': {texturePaths: {towers: texturePaths}},
    '../munitions/BasicBulletMunition': {BasicBulletMunition: MunitionPort},
    '../munitions/SniperBulletMunition': {SniperBulletMunition: MunitionPort},
    '../munitions/LaserMunition': {LaserMunition: MunitionPort},
    '../effects/SlowEffect': {SlowEffect: class SlowEffect {}},
};

function loadModule(relativePath, exportName) {
    const exportsObject = {};
    const source = fs.readFileSync(relativePath, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText;
    vm.runInNewContext(compiled, {
        exports: exportsObject,
        require: path => {
            assert.ok(modules[path], `Unexpected dependency in ${relativePath}: ${path}`);
            return modules[path];
        },
    });
    return exportsObject[exportName];
}

modules['./Tower'] = {Tower: loadModule('src/entities/towers/Tower.ts', 'Tower')};
const CanonTower = loadModule('src/entities/towers/CanonTower.ts', 'CanonTower');
modules['./CanonTower'] = {CanonTower};

const towers = [
    ['canon', CanonTower],
    ['gatling', loadModule('src/entities/towers/GatlingTower.ts', 'GatlingTower')],
    ['sniper', loadModule('src/entities/towers/SniperTower.ts', 'SniperTower')],
    ['laser', loadModule('src/entities/towers/LaserTower.ts', 'LaserTower')],
];

function makeEnemy(x, y) {
    return {x, y, alive: true, addEffect() {}};
}

function drawSprite(tower) {
    const ctx = {sprites: []};
    tower.draw(ctx);
    assert.equal(ctx.sprites.length, 1, `${tower.name} must draw one sprite`);
    return ctx.sprites[0];
}

function assertNear(actual, expected, message) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

for (const [type, TowerClass] of towers) {
    enemyManager.entities = [];
    const tower = new TowerClass(0, 0, 40);
    tower.canShoot = false;
    const closest = makeEnemy(tower.center.x, tower.center.y + 20);
    const farther = makeEnemy(tower.center.x + 35, tower.center.y);
    enemyManager.entities.push(farther, closest);

    tower.update();
    assert.equal(tower.target, closest, `${type} must use the nearest in-range enemy`);
    const maxStep = Math.PI * 2 / 30;
    let sprite = drawSprite(tower);
    assert.equal(sprite.path, `${type}.png`, `${type} keeps its texture`);
    assertNear(sprite.rotation, maxStep - muzzleAngles[type], `${type} aligns its muzzle while turning`);

    for (let frame = 1; frame < 8; frame++) tower.update();
    sprite = drawSprite(tower);
    assert.equal(sprite.path, `${type}.png`, `${type} keeps its texture while tracking`);
    assertNear(sprite.rotation, Math.PI / 2 - muzzleAngles[type], `${type} smoothly points its muzzle at the target`);
    const muzzle = tower.getMuzzlePosition();
    assertNear(
        Math.atan2(muzzle.y - tower.center.y, muzzle.x - tower.center.x),
        Math.PI / 2,
        `${type} projectile origin remains aligned with its barrel`
    );

    const beforeShot = shots.length;
    if (type === 'laser') tower.onNewTargetInRange();
    else tower.shoot();
    assert.equal(shots.length, beforeShot + 1, `${type} must still fire`);
    assert.equal(shots.at(-1).target, closest, `${type} still fires at its selected target`);
    console.log(`  ok  ${type} smoothly tracks the nearest in-range enemy`);
}

// Turning across the -PI/PI boundary takes the short path and retains its facing
// after the target leaves the battlefield.
enemyManager.entities = [];
const canon = new CanonTower(0, 0, 40);
canon.canShoot = false;
const target = makeEnemy(canon.center.x + 20, canon.center.y);
canon.target = target;
canon.targetInRange = true;
const radians = degrees => degrees * Math.PI / 180;
target.x = canon.center.x + 20 * Math.cos(radians(170));
target.y = canon.center.y + 20 * Math.sin(radians(170));
for (let frame = 0; frame < 15; frame++) canon.update();
const beforeWrap = drawSprite(canon).rotation;
target.x = canon.center.x + 20 * Math.cos(radians(-170));
target.y = canon.center.y + 20 * Math.sin(radians(-170));
canon.update();
const afterWrap = drawSprite(canon).rotation;
assert.ok(afterWrap > beforeWrap, 'crossing the angle boundary must turn along the short positive path');
assert.ok(afterWrap - beforeWrap <= Math.PI * 2 / 30 + 1e-9, 'the boundary turn must stay within one frame');
target.alive = false;
enemyManager.entities = [];
canon.update();
assertNear(drawSprite(canon).rotation, afterWrap, 'a tower without a target keeps its last facing');
console.log('  ok  short-path wraparound and idle facing');

enemyManager.entities = [makeEnemy(20, 40)];
const slow = new (loadModule('src/entities/towers/SlowTower.ts', 'SlowTower'))(0, 0, 40);
slow.update();
assertNear(drawSprite(slow).rotation, 0, 'Slower remains an omnidirectional tower');
console.log('  ok  slow tower remains omnidirectional');

console.log(`All tower tracking tests passed (${textures.length} rendered frames).`);
