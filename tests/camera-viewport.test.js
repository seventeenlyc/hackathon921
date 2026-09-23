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
const canvasListeners = {};
const dependencies = {
    './Map': { Map: { TILE_SIZE: 100, GRID_W: 10, GRID_H: 5 } },
    './Canvas': { canvas: { getElement: () => canvasElement, on: (name, fn) => { canvasListeners[name] = fn; }, updateTransformMatrix() {} } },
    './Controls': { controls: { mouse: { x: 0, y: 0 }, on: (name, fn) => { listeners[name] = fn; } } },
};
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

const camera = new moduleObj.exports.Camera();
for (let i = 0; i < 20; i++) listeners['wheel:down']();
assert.ok(Math.abs(camera.scaleRatio - 0.7) < 1e-9,
    'zooming out must stop when the full map fits the fixed center viewport');

const translations = [];
camera.process({ translate: (x, y) => translations.push([x, y]), scale() {}, getTransform: () => ({}) });
assert.deepStrictEqual(translations[0], [480, 310], 'the camera must center on map-frame, not the full canvas');

for (let i = 0; i < 20; i++) listeners['wheel:up']();
assert.ok(camera.scaleRatio > 1, 'zooming in has no maximum scale cap');

console.log('Map viewport zoom bounds passed.');
