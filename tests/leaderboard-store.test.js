// LeaderboardStore 纯逻辑测试：无 DOM 环境跑通排序、去重、成绩提交与用户名校验。
// 用 typescript.transpileModule 编译 src 里的 TS（去类型），再在 vm 沙箱中求值以测试纯函数。
// Store 已与 DOM 解耦，未定义 document/localStorage 时相关函数返回 null，不抛错。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'src', 'leaderboard', 'LeaderboardStore.ts');

const source = fs.readFileSync(srcPath, 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;

// 捕获 CommonJS 导出的模块对象（transpileModule 输出 module.exports 形式）。
const moduleObj = { exports: {} };
const wrapped = new Function('module', 'exports', 'require', js);
wrapped(moduleObj, moduleObj.exports, require);
const S = moduleObj.exports;

function test(name, fn) {
    try { fn(); console.log('PASS: ' + name); }
    catch (e) { console.error('FAIL: ' + name, e); process.exitCode = 1; }
}

test('sanitizeUsername trims and accepts latin/chinese/alnum/_/-', () => {
    assert.strictEqual(S.sanitizeUsername('   Alice  '), 'Alice');
    assert.ok(S.sanitizeUsername('玩家_01'));
    assert.ok(S.sanitizeUsername('a-b_c'));
});

test('sanitizeUsername rejects empty / too long / disallowed chars / null', () => {
    assert.strictEqual(S.sanitizeUsername(''), null);
    assert.strictEqual(S.sanitizeUsername('   '), null);
    assert.strictEqual(S.sanitizeUsername('a'.repeat(17)), null);
    assert.strictEqual(S.sanitizeUsername('abc/def'), null);
    assert.strictEqual(S.sanitizeUsername(null), null);
});

test('sanitizeUsername rejects markup (不可信输入)', () => {
    assert.strictEqual(S.sanitizeUsername('<script>alert(1)</script>'), null);
    assert.strictEqual(S.sanitizeUsername('x<img>y'), null);
});

test('sortEntries: higher wave first, ties by earlier timestamp, input untouched', () => {
    const a = { username: 'a', wave: 5, timestamp: 100 };
    const b = { username: 'b', wave: 8, timestamp: 50 };
    const c = { username: 'c', wave: 8, timestamp: 20 };
    const sorted = S.sortEntries([a, b, c]);
    assert.deepStrictEqual(sorted.map(e => e.username), ['c', 'b', 'a']);
    assert.strictEqual(sorted.length, 3);
});

test('dedupeByUser: keeps single best per username (case-insensitive)', () => {
    const rows = [
        { username: 'Luna', wave: 10, timestamp: 1 },
        { username: 'luna', wave: 14, timestamp: 2 },
        { username: 'Alex', wave: 12, timestamp: 3 },
    ];
    const deduped = S.dedupeByUser(rows);
    assert.strictEqual(deduped.length, 2);
    const luna = deduped.find(e => e.username.toLowerCase() === 'luna');
    assert.strictEqual(luna.wave, 14, 'keep higher wave');
});

test('submitScore computes global rank and inserts new best', () => {
    const stored = [
        { username: 'Alice', wave: 30, timestamp: 1 },
        { username: 'Bob', wave: 20, timestamp: 2 },
    ];
    const r = S.submitScore('Carol', 25, stored);
    assert.strictEqual(r.rank, 2);
    assert.deepStrictEqual(r.entries.map(e => e.wave), [30, 25, 20]);
});

test('submitScore: lower score for existing user keeps personal best', () => {
    const stored = [{ username: 'Carol', wave: 25, timestamp: 2 }];
    const r = S.submitScore('Carol', 18, stored);
    assert.strictEqual(r.entries[0].wave, 25);
    assert.strictEqual(r.entries.length, 1);
});

test('submitScore: non-positive score clamped to 1', () => {
    const stored = [{ username: 'X', wave: 5, timestamp: 1 }];
    const r = S.submitScore('Y', 0, stored);
    assert.strictEqual(r.entries.find(e => e.username === 'Y').wave, 1);
});

test('store is safe without document / localStorage', () => {
    assert.strictEqual(S.readUsernameCookie(), null);
    assert.strictEqual(S.readStoredLeaderboard(), null);
    assert.doesNotThrow(() => S.writeUsernameCookie('Alice'));
    assert.doesNotThrow(() => S.writeStoredLeaderboard([]));
});

require('./leaderboard-live.test.js');
