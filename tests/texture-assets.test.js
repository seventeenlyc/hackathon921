const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');

const textureFiles = [
  'src/assets/entities/enemies/simple.webp',
  'src/assets/entities/enemies/fast.webp',
  'src/assets/entities/enemies/armored.webp',
  'src/assets/entities/enemies/healer.webp',
  'src/assets/entities/enemies/boss.webp',
  'src/assets/entities/towers/canon.webp',
  'src/assets/entities/towers/gatling.webp',
  'src/assets/entities/towers/slow.webp',
  'src/assets/entities/towers/sniper.webp',
  'src/assets/entities/towers/laser.webp',
  'src/assets/entities/home/home.webp',
  'src/assets/entities/home/enermy.webp',
  'src/assets/obstacles/obstacle_01.webp',
  'src/assets/obstacles/obstacle_02.webp',
  'src/assets/obstacles/obstacle_03.webp',
  'src/assets/obstacles/obstacle_04.webp',
  'src/assets/obstacles/obstacle_05.webp',
  'src/assets/obstacles/obstacle_06.webp',
  'src/assets/obstacles/tianji-rock.webp'
];

for (const role of ['simple', 'fast', 'armored', 'healer', 'boss']) {
  for (const direction of ['right', 'down', 'left']) {
    textureFiles.push('src/assets/entities/enemies/' + role + '-' + direction + '.webp');
  }
}

const renderers = [
  'src/entities/enemies/Enemy.ts',
  'src/entities/towers/Tower.ts',
  'src/entities/terrain/Base.ts',
  'src/entities/terrain/Rock.ts'
];

const {readRasterSize} = require('./helpers/raster-size');
function readTextureSize(relativePath) {
  return readRasterSize(fs.readFileSync(path.join(projectRoot, relativePath)));
}

for (const relativePath of textureFiles) {
  assert.ok(
    fs.existsSync(path.join(projectRoot, relativePath)),
    `Missing external texture: ${relativePath}`
  );
  if (relativePath.startsWith('src/assets/entities/towers/') ||
      relativePath.startsWith('src/assets/entities/enemies/') ||
      relativePath.startsWith('src/assets/obstacles/')) {
    const {width, height} = readTextureSize(relativePath);
    assert.ok(width > 0 && height > 0, `${relativePath} has a degenerate raster size`);
  }
}

// Keep source-design → runtime-role mappings and distinctness pinned (issue #67).
const sprites = [
  // Source: tower art in catalogue order.
  ['towers', 'canon', 'CanonTower', 'canonTower', 256, 256],
  ['towers', 'gatling', 'GatlingTower', 'gatlingTower', 256, 256],
  ['towers', 'slow', 'SlowTower', 'slowTower', 256, 256],
  ['towers', 'sniper', 'SniperTower', 'sniperTower', 256, 256],
  ['towers', 'laser', 'LaserTower', 'laserTower', 256, 256],
  // Source: enemy art in catalogue order.
  ['enemies', 'simple', 'SimpleEnemy', 'simpleEnemy', 256, 256],
  ['enemies', 'fast', 'FastEnemy', 'fastEnemy', 256, 256],
  ['enemies', 'armored', 'ArmoredEnemy', 'armoredEnemy', 256, 256],
  ['enemies', 'healer', 'HealerEnemy', 'healerEnemy', 256, 256],
  ['enemies', 'boss', 'BossEnemy', 'bossEnemy', 256, 256]
];
const texturePathsSource = fs.readFileSync(path.join(projectRoot, 'src/tools/texturePaths.ts'), 'utf8');
const hashes = new Set();
for (const [group, role, entity, imported, width, height] of sprites) {
  const relativePath = `src/assets/entities/${group}/${role}.webp`;
  assert.deepEqual(readTextureSize(relativePath), {width, height}, `Wrong art for ${group}.${role}`);
  assert.ok(texturePathsSource.includes(`import ${imported} from '../assets/entities/${group}/${role}.webp'`),
    `${group}.${role} must import its named runtime sprite`);
  assert.ok(texturePathsSource.includes(`${role}: ${imported}`),
    `${group}.${role} must bind its named runtime sprite`);
  const entitySource = fs.readFileSync(path.join(projectRoot, `src/entities/${group}/${entity}.ts`), 'utf8');
  assert.ok(entitySource.includes(`texturePaths.${group}.${role}`),
    `${entity} must use the ${role} texture binding`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(projectRoot, relativePath))).digest('hex');
  assert.ok(!hashes.has(hash), `Duplicate texture bytes: ${relativePath}`);
  hashes.add(hash);
}
assert.equal(hashes.size, 10, 'expected ten distinct runtime sprites');

for (const role of ['simple', 'fast', 'armored', 'healer', 'boss']) {
  for (const direction of ['right', 'down', 'left']) {
    const relativePath = `src/assets/entities/enemies/${role}-${direction}.webp`;
    assert.deepEqual(readTextureSize(relativePath), {width: 256, height: 256});
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(projectRoot, relativePath))).digest('hex');
    assert.ok(!hashes.has(hash), `Duplicate direction art: ${relativePath}`);
    hashes.add(hash);
  }
}
assert.equal(hashes.size, 25, 'five towers and twenty distinct enemy direction sprites');

for (const relativePath of renderers) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
  assert.match(
    source,
    /textureManager\.draw/,
    `${relativePath} must use the shared texture renderer`
  );
}

// Vite copies hashed assets into dist/assets/, so the lookup is recursive
// instead of a flat readdir of dist/.
function listFilesRecursively(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(fullPath) : [fullPath];
  });
}

const distFiles = listFilesRecursively(path.join(projectRoot, 'dist')).map(file => path.basename(file));
// Keep the compression savings and the complete deployed runtime set reviewable.
const compression = JSON.parse(fs.readFileSync(path.join(projectRoot, 'docs/texture-compression.json'), 'utf8'));
assert.equal(compression.assets.length, 42);
assert.ok(compression.bytes <= 1000000, 'all runtime images must stay within a 1 MB budget');
assert.ok(compression.bytes < compression.previousBytes * 0.05, 'save at least 95% against the previous image payload');
let totalBytes = 0;
for (const asset of compression.assets) {
  const bytes = fs.readFileSync(path.join(projectRoot, asset.path));
  assert.equal(bytes.length, asset.bytes, `Size changed: ${asset.path}`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  assert.deepEqual(readRasterSize(bytes), {width: asset.width, height: asset.height});
  assert.ok(!fs.existsSync(path.join(projectRoot, asset.source)), 'do not ship duplicate source PNGs');
  const base = path.basename(asset.path, '.webp');
  assert.ok(distFiles.some(file => file.endsWith('.webp') && file.startsWith(base + '-')), `Missing built asset: ${asset.path}`);
  assert.ok(!distFiles.some(file => file.endsWith('.png') && file.startsWith(base + '-')), `Duplicate PNG in build: ${asset.source}`);
  totalBytes += bytes.length;
}
assert.equal(totalBytes, compression.bytes);

for (const relativePath of textureFiles) {
  const fileName = path.basename(relativePath, path.extname(relativePath));
  assert.ok(
    distFiles.some(
      file =>
        file.endsWith(path.extname(relativePath)) && (file === `${fileName}${path.extname(relativePath)}` || file.startsWith(`${fileName}-`))
    ),
    `Bundled build is missing texture: ${fileName}.webp`
  );
}

console.log(`Validated ${textureFiles.length} external textures and ${renderers.length} texture renderers.`);
