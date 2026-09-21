const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const textureFiles = [
  'public/img/entities/enemies/simple.png',
  'public/img/entities/enemies/fast.png',
  'public/img/entities/enemies/armored.png',
  'public/img/entities/enemies/healer.png',
  'public/img/entities/enemies/boss.png',
  'public/img/entities/towers/canon.png',
  'public/img/entities/towers/gatling.png',
  'public/img/entities/towers/slow.png',
  'public/img/entities/towers/sniper.png',
  'public/img/entities/towers/laser.png',
  'public/img/entities/terrain/rock.png'
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

const distFiles = fs.readdirSync(path.join(projectRoot, 'dist'));
for (const relativePath of textureFiles) {
  const fileName = path.basename(relativePath, path.extname(relativePath));
  assert.ok(
    distFiles.some(file => file.startsWith(`${fileName}.`) && file.endsWith('.png')),
    `Bundled build is missing texture: ${fileName}.png`
  );
}

console.log(`Validated ${textureFiles.length} external textures and ${renderers.length} texture renderers.`);
