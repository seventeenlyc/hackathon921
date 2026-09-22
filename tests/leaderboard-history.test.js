const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.listeners = {};
        this.textContent = '';
        this.className = '';
        this.hidden = false;
        this.open = false;
        this.tabIndex = -1;
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
    }
    setAttribute(name, value) { this[name] = String(value); }
    hasAttribute(name) { return this[name] !== undefined && this[name] !== false; }
    removeAttribute(name) { delete this[name]; }
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    dispatch(name, event = {}) { for (const listener of this.listeners[name] || []) listener(event); }
    focus() { this.ownerDocument.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch('close'); }
}

function allText(element) {
    return element.textContent + element.children.map(allText).join('');
}

class FakeDocument {
    constructor() {
        this.inert = new FakeElement('div');
        this.inert.id = 'inert';
        this.activeElement = null;
    }
    createElement(tagName) {
        const element = new FakeElement(tagName);
        element.ownerDocument = this;
        return element;
    }
    createDocumentFragment() { return this.createElement('fragment'); }
    getElementById(id) { return id === 'inert' ? this.inert : null; }
}

function loadDialog(document, fetchBestRunPrompts) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'leaderboard', 'PromptHistoryDialog.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    new Function('module', 'exports', 'require', 'document', 'setTimeout', js)(
        moduleObj,
        moduleObj.exports,
        name => {
            if (name === './LeaderboardClient') return { fetchBestRunPrompts };
            if (name === '../i18n') return { t: (key, values = {}) => {
                const strings = {
                    'history.loading': 'Loading',
                    'history.empty': 'No Prompt history saved for this run.',
                    'history.failed': 'Prompt history unavailable.',
                    'history.close': 'Close',
                    'history.title': `${values.name || ''} - best run: wave ${values.wave || 0}`,
                    'history.version': `Version ${values.version}`,
                    'history.fromWave': `Effective from wave ${values.wave}`,
                };
                return strings[key] || key;
            } };
            throw new Error('Unexpected dependency: ' + name);
        },
        document,
        fn => setTimeout(fn, 0)
    );
    return moduleObj.exports;
}

async function test(name, fn) {
    try { await fn(); console.log('PASS: ' + name); }
    catch (error) { console.error('FAIL: ' + name, error); process.exitCode = 1; }
}

(async () => {
    await test('opens, renders prompt text safely, and restores focus on close', async () => {
        const document = new FakeDocument();
        const previous = document.createElement('input');
        document.activeElement = previous;
        const { PromptHistoryDialog } = loadDialog(document, async () => ({
            username: 'Alice', runId: 'run-1', wave: 7,
            prompts: [{ id: 'p1', runId: 'run-1', version: 1, prompt: '<img onerror="alert(1)">', fromWave: 1, prevId: null, createdAt: 1 }],
        }));
        const dialog = new PromptHistoryDialog();
        await dialog.open('Alice');
        assert.strictEqual(document.inert.children.length, 1);
        assert.match(allText(dialog.dialog), /Alice/);
        assert.match(allText(dialog.dialog), /<img onerror="alert\(1\)">/);
        assert.strictEqual(dialog.dialog.children.some(child => child.tagName === 'SCRIPT' || child.tagName === 'IMG'), false);
        dialog.close();
        assert.strictEqual(document.activeElement, previous);
    });

    await test('a late response from an earlier open cannot replace the newer user', async () => {
        const document = new FakeDocument();
        const pending = {};
        const { PromptHistoryDialog } = loadDialog(document, username => new Promise(resolve => { pending[username] = resolve; }));
        const dialog = new PromptHistoryDialog();
        const first = dialog.open('Alice');
        const second = dialog.open('Bob');
        pending.Bob({ username: 'Bob', runId: 'run-b', wave: 2, prompts: [] });
        await second;
        pending.Alice({ username: 'Alice', runId: 'run-a', wave: 9, prompts: [] });
        await first;
        assert.match(allText(dialog.dialog), /Bob/);
        assert.doesNotMatch(allText(dialog.dialog), /Alice - best run/);
    });

    await test('empty and failed reads have explicit non-game-blocking states', async () => {
        const document = new FakeDocument();
        let mode = 'empty';
        const { PromptHistoryDialog } = loadDialog(document, async () => {
            if (mode === 'failed') throw new Error('offline');
            return { username: 'Alice', runId: 'run-a', wave: 4, prompts: [] };
        });
        const dialog = new PromptHistoryDialog();
        await dialog.open('Alice');
        assert.match(allText(dialog.dialog), /No Prompt history/);
        mode = 'failed';
        await dialog.open('Alice');
        assert.match(allText(dialog.dialog), /unavailable/);
    });

    await test('renders long histories in batches without dropping the final node', async () => {
        const document = new FakeDocument();
        const prompts = Array.from({ length: 41 }, (_, index) => ({
            id: 'p' + index, runId: 'run-a', version: index + 1, prompt: 'Prompt ' + index,
            fromWave: index + 1, prevId: index ? 'p' + (index - 1) : null, createdAt: index,
        }));
        const { PromptHistoryDialog } = loadDialog(document, async () => ({ username: 'Alice', runId: 'run-a', wave: 41, prompts }));
        const dialog = new PromptHistoryDialog();
        await dialog.open('Alice');
        assert.match(allText(dialog.dialog), /Prompt 40/);
        assert.strictEqual(dialog.dialog.children.length, 3);
    });
})();
