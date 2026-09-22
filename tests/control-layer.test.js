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
const stylesSource = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'styles.less'), 'utf8');
const controlLayerSource = fs.readFileSync(path.join(projectRoot, 'src', 'ControlLayer.ts'), 'utf8');

assert.doesNotMatch(controlsSource, /window\.addEventListener\(['"]click['"]/,
    'global clicks must not be forwarded to the game input bus');
assert.match(
    controlsSource,
    /(?:this\.element|canvas\.getElement\(\))\.addEventListener\(['"]mousedown['"]?/,
    'map drags must begin on the Canvas'
);
assert.match(controlsSource, /mapPointerDown/,
    'Controls must track an active map drag for release outside the Canvas');
assert.match(gameSource, /if \(playMode === 'human'\) towerPlacer\.update\(\)/,
    'the game loop must update the tower preview only in human mode');
assert.match(gameSource, /if \(playMode === 'human'\) towerPlacer\.draw\(ctx\)/,
    'the game loop must draw the tower preview only in human mode');
assert.match(interfaceSource, /this\.setTowers\(\)/,
    'the interface must initialize the tower palette in both play modes');
assert.match(stylesSource, /(?:\.controls\.is-hidden|&\.is-hidden)[\s\S]*visibility:\s*hidden/,
    'hidden controls must be removed from hit testing and visibility');
assert.match(stylesSource, /(?:\.controls\.is-hidden|&\.is-hidden)[\s\S]*pointer-events:\s*none/,
    'hidden controls must not intercept pointer input');
assert.match(stylesSource, /prefers-reduced-motion/,
    'control-layer transitions must respect reduced-motion preferences');
assert.match(stylesSource, /@media\s*\(max-width:\s*760px\)/,
    'the control layer must define a narrow-screen layout');
assert.match(controlLayerSource, /showHint\(\)/,
    'the first-view hint must be controlled by the same visibility controller');

console.log('Control layer input-boundary assertions passed.');
