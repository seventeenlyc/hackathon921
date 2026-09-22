const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
  'src/assets/entities/terrain/rock.png'
];

const renderers = [
  'src/entities/enemies/Enemy.ts',
  'src/entities/towers/Tower.ts',
  'src/entities/terrain/Rock.ts'
];

for (const relativePath of textureFiles) {
  assert.ok(
    fs.existsSync(path.join(projectRoot, relativePath)),
    `Missing external texture: ${relativePath}`
  );
}

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
