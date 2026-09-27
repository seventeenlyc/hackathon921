// AvatarCatalog + SessionIdentity 头像会话纯逻辑测试：无 DOM 环境跑通白名单校验与随机选择。
// 用 typescript.transpileModule 编译 src 里的 TS（去类型），在 Function 沙箱中求值；
// AvatarCatalog 刻意保持无图片 import，便于在此环境直接加载。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function transpile(relPath) {
    const source = fs.readFileSync(path.join(root, relPath), 'utf8');
    return ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
    }).outputText;
}

function evaluate(js, requireStub) {
    const moduleObj = {exports: {}};
    new Function('module', 'exports', 'require', js)(moduleObj, moduleObj.exports, requireStub);
    return moduleObj.exports;
}

// AvatarCatalog 无依赖；SessionIdentity 依赖 LeaderboardStore 与 AvatarCatalog。
const catalog = evaluate(transpile('src/leaderboard/AvatarCatalog.ts'), () => {
    throw new Error('AvatarCatalog must stay dependency-free');
});

function loadIdentity() {
    const store = evaluate(transpile('src/leaderboard/LeaderboardStore.ts'), () => {
        throw new Error('Unexpected dependency in test sandbox');
    });
    const identity = evaluate(transpile('src/leaderboard/SessionIdentity.ts'), (name) => {
        if (name === './LeaderboardStore') return store;
        if (name === './AvatarCatalog') return catalog;
        throw new Error('Unexpected dependency: ' + name);
    });
    return identity;
}

function test(name, fn) {
    try { fn(); console.log('PASS: ' + name); }
    catch (e) { console.error('FAIL: ' + name, e); process.exitCode = 1; }
}

test('catalog exposes exactly 8 unique avatars with display labels', () => {
    assert.strictEqual(catalog.AVATARS.length, 8);
    const ids = catalog.AVATARS.map((a) => a.id);
    assert.strictEqual(new Set(ids).size, 8);
    for (const avatar of catalog.AVATARS) {
        assert.ok(avatar.nameKey.startsWith('gate.avatar.'), 'nameKey must live in the i18n table');
        assert.ok(avatar.romaji.length > 0);
    }
});

test('isKnownAvatarId accepts catalogue ids and rejects anything else', () => {
    for (const avatar of catalog.AVATARS) {
        assert.strictEqual(catalog.isKnownAvatarId(avatar.id), true);
    }
    assert.strictEqual(catalog.isKnownAvatarId('unknown'), false);
    assert.strictEqual(catalog.isKnownAvatarId(''), false);
    assert.strictEqual(catalog.isKnownAvatarId('<script>'), false);
});

test('randomAvatarId always returns a known avatar id', () => {
    for (let i = 0; i < 200; i++) {
        assert.strictEqual(catalog.isKnownAvatarId(catalog.randomAvatarId()), true);
    }
});

test('randomUsername returns valid username matching character and length limits', () => {
    const store = evaluate(transpile('src/leaderboard/LeaderboardStore.ts'), () => {});
    for (let i = 0; i < 100; i++) {
        const zh = catalog.randomUsername('zh');
        assert.ok(zh && zh.length >= 1 && zh.length <= 16);
        assert.strictEqual(store.sanitizeUsername(zh), zh);

        const en = catalog.randomUsername('en');
        assert.ok(en && en.length >= 1 && en.length <= 16);
        assert.strictEqual(store.sanitizeUsername(en), en);
    }
});

test('session avatar starts empty, accepts valid ids and rejects unknown ones', () => {
    const identity = loadIdentity();
    assert.strictEqual(identity.getSessionAvatar(), null);
    assert.strictEqual(identity.setSessionAvatar('sentinel'), true);
    assert.strictEqual(identity.getSessionAvatar(), 'sentinel');
    assert.strictEqual(identity.setSessionAvatar('nonsense'), false);
    assert.strictEqual(identity.getSessionAvatar(), 'sentinel', 'rejected id must not clobber current value');
});

test('session avatar resets with a fresh page session like the nickname', () => {
    const first = loadIdentity();
    first.setSessionAvatar('helix');
    assert.strictEqual(first.getSessionAvatar(), 'helix');
    const second = loadIdentity();
    assert.strictEqual(second.getSessionAvatar(), null);
});

test('Tian Ji Zhen portraits are eight distinct square PNG assets', () => {
    const crypto = require('node:crypto');
    const hashes = new Set();
    catalog.AVATARS.forEach((avatar, index) => {
        const number = String(index + 1).padStart(2, '0');
        const bytes = fs.readFileSync(path.join(root, 'src/assets/avatars', `${number}_${avatar.id}.png`));
        assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
        assert.equal(bytes.readUInt32BE(16), 1254);
        assert.equal(bytes.readUInt32BE(20), 1254);
        hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
    });
    assert.equal(hashes.size, 8);
});

console.log('Avatar catalog, portrait assets and session avatar checks passed.');
