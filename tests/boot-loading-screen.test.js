const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const html = fs.readFileSync('index.html', 'utf8');
const head = html.split('</head>')[0];
const style = /<style\s+id="boot-style"[^>]*>([\s\S]*?)<\/style>/.exec(head)?.[1];
assert.ok(style, 'initial HTML needs inline critical CSS before the module stylesheet loads');
assert.match(style, /html:not\(\.app-ready\)\s+#inert\s*\{[^}]*visibility:\s*hidden/s,
    'raw game HTML must remain hidden until initialized');
assert.match(style, /#loading-screen\s*\{[^}]*position:\s*fixed;[^}]*background:/s,
    'loading state must cover the viewport with a themed background without relying on JS/CSS imports');
assert.match(style, /html\.app-ready\s+#loading-screen\s*\{[^}]*display:\s*none/s,
    'loading screen must disappear after the app becomes ready');
assert.match(style, /prefers-reduced-motion:\s*reduce/, 'loading animation must respect reduced motion');

const loader = html.indexOf('id="loading-screen"');
const app = html.indexOf('id="inert"');
assert.ok(loader > html.indexOf('<body') && loader < app,
    'an accessible static loading screen must appear before the unstyled application');
assert.match(html.slice(loader, app), /role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/,
    'loading state should be announced without trapping focus');
console.log('  ok  critical pre-module loading markup and theme are present');

// Execute the actual bootstrap module with its game/browser ports replaced:
// no client/network/style resources are needed to test the handoff ordering.
const source = fs.readFileSync('src/main.ts', 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText;
for (const readyState of ['complete', 'loading']) for (const mode of ['ai', 'human']) {
    const events = [];
    let onDOMContentLoaded;
    const document = {
        readyState,
        documentElement: {classList: {add: className => events.push(className)}},
        addEventListener: (name, callback) => {
            assert.equal(name, 'DOMContentLoaded');
            onDOMContentLoaded = callback;
        },
    };
    let gate;
    class UsernameGate {
        constructor(onDone) { this.onDone = onDone; gate = this; }
        show() { events.push('gate-shown'); }
        confirm(name) { this.onDone(name); }
    }
    const ports = {
        './styles/styles.less': {}, './Game': {startHumanRun(name) { events.push(['human-run', name]); }},
        './StrategyPanel': {strategyPanel: {}},
        './leaderboard/LeaderboardUI': {UsernameGate, leaderboardPanel: {refresh() { events.push('refresh'); }}},
        './leaderboard/SessionIdentity': {clearLegacyUsernameCookie() {}, getSessionAvatar() {}},
        './leaderboard/LeaderboardClient': {ensureSessionToken() { events.push('session'); }},
        './PlayMode': {playMode: mode},
        './AudioManager': {audioManager: {startMusic() { events.push('music-start'); }}},
    };
    vm.runInNewContext(compiled, {
        exports: {}, document,
        require: path => {
            assert.ok(ports[path], `Unexpected bootstrap dependency: ${path}`);
            return ports[path];
        },
    });
    if (readyState === 'loading') {
        assert.deepEqual(events, [], 'loader stays visible until DOMContentLoaded');
        assert.ok(onDOMContentLoaded);
        onDOMContentLoaded();
    }
    assert.deepEqual(events, ['gate-shown', 'app-ready'],
        'the loading screen must clear only after the username gate is visible');
    gate.confirm('Alice');
    assert.deepEqual(events, ['gate-shown', 'app-ready', 'session', 'refresh',
        ...(mode === 'human' ? [['human-run', 'Alice']] : [])],
    'confirming a nickname must not start music; human mode starts its actual run');
}
console.log('  ok  nickname confirmation remains silent in both modes and DOM states');
console.log('All boot loading screen tests passed.');
