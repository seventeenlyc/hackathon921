const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');

function loadSource(file, dependencies = {}) {
    const source = fs.readFileSync(path.join(projectRoot, 'src', file), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    new Function('module', 'exports', 'require', js)(
        moduleObj,
        moduleObj.exports,
        name => {
            if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
            return dependencies[name];
        },
    );
    return moduleObj.exports;
}

const { toggleVisibility, isEditableTarget } = loadSource('ControlLayer.ts', {
    './Controls': { controls: { on() {} } },
    './tools/input': { isEditableTarget: target => target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target?.isContentEditable === true },
});

assert.strictEqual(toggleVisibility('hidden'), 'visible');
assert.strictEqual(toggleVisibility('visible'), 'hidden');
assert.strictEqual(isEditableTarget({ tagName: 'TEXTAREA' }), true);
assert.strictEqual(isEditableTarget({ tagName: 'INPUT' }), true);
assert.strictEqual(isEditableTarget({ tagName: 'BUTTON' }), false);
assert.strictEqual(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);

console.log('Control layer helpers passed.');

const controlsSource = fs.readFileSync(path.join(projectRoot, 'src', 'Controls.ts'), 'utf8');
const gameSource = fs.readFileSync(path.join(projectRoot, 'src', 'Game.ts'), 'utf8');
const interfaceSource = fs.readFileSync(path.join(projectRoot, 'src', 'InterfaceManager.ts'), 'utf8');

assert.doesNotMatch(controlsSource, /window\.addEventListener\(['"]click['"]/,
    'global clicks must not be forwarded to the game input bus');
assert.match(controlsSource, /(?:this\.element|canvas\.getElement\(\))\.addEventListener\(['"]mousedown['"]/, 
    'map drags must begin on the Canvas');
assert.match(controlsSource, /mapPointerDown/,
    'Controls must track an active map drag for release outside the Canvas');
assert.doesNotMatch(gameSource, /TowerPlacer|towerPlacer/,
    'the game loop must not update or draw a human tower placer');
assert.doesNotMatch(interfaceSource, /TowerPlacer|towerPlacer|towers-wrapper/,
    'the interface must not initialize a human tower palette');

console.log('Control layer input-boundary assertions passed.');
