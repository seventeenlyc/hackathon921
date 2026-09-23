const assert = require('assert/strict');
const fs = require('fs');
const ts = require('typescript');

// ---- Load Camera.ts with the same DOM mock pattern as camera-viewport.test.js
const cameraSource = fs.readFileSync('src/Camera.ts', 'utf8');
const cameraJs = ts.transpileModule(cameraSource, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
}).outputText;
const canvasRect = {left: 0, top: 0, width: 1200, height: 800};
const frameRect = {left: 324, top: 64, width: 552, height: 518}; // matches default map-frame insets
const canvasElement = {
    width: canvasRect.width, height: canvasRect.height,
    getBoundingClientRect: () => canvasRect,
    clientWidth: canvasRect.width, clientHeight: canvasRect.height,
};
const camListeners = {};
const camDeps = {
    './Map': {Map: {TILE_SIZE: 40, GRID_W: 61, GRID_H: 31}},
    './Canvas': {canvas: {getElement: () => canvasElement, on: () => {}, updateTransformMatrix() {}}},
    './Controls': {controls: {mouse: {x: 0, y: 0}, on: (n, f) => { camListeners[n] = f; }}},
};
const camDocument = {
    getElementById: id => id === 'map-frame' ? {getBoundingClientRect: () => frameRect} : null,
};
const camModule = {exports: {}};
new Function('module', 'exports', 'require', 'document', cameraJs)(
    camModule, camModule.exports,
    name => { if (!(name in camDeps)) throw new Error('Unexpected dependency: ' + name); return camDeps[name]; },
    camDocument,
);
const Camera = camModule.exports.Camera;
const camera = new Camera();

const TILE = camDeps['./Map'].Map.TILE_SIZE;
const GW = camDeps['./Map'].Map.GRID_W;
const GH = camDeps['./Map'].Map.GRID_H;
const mapWidth = TILE * GW;
const mapHeight = TILE * GH;

// Zoom out to minimum so the cover clamp is the binding constraint.
for (let i = 0; i < 40; i++) camListeners['wheel:down']();
const minimumScale = Math.max(frameRect.width / mapWidth, frameRect.height / mapHeight);

// getVisibleMapRect at minimum zoom: on the binding axis the visible rect equals
// the whole map; on the slack axis it is a sub-rect centered on the camera.
const rect0 = camera.getVisibleMapRect();
assert.ok(rect0.width <= mapWidth + 1e-6, 'visible width never exceeds the map');
assert.ok(rect0.height <= mapHeight + 1e-6, 'visible height never exceeds the map');
const boundAxisIsHeight = minimumScale === frameRect.height / mapHeight;
if (boundAxisIsHeight) {
    assert.ok(Math.abs(rect0.height - mapHeight) < 1e-6, 'on the binding axis the visible rect == whole map');
    assert.ok(rect0.width < mapWidth, 'on the slack axis the visible rect is a sub-rect');
} else {
    assert.ok(Math.abs(rect0.width - mapWidth) < 1e-6, 'on the binding axis the visible rect == whole map');
    assert.ok(rect0.height < mapHeight, 'on the slack axis the visible rect is a sub-rect');
}
assert.ok(rect0.x >= -1e-6 && rect0.y >= -1e-6, 'visible rect never starts before the map origin');
assert.ok(rect0.x + rect0.width <= mapWidth + 1e-6, 'visible rect never ends past the map edge');
assert.ok(rect0.y + rect0.height <= mapHeight + 1e-6, 'visible rect never ends past the map edge');

// setCenter clamps: requesting a center far off either edge must not push the
// visible rect outside the map (cover invariant preserved).
camera.setCenter(-99999, -99999);
let r = camera.getVisibleMapRect();
assert.ok(r.x >= -1e-6 && r.y >= -1e-6, 'setCenter(-inf) keeps the visible rect inside the map origin');
camera.setCenter(mapWidth * 2, mapHeight * 2);
r = camera.getVisibleMapRect();
assert.ok(r.x + r.width <= mapWidth + 1e-6 && r.y + r.height <= mapHeight + 1e-6,
    'setCenter(+inf) keeps the visible rect inside the map far edge');

// After zooming in, setCenter can actually move within the slack, but is still clamped.
for (let i = 0; i < 20; i++) camListeners['wheel:up']();
assert.ok(camera.scaleRatio > 1, 'zoomed in for the movement test');
camera.setCenter(mapWidth / 4, mapHeight / 4);
r = camera.getVisibleMapRect();
const cx = r.x + r.width / 2;
const cy = r.y + r.height / 2;
assert.ok(Math.abs(cx - mapWidth / 4) < 1e-6 && Math.abs(cy - mapHeight / 4) < 1e-6,
    'within slack, setCenter moves the visible-rect center exactly');

// ---- Pure geometry helpers exported from MiniMap.ts
const miniSource = fs.readFileSync('src/MiniMap.ts', 'utf8');
const miniJs = ts.transpileModule(miniSource, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText;
// MiniMap.ts imports Map, Rock, Base, config.json (relative). For the pure-geometry
// exports we only need the module to load without throwing — stub everything.
const fakeRock = function FakeRock() {};
const fakeBase = function FakeBase() { this.center = {x: 0, y: 0}; };
const miniDeps = {
    './Map': {Map: {TILE_SIZE: TILE, GRID_W: GW, GRID_H: GH}},
    './entities/terrain/Rock': {Rock: fakeRock},
    './entities/terrain/Base': {Base: fakeBase},
    './config.json': {colors: {homeBase: {primary: '#27ae60'}, enemyBase: {primary: '#c34667'}}},
    './Camera': {Camera: function () {}},
};
const miniModule = {exports: {}};
new Function('module', 'exports', 'require', 'document', miniJs)(
    miniModule, miniModule.exports,
    name => { if (!(name in miniDeps)) throw new Error('Unexpected dependency: ' + name); return miniDeps[name]; },
    {},
);
const {mapPointToMini, miniPointToMap, MiniMap} = miniModule.exports;

const miniRect = {x: 100, y: 200, width: 192, height: 96};
const mapRect = {width: mapWidth, height: mapHeight};

// round-trip: map -> mini -> map returns the original point
const samples = [{x: 0, y: 0}, {x: mapWidth, y: mapHeight}, {x: mapWidth / 2, y: mapHeight / 2}, {x: 123, y: 456}];
for (const p of samples) {
    const m = mapPointToMini(miniRect, mapRect, p);
    const back = miniPointToMap(miniRect, mapRect, m);
    assert.ok(Math.abs(back.x - p.x) < 1e-6 && Math.abs(back.y - p.y) < 1e-6, 'map<->mini round trip: ' + JSON.stringify(p));
}

// corners: map origin maps to minimap top-left, map far corner to minimap bottom-right
assert.deepStrictEqual(mapPointToMini(miniRect, mapRect, {x: 0, y: 0}), {x: 100, y: 200});
assert.deepStrictEqual(mapPointToMini(miniRect, mapRect, {x: mapWidth, y: mapHeight}), {x: 292, y: 296});

// ---- MiniMap pointer routing with a stub camera
const panCalls = [];
const stubCamera = {
    setCenter: (x, y) => panCalls.push({x, y}),
    getVisibleMapRect: () => ({x: 0, y: 0, width: mapWidth, height: mapHeight}),
};
const stubMap = {on: () => {}, grid: []};
// document.createElement('canvas') stub: MiniMap builds an offscreen canvas in its ctor.
const miniDoc = {
    getElementById: () => ({clientWidth: 1200, clientHeight: 800}),
    createElement: () => ({
        width: 0, height: 0,
        getContext: () => ({
            clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, arc() {},
            fill() {}, stroke() {}, drawImage() {}, save() {}, restore() {},
            set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
        }),
    }),
};
// Reload MiniMap with this document so the ctor can build its offscreen canvas.
const miniModule2 = {exports: {}};
new Function('module', 'exports', 'require', 'document', miniJs)(
    miniModule2, miniModule2.exports,
    name => miniDeps[name],
    miniDoc,
);
const MiniMap2 = miniModule2.exports.MiniMap;
const mm = new MiniMap2(stubMap, stubCamera, {width: 192, height: 96, margin: 24});

const rect = mm.getRect();
// bottom-right anchor: x = 1200 - 192 - 24 = 984, y = 800 - 96 - 24 = 680
assert.deepStrictEqual(rect, {x: 984, y: 680, width: 192, height: 96}, 'minimap anchors to bottom-right');

// a click inside the minimap rect is consumed and pans to the corresponding map point
const inside = {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
assert.strictEqual(mm.onPointerDown(inside.x, inside.y), true, 'click inside minimap is consumed');
assert.strictEqual(panCalls.length, 1, 'one pan call on pointer down');
// center of minimap -> center of map
assert.ok(Math.abs(panCalls[0].x - mapWidth / 2) < 1e-6 && Math.abs(panCalls[0].y - mapHeight / 2) < 1e-6,
    'minimap center pans to map center');

// a click outside the minimap rect is ignored
assert.strictEqual(mm.onPointerDown(0, 0), false, 'click outside minimap is ignored');

// dragging moves the pan target
mm.onPointerMove(rect.x + 10, rect.y + 10);
assert.ok(panCalls.length >= 2, 'pointer move while dragging pans');
mm.onPointerUp();
mm.onPointerMove(rect.x + 10, rect.y + 10);
assert.strictEqual(panCalls.length, 2, 'pointer move after release does not pan');

console.log('Minimap locator passed.');
