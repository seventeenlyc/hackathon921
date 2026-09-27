/**
 * Source-level guards for the battlefield status panel.
 *
 * The three metric cards (tactical credit / wave / phase) follow the design
 * mock: bronze bordered card, small bronze label, large bright value, and a
 * bilingual state sub-line. Like i18n.test.js this reads the TypeScript and
 * Less sources directly, so it needs no build and no DOM.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const i18nSource = fs.readFileSync(path.join(projectRoot, 'src', 'i18n.ts'), 'utf8');
const interfaceSource = fs.readFileSync(path.join(projectRoot, 'src', 'InterfaceManager.ts'), 'utf8');
const stylesSource = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'styles.less'), 'utf8');

// --- markup: three metric cards with label / value / state sub-line ---
const gridMatch = index.match(/<div class="status-grid"[\s\S]*?<\/div>\s*<\/section>/);
assert.ok(gridMatch, 'status grid missing from index.html');
const grid = gridMatch[0];
const metrics = grid.match(/class="status-metric"/g) || [];
assert.strictEqual(metrics.length, 3, 'expected exactly three status metrics');

for (const key of ['label.cash', 'label.wave', 'label.state']) {
    assert.ok(
        grid.includes(`data-i18n="${key}"`),
        `status metric label must reference ${key}`,
    );
    assert.ok(
        grid.match(new RegExp(`class="status-label" data-i18n="${key}"`)),
        `${key} label must use the status-label class`,
    );
}

assert.ok(grid.includes('<strong id="state">'), 'state value must be the strong element');
assert.ok(!grid.includes('state-sub'), 'the bilingual state sub-line must be removed');
assert.ok(grid.includes('id="wave"'), 'wave card must keep the #wave value slot');
assert.ok(grid.includes('id="delay"'), 'wave card must keep the inter-wave delay slot');

// --- 波次进度条：100% = 200 波，每关 0.5% ---
const panel = index.slice(index.indexOf('class="control-card status-panel"'), index.indexOf('</section>', index.indexOf('class="control-card status-panel"')));
assert.ok(panel.includes('id="status-progress-fill"'), 'progress bar fill element missing');
assert.ok(panel.includes('id="status-progress-pct"'), 'progress percentage element missing');
assert.match(interfaceSource, /getElementById\('status-progress-fill'\)/, 'setWave must drive the progress fill');
assert.match(interfaceSource, /getElementById\('status-progress-pct'\)/, 'setWave must refresh the progress percentage');
assert.match(interfaceSource, /Math\.min\(wave, 200\) \/ 200 \* 1000/, 'progress must cap at wave 200');

// --- i18n: state main value is EN in both locales, sub-line is zh in both ---
function tableValue(key, locale) {
    const match = i18nSource.match(new RegExp(`'${key}':\\s*\\{zh: '((?:[^'\\\\]|\\\\.)*)',\\s*en: '((?:[^'\\\\]|\\\\.)*)'\\}`));
    assert.ok(match, `i18n key ${key} missing`);
    return match[locale === 'zh' ? 1 : 2];
}

for (const state of ['idle', 'running', 'paused', 'planning']) {
    // 主值随界面语言：中文界面中文、英文界面英文；不再渲染任何对照副行。
    assert.ok(
        /[\u4e00-\u9fff]/.test(tableValue(`state.${state}`, 'zh')),
        `state.${state} 中文界面的主值必须是中文`,
    );
    assert.ok(
        /^[A-Z]/.test(tableValue(`state.${state}`, 'en')),
        `state.${state} 英文界面的主值必须是大写英文`,
    );
    assert.ok(!i18nSource.includes(`stateSub.${state}`),
        `stateSub.${state} 对照副行已退役，不得回潜`);
}

// --- InterfaceManager: zero-padded wave + sub-line updates ---
assert.ok(
    /waveElement\.textContent = String\(wave\)\.padStart\(3, '0'\)/.test(interfaceSource),
    'setWave must render the wave zero-padded to three digits',
);
assert.ok(
    !/stateSub/.test(interfaceSource),
    'InterfaceManager must not reference the retired stateSub table',
);

// --- styles: the design's bronze card treatment exists ---
const metricBlock = stylesSource.match(/\.status-metric \{[\s\S]*?\n    \}/);
assert.ok(metricBlock, '.status-metric block missing from styles.less');
assert.ok(metricBlock[0].includes('rgba(212, 179, 113'), 'status cards must use the bronze accent border');
assert.ok(/\.status-label/.test(metricBlock[0]), 'status label must be styled');
assert.ok(!metricBlock[0].includes('.status-sub'), 'status sub-line styles must be removed');
assert.ok(/#delay/.test(metricBlock[0]), 'wave delay suffix must be styled dimmer than the value');

console.log('Status panel UI assertions passed.');
