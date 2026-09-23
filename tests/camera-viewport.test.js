const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'Camera.ts'), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
const canvasRect = { left: 20, top: 10, width: 1000, height: 800 };
const frameRect = { left: 150, top: 120, width: 700, height: 400 };
const canvasElement = {
    width: canvasRect.width,
    height: canvasRect.height,
    getBoundingClientRect: () => canvasRect,
};
const listeners = {};
const dependencies = {
    './Map': { Map: { TILE_SIZE: 100, GRID_W: 10, GRID_H: 5 } },
    './Canvas': { canvas: { getElement: () => canvasElement, on: () => {}, updateTransformMatrix() {} } },
    './Controls': { controls: { mouse: { x: 0, y: 0 }, on: (name, fn) => { listeners[name] = fn; } } },
};
const controls = dependencies['./Controls'].controls;
const document = { getElementById: id => id === 'map-frame' ? { getBoundingClientRect: () => frameRect } : null };
const moduleObj = { exports: {} };
new Function('module', 'exports', 'require', 'document', js)(
    moduleObj,
    moduleObj.exports,
    name => {
        if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
        return dependencies[name];
    },
    document,
);

const mapWidth = dependencies['./Map'].Map.TILE_SIZE * dependencies['./Map'].Map.GRID_W;
const mapHeight = dependencies['./Map'].Map.TILE_SIZE * dependencies['./Map'].Map.GRID_H;
// "Contain" minimum: the whole map must fit inside the frame, so the smaller
// ratio wins (width binds in this fixture: vertical letterboxing at min zoom).
const minimumScale = Math.min(frameRect.width / mapWidth, frameRect.height / mapHeight);

const camera = new moduleObj.exports.Camera();
for (let i = 0; i < 20; i++) listeners['wheel:down']();
assert.ok(Math.abs(camera.scaleRatio - minimumScale) < 1e-9,
    'zooming out must stop exactly at the contain scale where the whole map fits the frame');
assert.ok(mapWidth * camera.scaleRatio <= frameRect.width + 1e-9,
    'at minimum zoom the rendered map width must not exceed the frame');
assert.ok(mapHeight * camera.scaleRatio <= frameRect.height + 1e-9,
    'at minimum zoom the rendered map height must not exceed the frame');

const translations = [];
const ctx = { translate: (x, y) => translations.push([x, y]), scale() {}, getTransform: () => ({}) };
camera.process(ctx);
assert.deepStrictEqual(translations[0], [480, 310], 'the camera must center on map-frame, not the full canvas');
// Contain 最小缩放下地图居中于扇区框，拖拽完全锁定（两轴都没有余量）。
assert.deepStrictEqual(translations[1], [-500, -250], 'a centered camera stays centered');

controls.mouse = { x: 100, y: 100 };
listeners['mousedown']();
controls.mouse = { x: -100, y: 100 };
camera.update();
camera.process(ctx);
assert.deepStrictEqual(translations.at(-1), [-500, -250],
    'horizontal drag is locked at minimum zoom (the whole map already fits)');
controls.mouse = { x: -100, y: 300 };
camera.update();
camera.process(ctx);
assert.deepStrictEqual(translations.at(-1), [-500, -250],
    'vertical drag is locked at minimum zoom as well');

listeners['mouseup']();
camera.process(ctx);
assert.deepStrictEqual(translations.at(-1), [-500, -250],
    'the view stays put after releasing a locked drag');

for (let i = 0; i < 20; i++) listeners['wheel:up']();
assert.ok(camera.scaleRatio > 1, 'zooming in has no maximum scale cap');

console.log('Map viewport zoom bounds passed.');
