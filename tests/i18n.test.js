/**
 * Source-level guards for the i18n string table.
 *
 * The UI copy was consolidated into `src/i18n.ts`; a typo in a key or a missing
 * placeholder would otherwise only show up as a raw key on screen. This test is
 * deliberately DOM-free and reads the TypeScript source, so it needs no build.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'src', 'i18n.ts'), 'utf8');
const index = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

// Values are single-quoted with `\'` escapes; `\\.` consumes an escaped char.
const entryPattern = /'([^']+)':\s*\{zh:\s*'((?:[^'\\]|\\.)*)',\s*en:\s*'((?:[^'\\]|\\.)*)'\}/g;
const entries = new Map();
let match;
while ((match = entryPattern.exec(source)) !== null) {
    const [, key, zh, en] = match;
    assert.ok(!entries.has(key), `duplicate i18n key: ${key}`);
    entries.set(key, {zh, en});
}

assert.ok(entries.size > 100, `expected the full string table, found ${entries.size}`);

function placeholders(text) {
    const tokens = new Set();
    const re = /\{([a-zA-Z0-9_]+)\}/g;
    let found;
    while ((found = re.exec(text)) !== null) tokens.add(found[1]);
    return [...tokens].sort();
}

for (const [key, {zh, en}] of entries) {
    assert.ok(zh.length > 0, `${key} has an empty zh string`);
    assert.ok(en.length > 0, `${key} has an empty en string`);
    assert.deepStrictEqual(placeholders(zh), placeholders(en), `${key} placeholder mismatch`);
}

// Every key referenced from static markup must exist in the table.
const attrPattern = /data-i18n(?:-aria-label|-placeholder|-title)?="([^"]+)"/g;
let referenced = 0;
let attr;
while ((attr = attrPattern.exec(index)) !== null) {
    referenced += 1;
    assert.ok(entries.has(attr[1]), `index.html references unknown i18n key: ${attr[1]}`);
}
assert.ok(referenced >= 20, `expected static markup to reference i18n keys, found ${referenced}`);

// Keys the copy convergence depends on (shell, ARIA, unit display names).
for (const key of [
    'app.name',
    'shell.eyebrow',
    'towers.heading',
    'towers.selectHint',
    'console.eyebrow',
    'console.heading',
    'settings.title',
    'settings.spawnerNote',
    'controls.hint',
    'aria.battlefield',
    'aria.battlefieldControls',
    'aria.battlefieldStatus',
    'aria.deployableUnits',
    'aria.hideControls',
    'aria.gameControls',
    'aria.githubRepository',
    'title.hideControls',
    'tower.canon.name',
    'tower.gatling.name',
    'tower.slow.name',
    'tower.sniper.name',
    'tower.laser.name',
    'tower.cardAria',
    'tower.cardPlaceTitle',
    'tower.cardDetailsTitle',
    'tower.dpsTitle',
    'tower.summary',
    // 战术工作站位壳层（issue #66）：Header / 地图框装饰与新增面板文案；
    // 既有面板沿用 console.* / towers.heading / decisions.label / aria.battlefieldStatus 原文案。
    'map.sector',
    'map.intrusion',
    'map.liveBar',
    'map.waveTag',
    'threat.title',
    'threat.idle',
    'neural.title',
    'items.title',
    'database.tabHostile',
    'enemy.simple.name',
    'enemy.simple.desc',
    'enemy.boss.name',
    'enemy.boss.desc',
    // 登录浮窗：文案区分中英文；标题/眉标复用 app.name / header.subtitle / shell.eyebrow。
    'gate.systemOnline',
    'gate.identTitle',
    'gate.ident',
    'gate.profileTitle',
    'gate.codenameTitle',
    'gate.placeholder',
    'gate.random',
    'gate.continue',
    'gate.langToggle',
    'gate.invalid',
    'gate.footerLeft',
    'gate.footerRight',
    'gate.avatar.aramaki',
    'gate.avatar.boma',
]) {
    assert.ok(entries.has(key), `missing required i18n key: ${key}`);
}

console.log(`i18n table assertions passed (${entries.size} keys, ${referenced} markup references).`);
