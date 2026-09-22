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
});

assert.strictEqual(toggleVisibility('hidden'), 'visible');
assert.strictEqual(toggleVisibility('visible'), 'hidden');
assert.strictEqual(isEditableTarget({ tagName: 'TEXTAREA' }), true);
assert.strictEqual(isEditableTarget({ tagName: 'INPUT' }), true);
assert.strictEqual(isEditableTarget({ tagName: 'BUTTON' }), false);
assert.strictEqual(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);

console.log('Control layer helpers passed.');
