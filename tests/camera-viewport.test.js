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
// "Cover" minimum: the map must reach every edge of the frame, so the larger
// ratio wins (height binds in this fixture: frame is wider than the map).
const minimumScale = Math.max(frameRect.width / mapWidth, frameRect.height / mapHeight);

const camera = new moduleObj.exports.Camera();
for (let i = 0; i < 20; i++) listeners['wheel:down']();
assert.ok(Math.abs(camera.scaleRatio - minimumScale) < 1e-9,
    'zooming out must stop at the cover scale where the map still touches every frame edge');
assert.ok(mapHeight * camera.scaleRatio >= frameRect.height - 1e-9,
    'at minimum zoom the rendered map must not be smaller than the frame vertically');
assert.ok(mapWidth * camera.scaleRatio >= frameRect.width - 1e-9,
    'at minimum zoom the rendered map must not be smaller than the frame horizontally');

const translations = [];
const ctx = { translate: (x, y) => translations.push([x, y]), scale() {}, getTransform: () => ({}) };
camera.process(ctx);
assert.deepStrictEqual(translations[0], [480, 310], 'the camera must center on map-frame, not the full canvas');
// Frame is wider than the map, so height binds: vertical slack is zero at min
// zoom and horizontal slack is the overflow on each side.
const horizontalSlack = (mapWidth * camera.scaleRatio - frameRect.width) / 2 / camera.scaleRatio;
assert.deepStrictEqual(translations[1], [-500, -250], 'a centered camera stays centered');

// Dragging at minimum zoom must not pull any map edge inside the frame.
controls.mouse = { x: 100, y: 100 };
listeners['mousedown']();
controls.mouse = { x: -100, y: 100 };
camera.update();
camera.process(ctx);
assert.deepStrictEqual(translations.at(-1), [-500 - horizontalSlack, -250],
    'horizontal drag stops when the map edge reaches the frame edge');
controls.mouse = { x: -100, y: 300 };
camera.update();
camera.process(ctx);
assert.deepStrictEqual(translations.at(-1), [-500 - horizontalSlack, -250],
    'vertical drag is locked at minimum zoom (zero slack axis)');

// Releasing the mouse folds the drag back into the camera position; the view
// must not jump because the coverage clamp applies to the folded state too.
listeners['mouseup']();
camera.process(ctx);
assert.deepStrictEqual(translations.at(-1), [-500 - horizontalSlack, -250],
    'the view stays put after releasing a drag that was clamped');

for (let i = 0; i < 20; i++) listeners['wheel:up']();
assert.ok(camera.scaleRatio > 1, 'zooming in has no maximum scale cap');

console.log('Map viewport zoom bounds passed.');
