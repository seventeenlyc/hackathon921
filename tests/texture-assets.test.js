const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');

const textureFiles = [
  'src/assets/entities/enemies/simple.png',
  'src/assets/entities/enemies/fast.png',
  'src/assets/entities/enemies/armored.png',
  'src/assets/entities/enemies/healer.png',
  'src/assets/entities/enemies/boss.png',
  'src/assets/entities/towers/canon.png',
  'src/assets/entities/towers/gatling.png',
  'src/assets/entities/towers/slow.png',
  'src/assets/entities/towers/sniper.png',
  'src/assets/entities/towers/laser.png',
  'src/assets/entities/home/home.png',
  'src/assets/entities/home/enermy.png',
  'src/assets/obstacles/obstacle_01.png',
  'src/assets/obstacles/obstacle_02.png',
  'src/assets/obstacles/obstacle_03.png',
  'src/assets/obstacles/obstacle_04.png',
  'src/assets/obstacles/obstacle_05.png',
  'src/assets/obstacles/obstacle_06.png',
  'src/assets/obstacles/tianji-rock.png'
];

for (const role of ['simple', 'fast', 'armored', 'healer', 'boss']) {
  for (const direction of ['right', 'down', 'left']) {
    textureFiles.push('src/assets/entities/enemies/' + role + '-' + direction + '.png');
  }
}

const renderers = [
  'src/entities/enemies/Enemy.ts',
  'src/entities/towers/Tower.ts',
  'src/entities/terrain/Base.ts',
  'src/entities/terrain/Rock.ts'
];

// Read the IHDR chunk (PNG bytes 16..24) so a degenerate / zero-byte file is
// caught here rather than turning into a silent missing-texture at runtime.
function readPngSize(relativePath) {
  const buffer = fs.readFileSync(path.join(projectRoot, relativePath));
  assert.ok(buffer.length >= 24 && buffer.subarray(12, 16).toString('ascii') === 'IHDR',
    `${relativePath} is not a valid PNG`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return {width, height};
}

for (const relativePath of textureFiles) {
  assert.ok(
    fs.existsSync(path.join(projectRoot, relativePath)),
    `Missing external texture: ${relativePath}`
  );
  if (relativePath.startsWith('src/assets/entities/towers/') ||
      relativePath.startsWith('src/assets/entities/enemies/') ||
      relativePath.startsWith('src/assets/obstacles/')) {
    const {width, height} = readPngSize(relativePath);
    assert.ok(width > 0 && height > 0, `${relativePath} has a degenerate PNG size`);
  }
}

// Keep source-design → runtime-role mappings and distinctness pinned (issue #67).
const sprites = [
  // Source: tower art in catalogue order.
  ['towers', 'canon', 'CanonTower', 'canonTower', 1254, 1254],
  ['towers', 'gatling', 'GatlingTower', 'gatlingTower', 1254, 1254],
  ['towers', 'slow', 'SlowTower', 'slowTower', 1254, 1254],
  ['towers', 'sniper', 'SniperTower', 'sniperTower', 1254, 1254],
  ['towers', 'laser', 'LaserTower', 'laserTower', 1254, 1254],
  // Source: enemy art in catalogue order.
  ['enemies', 'simple', 'SimpleEnemy', 'simpleEnemy', 1254, 1254],
  ['enemies', 'fast', 'FastEnemy', 'fastEnemy', 1254, 1254],
  ['enemies', 'armored', 'ArmoredEnemy', 'armoredEnemy', 1254, 1254],
  ['enemies', 'healer', 'HealerEnemy', 'healerEnemy', 1254, 1254],
  ['enemies', 'boss', 'BossEnemy', 'bossEnemy', 1254, 1254]
];
const texturePathsSource = fs.readFileSync(path.join(projectRoot, 'src/tools/texturePaths.ts'), 'utf8');
const hashes = new Set();
for (const [group, role, entity, imported, width, height] of sprites) {
  const relativePath = `src/assets/entities/${group}/${role}.png`;
  assert.deepEqual(readPngSize(relativePath), {width, height}, `Wrong art for ${group}.${role}`);
  assert.ok(texturePathsSource.includes(`import ${imported} from '../assets/entities/${group}/${role}.png'`),
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
    const relativePath = `src/assets/entities/enemies/${role}-${direction}.png`;
    assert.deepEqual(readPngSize(relativePath), {width: 1254, height: 1254});
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
for (const relativePath of textureFiles) {
  const fileName = path.basename(relativePath, path.extname(relativePath));
  assert.ok(
    distFiles.some(
      file =>
        file.endsWith('.png') && (file === `${fileName}.png` || file.startsWith(`${fileName}-`))
    ),
    `Bundled build is missing texture: ${fileName}.png`
  );
}

console.log(`Validated ${textureFiles.length} external textures and ${renderers.length} texture renderers.`);
