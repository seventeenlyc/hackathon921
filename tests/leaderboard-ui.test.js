const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(projectRoot, 'src', 'leaderboard', 'LeaderboardUI.ts'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'styles.less'), 'utf8');
const index = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const i18nSource = fs.readFileSync(path.join(projectRoot, 'src', 'i18n.ts'), 'utf8');
const strategySource = fs.readFileSync(path.join(projectRoot, 'src', 'StrategyPanel.ts'), 'utf8');

assert.match(uiSource, /getElementById\('inert'\)!\.appendChild\(this\.overlay\)/,
    'Username overlay must be mounted under #inert so scoped Less styles apply');
assert.match(uiSource, /getElementById\('leaderboard-slot'\)/,
    'Leaderboard panel must prefer the dedicated status-panel slot');
assert.doesNotMatch(uiSource, /HTMLDetailsElement|createElement\('details'\)/,
    'Leaderboard must be visible without opening a secondary disclosure');
assert.match(uiSource, /getElementById\('inert'\)!\.appendChild\(this\.root\)/,
    'Leaderboard panel must retain an #inert fallback for isolated contexts');
assert.match(styles, /#inert[\s\S]*\.username-overlay/,
    'Username overlay styles must remain scoped under #inert');
// 登录浮窗结构：头像网格（radiogroup）、16 字上限的代号输入与计数、随机预选与头像会话写入、语言切换。
assert.match(uiSource, /gate-avatar-grid/, 'the gate must render the avatar selection grid');
assert.match(uiSource, /role="radiogroup"/, 'avatar selection must be exposed as a radiogroup');
assert.match(uiSource, /maxlength="16"/, 'the codename input keeps the 16-char limit');
assert.match(uiSource, /gate-counter/, 'the codename input must show a character counter');
assert.match(uiSource, /randomAvatarId/, 'the gate must preselect a random avatar');
assert.match(uiSource, /setSessionAvatar/, 'submitting the gate must store the chosen avatar');
assert.match(uiSource, /gate-lang/, 'the gate must expose a language toggle button');
assert.match(uiSource, /toggleLang/, 'the language toggle must switch the i18n language');
assert.match(uiSource, /onLangChange\(\(\) => this\.render\(\)\)/,
    'the gate must re-render its copy when the language changes');
assert.doesNotMatch(uiSource, /gate\.welcome|gate\.prompt|gate\.brand\b|gate\.brandSub|gate\.title\b|gate\.titleSub|gate\.identEn|gate\.identZh|gate\.profileSub|gate\.codenameSub|directive\.|flux\.title|ghost\.title|database\.title|database\.tabTachikoma/,
    'retired i18n keys must not be referenced anymore');
for (const copy of ['PROTECT AOI', 'OPERATOR IDENTIFICATION', 'RANDOM PROFILE', 'TACHIKOMA LINK // STANDBY']) {
    assert.ok(i18nSource.includes(copy), `i18n table must carry the gate copy: ${copy}`);
}
assert.match(styles, /#inert[\s\S]*\.leaderboard-panel/,
    'Leaderboard panel styles must remain scoped under #inert');
assert.doesNotMatch(uiSource, /No scores yet[\s\S]{0,180}return;/,
    'Empty leaderboard must not return before rendering the current-user footer');
assert.match(index, /id="control-layer"/, 'the page must expose a stable control-layer root');
assert.match(index, /class="control-card status-panel/, 'the page must expose the ghost status region');
assert.match(index, /class="control-card chatbox-panel/, 'the page must expose the directive (chatbox) region');
const statusStart = index.indexOf('class="control-card status-panel"');
const statusClose = index.indexOf('</section>', statusStart);
const towerPanel = index.indexOf('class="tower-panel');
assert.ok(statusStart >= 0 && statusClose >= 0 && towerPanel > statusClose,
    'the tactical database must come after the left-rail sections in source order');
assert.match(index, /id="controls-collapse"/, 'the page must expose an accessible collapse control');
assert.match(index, /tabindex="0"/, 'the battlefield must be keyboard focusable');
assert.match(index, /id="towers-wrapper"/, 'the page must expose the human deployable tower mount');
assert.match(index, /class="tactical-header"/, 'the page must expose the workstation header strip');
assert.match(index, /id="threat-list"/, 'the page must expose the threat information readout');
assert.match(styles, /#inert > \.leaderboard-panel[\s\S]*position:\s*fixed[\s\S]*right:\s*12px;/,
    'the leaderboard fallback must pin to the top-right like the right rail');
assert.match(styles, /\.leaderboard-panel[\s\S]*pointer-events:\s*auto;/,
    'the leaderboard must opt back into pointer events inside the click-through control layer');
assert.match(index, /class="rail rail-right"[\s\S]*id="leaderboard-slot"[\s\S]*class="control-card items-panel"/,
    'the right rail must lead with the network archive and close with battle items');
assert.match(styles, /\.rail-left,[\s\S]*?flex-direction:\s*column;/,
    'the workstation rails must lay their panels out vertically');
assert.match(styles, /\.database-panel \{[\s\S]*?position:\s*absolute;/,
    'the tactical database must be its own bottom-center surface');
assert.match(styles, /#inert\.mode-human \.chatbox-panel/, 'the directive panel must stay hidden in human mode');
assert.match(strategySource, /getControlLayer\(\)\.hide\(\)/,
    'valid strategy submission must hide the control layer after queueing');
assert.match(strategySource, /showHint\(\)/,
    'valid strategy submission must reveal the first-view gesture hint');

const ts = require('typescript');

// AvatarCatalog 是纯模块，可在沙箱外转译后直接加载；avatarAssets 依赖 PNG import，
// 只能用按 id 映射的假 URL stub（行为测试只消费字符串，不发请求）。
const catalogModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(
    fs.readFileSync(path.join(projectRoot, 'src', 'leaderboard', 'AvatarCatalog.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
).outputText)(catalogModule, catalogModule.exports);
const avatarCatalog = catalogModule.exports;

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.listeners = {};
        this._textContent = '';
        this.className = '';
        this.classList = {
            add: cls => { if (!this.className.includes(cls)) this.className += ' ' + cls; },
            remove: cls => { this.className = this.className.replace(cls, '').trim(); },
        };
        this.hidden = false;
        this.type = 'button';
    }
    get textContent() {
        return this._textContent || '';
    }
    set textContent(val) {
        this._textContent = String(val);
        if (val === '') {
            this.children = [];
        }
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    append(...children) { children.forEach(c => this.appendChild(c)); }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(c => c !== this);
        this.parentNode = null;
    }
    setAttribute(name, value) { this[name] = String(value); }
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    click() { for (const l of this.listeners.click || []) l(); }
    querySelector(sel) {
        if (sel === 'input') return this.children.find(c => c.tagName === 'INPUT');
        if (sel === '.error') return this.children.find(c => c.className === 'error');
        if (sel === 'form') return this.children.find(c => c.tagName === 'FORM');
        return null;
    }
}

class FakeDocument {
    constructor() {
        this.elements = new Map();
        this.inert = new FakeElement('div');
        this.inert.id = 'inert';
        this.slot = new FakeElement('div');
        this.slot.id = 'leaderboard-slot';
        this.elements.set('inert', this.inert);
        this.elements.set('leaderboard-slot', this.slot);
    }
    getElementById(id) { return this.elements.get(id) || null; }
    createElement(tag) {
        const el = new FakeElement(tag);
        el.ownerDocument = this;
        return el;
    }
}

function loadUI(document, currentPlayMode, remoteData = null) {
    const js = ts.transpileModule(uiSource, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    const dependencies = {
        './LeaderboardStore': {
            sanitizeUsername: v => (typeof v === 'string' ? v.trim() : null),
            readStoredLeaderboard: () => [],
            writeStoredLeaderboard: () => {},
            submitScore: () => ({ entries: [], rank: null }),
            entriesForBoard: entries => entries,
        },
        './SessionIdentity': { getSessionUsername: () => 'Alice', setSessionUsername: () => true },
        './AvatarCatalog': avatarCatalog,
        './avatarAssets': {
            AVATAR_SRC: Object.fromEntries(avatarCatalog.AVATARS.map(a => [a.id, 'fake://' + a.id])),
        },
        './LeaderboardClient': {
            fetchSharedLeaderboard: async (u, mode, limit) => remoteData ? remoteData(mode) : null,
        },
        './RunSync': {
            runSync: { onStatus: () => {}, onDrained: () => {}, retryPending: () => {}, enqueueWave: () => {} },
        },
        './PromptHistoryDialog': {
            PromptHistoryDialog: class {
                constructor() { this.opened = []; }
                open(name) { this.opened.push(name); }
            },
        },
        '../i18n': {
            t: (k, v = {}) => {
                if (k === 'lb.modeAi') return 'AI';
                if (k === 'lb.modeHuman') return '人类';
                return k + (v.name ? `:${v.name}` : '') + (v.rank ? `:${v.rank}` : '');
            },
            onLangChange: () => {},
        },
        '../PlayMode': { playMode: currentPlayMode },
    };
    new Function('module', 'exports', 'require', 'document', js)(
        moduleObj,
        moduleObj.exports,
        name => {
            if (name in dependencies) return dependencies[name];
            throw new Error('Unexpected dep: ' + name);
        },
        document
    );
    return moduleObj.exports;
}

// 1. AI 模式下的切换循环：ai -> human -> total -> ai
{
    const doc = new FakeDocument();
    const { LeaderboardPanel } = loadUI(doc, 'ai');
    const panel = new LeaderboardPanel();
    assert.strictEqual(panel.currentMode, 'ai', 'AI 模式初始榜单为 ai');
    const toggleBtn = panel.modeButton;
    assert.ok(toggleBtn, '必须提供榜单切换按钮');
    toggleBtn.click();
    assert.strictEqual(panel.currentMode, 'human', '第一次点击切换至 human');
    toggleBtn.click();
    assert.strictEqual(panel.currentMode, 'total', '第二次点击切换至 total');
    toggleBtn.click();
    assert.strictEqual(panel.currentMode, 'ai', '第三次点击循环回 ai');
}

// 2. 人类模式下的切换循环：human -> ai -> total -> human
{
    const doc = new FakeDocument();
    const { LeaderboardPanel } = loadUI(doc, 'human');
    const panel = new LeaderboardPanel();
    assert.strictEqual(panel.currentMode, 'human', '人类模式初始榜单为 human');
    const toggleBtn = panel.modeButton;
    assert.ok(toggleBtn, '必须提供榜单切换按钮');
    toggleBtn.click();
    assert.strictEqual(panel.currentMode, 'ai', '第一次点击切换至 ai');
    toggleBtn.click();
    assert.strictEqual(panel.currentMode, 'total', '第二次点击切换至 total');
    toggleBtn.click();
    assert.strictEqual(panel.currentMode, 'human', '第三次点击循环回 human');
}

// 3. 渲染同一玩家的 AI 与人类记录：两行、两个不同标志、仅 AI 包含 Prompt 历史按钮
(async () => {
    const doc = new FakeDocument();
    const remoteData = mode => ({
        entries: [
            { rank: 1, username: 'Alice', wave: 20, achievedAt: 100, mode: 'human' },
            { rank: 2, username: 'Alice', wave: 10, achievedAt: 50, mode: 'ai' },
        ],
        me: { username: 'Alice', rank: 1, wave: 20, mode: 'human' },
    });
    const { LeaderboardPanel } = loadUI(doc, 'ai', remoteData);
    const panel = new LeaderboardPanel();
    // 渲染总榜
    await panel.refresh('total');
    const items = panel.listEl.children;
    assert.strictEqual(items.length, 2, '总榜应渲染两条记录');

    // 第一条：human
    const humanItem = items[0];
    const humanFlag = humanItem.children.find(c => c.className && c.className.includes('mode'));
    assert.ok(humanFlag, '人类记录必须有模式标识');
    assert.match(humanFlag.textContent, /人|Human/);
    const humanButton = humanItem.children.find(c => c.tagName === 'BUTTON' && c.className === 'name');
    assert.strictEqual(humanButton, undefined, '人类记录不得有 Prompt 历史按钮');

    // 第二条：ai
    const aiItem = items[1];
    const aiFlag = aiItem.children.find(c => c.className && c.className.includes('mode'));
    assert.ok(aiFlag, 'AI 记录必须有模式标识');
    assert.match(aiFlag.textContent, /AI/);
    const aiButton = aiItem.children.find(c => c.tagName === 'BUTTON' && c.className === 'name');
    assert.ok(aiButton, 'AI 记录必须包含 Prompt 历史按钮');

    console.log('Validated leaderboard UI mount points and empty-state footer flow.');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
