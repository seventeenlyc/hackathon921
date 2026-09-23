const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// 回归：2026-09-24 的「提交命令不再自动隐藏控制面板」改动顺手删掉了
// submit() 里的 startRun()，导致「下达命令并开始行动」只排队命令、对局
// 永远停在 STANDBY。这里用假 DOM 真的点一次按钮，锁住启动行为，
// 同时锁住「不自动收起控制面板」的既有决定。

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'src', 'StrategyPanel.ts'), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;

class FakeClassList {
    constructor() { this.set = new Set(); }
    add(cls) { this.set.add(cls); }
    remove(cls) { this.set.delete(cls); }
    toggle(cls, force) {
        const enable = force === undefined ? !this.set.has(cls) : Boolean(force);
        if (enable) this.set.add(cls); else this.set.delete(cls);
        return enable;
    }
    contains(cls) { return this.set.has(cls); }
}

class FakeElement {
    constructor(id) {
        this.id = id;
        this.value = '';
        this.textContent = '';
        this.disabled = false;
        this.classList = new FakeClassList();
        this.listeners = {};
    }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    click() { for (const listener of this.listeners.click || []) listener(); }
    querySelector(selector) {
        return selector === '.btn-main' ? this.main : null;
    }
}

function makeDocument() {
    const ids = ['strategy-input', 'strategy-apply', 'strategy-random', 'strategy-status', 'strategy-count'];
    const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
    // 两个按钮都带装饰性副行，渲染时只替换 .btn-main。
    elements.get('strategy-apply').main = Object.assign(new FakeElement(), { textContent: '' });
    elements.get('strategy-random').main = Object.assign(new FakeElement(), { textContent: '' });
    return { getElementById: id => elements.get(id) || null, elements };
}

function loadPanel({ idle, initialText = '', playMode = 'ai', username = 'Alice' }) {
    const calls = { queued: [], starts: 0, layer: [] };
    const storeListeners = [];
    const loopListeners = [];
    let queuedVersion = null;
    // StrategyPanel.ts exports a ready-made `strategyPanel` singleton, so the
    // module must not be instantiated a second time on the same fake elements
    // (that would register the click listener twice).
    const store = {
        active: () => ({ version: 0, text: initialText, fromWave: 1 }),
        queued: () => queuedVersion,
        submit: (text, fromWave) => {
            calls.queued.push({ text, fromWave });
            queuedVersion = { version: calls.queued.length, text, fromWave };
            storeListeners.forEach(listener => listener(store));
            return queuedVersion;
        },
        onChange: listener => storeListeners.push(listener),
    };
    const gameLoop = {
        isIdle: () => idle,
        onChange: listener => loopListeners.push(listener),
    };
    const dependencies = {
        './agent/StrategyStore': { strategyStore: store },
        './agent/GameLoop': { gameLoop },
        './agent/StrategyLibrary': { randomStrategy: () => 'preset' },
        './agent/StrategyLimits': {
            isStrategyTooLong: text => text.length > 500,
            strategyLength: text => text.length,
            STRATEGY_MAX_LENGTH: 500,
        },
        './StrategyQueue': {
            queueStrategy: text => store.submit(text, 1),
            startRun: () => { calls.starts += 1; },
        },
        './ControlLayer': {
            getControlLayer: () => ({
                hide: () => calls.layer.push('hide'),
                show: () => calls.layer.push('show'),
            }),
        },
        './i18n': { t: key => key, onLangChange: () => {} },
    };
    const document = makeDocument();
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
    const panel = moduleObj.exports.strategyPanel;
    const input = document.elements.get('strategy-input');
    const apply = document.elements.get('strategy-apply');
    const status = document.elements.get('strategy-status');
    return { panel, calls, store, gameLoop, input, apply, status, storeListeners, loopListeners };
}

// 1. IDLE 下点「下达命令并开始行动」：排队命令并真正启动对局。
{
    const { calls, input, apply } = loadPanel({ idle: true });
    input.value = '优先在右上角建狙击塔';
    apply.click();
    assert.strictEqual(calls.queued.length, 1, '提交必须把 Prompt 排队');
    assert.strictEqual(calls.queued[0].text, '优先在右上角建狙击塔', '排队的 Prompt 必须是输入框内容');
    assert.strictEqual(calls.starts, 1, 'IDLE 下点开始按钮必须启动对局（回归修复）');
    assert.ok(!calls.layer.includes('hide'), '提交命令不得自动收起控制面板');
    assert.ok(!apply.disabled, '有内容时开始按钮必须可点');
}

// 2. 运行中点按钮：只更新命令，不得重启对局。
{
    const { calls, input, apply, status } = loadPanel({ idle: false });
    input.value = '改成集火 Boss';
    apply.click();
    assert.strictEqual(calls.queued.length, 1, '运行中提交必须排队新命令');
    assert.strictEqual(calls.starts, 0, '运行中提交不得再次启动对局');
    assert.strictEqual(status.textContent, 'strategy.queued', '运行中提交后状态必须显示已排队');
}

// 3. IDLE 且输入为空：按钮禁用，直接提交也不启动。
{
    const { calls, apply } = loadPanel({ idle: true });
    assert.strictEqual(apply.disabled, true, 'IDLE 空输入时开始按钮必须禁用');
    apply.click();
    assert.strictEqual(calls.starts, 0, '空 Prompt 不得启动对局');
    assert.strictEqual(calls.queued.length, 0, '空 Prompt 不得排队');
}

// 4. 已有开局 Prompt（刷新后 store 里仍有文本）：构造时收起首屏提示，
//    但提交行为与第 1 条一致。
{
    const { calls, input, apply } = loadPanel({ idle: true, initialText: '守住左路' });
    assert.ok(calls.layer.includes('hide'), '已有 Prompt 时构造期应收起首屏控制提示');
    input.value = '守住左路，补一座重炮';
    apply.click();
    assert.strictEqual(calls.starts, 1, '已有 Prompt 时提交仍必须启动对局');
}

console.log('Strategy panel start-button regression assertions passed.');
