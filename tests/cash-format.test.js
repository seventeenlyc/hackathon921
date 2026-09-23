/**
 * 资源值缩位展示的守卫：状态卡大字在 1/3 卡宽内只能容纳 5 位数字，
 * 超过后按界面语言缩位（中文「万/亿」、英文 K/M），避免截断成无法阅读。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');

function loadCashManager() {
    const source = fs.readFileSync(path.join(projectRoot, 'src', 'CashManager.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
    }).outputText;
    const moduleObj = {exports: {}};
    const documentStub = {getElementById: () => null};
    new Function('module', 'exports', 'require', 'document', js)(
        moduleObj,
        moduleObj.exports,
        name => {
            if (name === './config.json') return {initialBalance: 200};
            if (name === './i18n') return {getLang: () => 'zh'};
            throw new Error('Unexpected dependency: ' + name);
        },
        documentStub,
    );
    return moduleObj.exports;
}

const {formatBalance} = loadCashManager();
assert.ok(typeof formatBalance === 'function', 'formatBalance must be exported');

// 阈值内显示原值
assert.strictEqual(formatBalance(99999, 'zh'), '99999');
assert.strictEqual(formatBalance(99999, 'en'), '99999');
assert.strictEqual(formatBalance(200, 'en'), '200');

// 中文界面：万 → 亿 缩位
assert.strictEqual(formatBalance(100000, 'zh'), '10.0万');
assert.strictEqual(formatBalance(215300, 'zh'), '21.5万');
assert.strictEqual(formatBalance(9999999, 'zh'), '1000.0万');
assert.strictEqual(formatBalance(123456789, 'zh'), '1.23亿');
assert.strictEqual(formatBalance(9876543210, 'zh'), '98.77亿');

// 英文界面：K → M → B 缩位
assert.strictEqual(formatBalance(100000, 'en'), '100.0K');
assert.strictEqual(formatBalance(215300, 'en'), '215.3K');
assert.strictEqual(formatBalance(1234567, 'en'), '1.23M');
assert.strictEqual(formatBalance(1234567890, 'en'), '1.23B');

console.log('Cash compact-format assertions passed.');
