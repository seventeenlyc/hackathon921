const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadSession(document) {
    const source = fs.readFileSync(path.join(root, 'src', 'leaderboard', 'SessionIdentity.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    new Function('module', 'exports', 'require', 'document', js)(
        moduleObj,
        moduleObj.exports,
        name => {
            if (name === './LeaderboardStore') {
                const storeSource = fs.readFileSync(path.join(root, 'src', 'leaderboard', 'LeaderboardStore.ts'), 'utf8');
                const storeJs = ts.transpileModule(storeSource, {
                    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
                }).outputText;
                const storeModule = { exports: {} };
                new Function('module', 'exports', storeJs)(storeModule, storeModule.exports);
                return storeModule.exports;
            }
            if (name === './AvatarCatalog') {
                const catalogSource = fs.readFileSync(path.join(root, 'src', 'leaderboard', 'AvatarCatalog.ts'), 'utf8');
                const catalogJs = ts.transpileModule(catalogSource, {
                    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
                }).outputText;
                const catalogModule = { exports: {} };
                new Function('module', 'exports', catalogJs)(catalogModule, catalogModule.exports);
                return catalogModule.exports;
            }
            throw new Error('Unexpected dependency: ' + name);
        },
        document
    );
    return moduleObj.exports;
}

function test(name, fn) {
    try { fn(); console.log('PASS: ' + name); }
    catch (error) { console.error('FAIL: ' + name, error); process.exitCode = 1; }
}

test('session nickname starts empty even when the legacy cookie exists', () => {
    const document = { cookie: 'pd_username=Legacy' };
    const identity = loadSession(document);
    assert.strictEqual(identity.getSessionUsername(), null);
    assert.strictEqual(identity.setSessionUsername('  Alice  '), true);
    assert.strictEqual(identity.getSessionUsername(), 'Alice');
});

test('reloading the identity module forgets the nickname and clears the legacy cookie', () => {
    const document = { cookie: 'pd_username=Alice' };
    const first = loadSession(document);
    first.setSessionUsername('Alice');
    first.setSessionAvatar('batou');
    const firstLocalId = first.getLocalSessionId();
    first.clearLegacyUsernameCookie();
    assert.match(document.cookie, /^pd_username=; Max-Age=0; Path=\/$/);

    const second = loadSession(document);
    assert.strictEqual(second.getSessionUsername(), null);
    assert.strictEqual(second.getSessionAvatar(), null);
    assert.notStrictEqual(second.getLocalSessionId(), firstLocalId,
        'offline session identity must be regenerated on page reload');
});

test('invalid nickname does not become the current session identity', () => {
    const identity = loadSession({ cookie: '' });
    assert.strictEqual(identity.setSessionUsername('<img onerror=alert(1)>'), false);
    assert.strictEqual(identity.getSessionUsername(), null);
});

console.log('Session identity checks passed.');
