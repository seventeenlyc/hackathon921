const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const OBSTACLE_COUNT = 6;
const obstacleFiles = Array.from(
    {length: OBSTACLE_COUNT},
    (_, k) => `src/assets/obstacles/obstacle_0${k + 1}.png`
);

// ---- The six source PNGs must be valid, non-degenerate and pairwise distinct,
// otherwise two array slots can silently point at the same artwork.
function readPngSize(relativePath) {
    const buffer = fs.readFileSync(path.join(projectRoot, relativePath));
    assert.ok(buffer.length >= 24 && buffer.subarray(12, 16).toString('ascii') === 'IHDR',
        `${relativePath} is not a valid PNG`);
    return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
}

const hashes = new Set();
for (const relativePath of obstacleFiles) {
    const {width, height} = readPngSize(relativePath);
    assert.ok(width > 0 && height > 0, `${relativePath} has a degenerate PNG size`);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(projectRoot, relativePath))).digest('hex');
    assert.ok(!hashes.has(hash), `Duplicate obstacle texture bytes: ${relativePath}`);
    hashes.add(hash);
}
assert.equal(hashes.size, OBSTACLE_COUNT, 'expected six distinct obstacle textures');

// ---- texturePaths.ts must bind all six named imports into terrain.obstacles,
// mirroring the sprite pinning style of texture-assets.test.js.
const texturePathsSource = fs.readFileSync(path.join(projectRoot, 'src/tools/texturePaths.ts'), 'utf8');
for (let k = 1; k <= OBSTACLE_COUNT; ++k) {
    const name = `obstacle${k}`;
    assert.ok(texturePathsSource.includes(`import ${name} from '../assets/obstacles/obstacle_0${k}.png'`),
        `${name} must be statically imported so Vite bundles it`);
    assert.ok(texturePathsSource.includes(`${name},`) || texturePathsSource.includes(`${name}]`),
        `${name} must be listed in terrain.obstacles`);
}

// ---- Load the real Rock.ts with a recorded fake textureManager. The random
// source is injected so the mapping random -> texture is deterministic.
const drawCalls = [];
const fakeTextures = ['t0', 't1', 't2', 't3', 't4', 't5'];
class GridRenderable {
    constructor(i, j, width) {
        this.i = i;
        this.j = j;
        this.width = width;
        this.center = {x: i * width + width / 2, y: j * width + width / 2};
    }
}
const dependencies = {
    '../../interfaces/GridRenderable': {GridRenderable},
    '../../tools/TextureManager': {
        textureManager: {
            draw: (ctx, src, x, y, width, height) => {
                drawCalls.push({src, x, y, width, height});
                return true;
            }
        }
    },
    '../../tools/texturePaths': {texturePaths: {terrain: {obstacles: fakeTextures}}},
};
const source = fs.readFileSync(path.join(projectRoot, 'src/entities/terrain/Rock.ts'), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
}).outputText;
const moduleObject = {exports: {}};
new Function('module', 'exports', 'require', js)(moduleObject, moduleObject.exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency: ${name}`);
    return dependencies[name];
});
const {Rock} = moduleObject.exports;

const TILE = 40;
function rockWithRandom(value) {
    return new Rock(3, 4, TILE, () => value);
}

// The exact floor(value * 6) mapping, one probe per texture slot.
for (let k = 0; k < OBSTACLE_COUNT; ++k) {
    const value = (k + 0.5) / OBSTACLE_COUNT;
    const rock = rockWithRandom(value);
    assert.equal(rock.texturePath, fakeTextures[k],
        `random=${value} must select texture slot ${k}`);
    assert.equal(rock.traversable, false, 'obstacles must keep blocking enemy paths');
}

assert.equal(rockWithRandom(0).texturePath, fakeTextures[0], 'random=0 selects the first texture');

// Each of the six textures is reachable across a uniform sweep, and two rocks
// receiving the same draw of randomness get the same skin.
const seen = new Set();
for (let k = 0; k < OBSTACLE_COUNT * 10; ++k) {
    seen.add(rockWithRandom(k / (OBSTACLE_COUNT * 10)).texturePath);
}
assert.equal(seen.size, OBSTACLE_COUNT, 'a uniform sweep reaches all six textures');
const shared = rockWithRandom(0.42);
assert.equal(shared.texturePath, new Rock(9, 9, TILE, () => 0.42).texturePath,
    'the same random draw always yields the same texture');

// The default (unseeded) constructor still lands inside the texture set.
const defaultRock = new Rock(0, 0, TILE);
assert.ok(fakeTextures.includes(defaultRock.texturePath), 'default randomness picks one of the six textures');

// draw() forwards the chosen texture through the shared renderer, centered on the cell.
const fakeCtx = {};
drawCalls.length = 0;
const drawer = rockWithRandom(0.9);
drawer.draw(fakeCtx);
assert.equal(drawCalls.length, 1, 'draw renders exactly one texture');
assert.equal(drawCalls[0].src, fakeTextures[5], 'draw uses the texture chosen for this instance');
assert.equal(drawCalls[0].x, 3 * TILE + TILE / 2, 'draw is centered horizontally on the cell');
assert.equal(drawCalls[0].y, 4 * TILE + TILE / 2, 'draw is centered vertically on the cell');
assert.equal(drawCalls[0].width, TILE, 'draw fills the whole tile width');
assert.equal(drawCalls[0].height, TILE, 'draw fills the whole tile height');

// A theme can override only the artwork; random selection and blocking remain.
dependencies['../../tools/texturePaths'].texturePaths.terrain.artwork = 'tianji-rock';
drawCalls.length = 0;
drawer.draw(fakeCtx);
assert.equal(drawCalls[0].src, 'tianji-rock');
assert.equal(drawer.texturePath, fakeTextures[5]);
assert.equal(drawer.traversable, false);
assert.equal(drawCalls[0].width, TILE);

console.log('Obstacle texture randomization and theme rendering passed.');
