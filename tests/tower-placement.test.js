const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real placement controller with only its browser/transport ports replaced.
const handlers = {};
const controls = {mouse: {x: 123, y: 167}, mouseInCanvas: true,
    on: (event, handler) => handlers[event] = handler};
const calls = [];
const previews = [];
const messages = [];
const canvas = {transformMatrix: {inverse: () => ({
    transformPoint: point => ({x: (point.x - 20) / 2, y: (point.y - 30) / 2}),
})}};
const ports = {
    './Canvas': {canvas}, './Controls': {controls},
    './InterfaceManager': {interfaceManager: {snackbar: {toast: text => messages.push(text)}}},
    './PlayMode': {playMode: 'human'},
    './view/render': {drawTowerPreview: (_, preview) => previews.push(preview)},
};
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/TowerPlacer.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText, {exports: exportsObject, require: name => {
    assert.ok(ports[name], `unexpected runtime dependency: ${name}`);
    return ports[name];
}});
const placer = exportsObject.towerPlacer;
const snapshot = {grid: {tileSize: 40, width: 10, height: 10}, towers: []};
placer.bind({workerBuild: async (...args) => {
    calls.push(args);
    return {ok: false, error: 'INSUFFICIENT_FUNDS', message: '资金不足'};
}});

(async () => {
    placer.place('canon', 100);
    placer.update(snapshot);
    placer.draw({}, snapshot);
    assert.equal(previews.at(-1).x + 20, 51.5, 'ghost center follows the exact transformed pointer');
    assert.equal(previews.at(-1).y + 20, 68.5);
    controls.mouse.x += 4;
    placer.update(snapshot);
    placer.draw({}, snapshot);
    assert.equal(previews.at(-1).x + 20, 53.5, 'movement within one cell must move the ghost');

    controls.mouse = {x: 270, y: 290};
    handlers.click(); // No render tick between movement and click.
    await Promise.resolve();
    assert.deepEqual(calls[0], ['canon', 3, 3], 'click uses the current pointer, snapped to its cell');
    assert.equal(messages[0], '资金不足');
    handlers.click();
    assert.equal(calls.length, 2, 'rejection preserves placement mode');
    controls.mouseInCanvas = false;
    handlers.click();
    assert.equal(calls.length, 2);
    controls.mouseInCanvas = true;
    handlers['keydown:ESCAPE']();
    handlers.click();
    assert.equal(calls.length, 2, 'Escape cancels placement');
    console.log('Tower placement behavior passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
