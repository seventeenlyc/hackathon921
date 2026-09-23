/**
 * Source-level guards for the tactical database panel's fixed height.
 *
 * The panel (战力数据库) hosts two tab views (我方兵力 / 敌方情报). The user
 * confirmed (2026-09-24) that clicking the tabs must never resize the panel.
 * Like i18n.test.js this reads the HTML and Less sources directly, so it needs
 * no build and no DOM.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const interfaceSource = fs.readFileSync(path.join(projectRoot, 'src', 'InterfaceManager.ts'), 'utf8');
const stylesSource = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'styles.less'), 'utf8');

/** Extract a top-level `{ selector... { ... } }` block by brace matching, comments stripped. */
function extractBlock(source, openPattern) {
    const open = source.match(openPattern);
    if (!open) return null;
    const start = open.index + open[0].length;
    let depth = 1;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) {
                // Strip Less line comments so prose can never satisfy or defeat a guard.
                return source.slice(start, i).replace(/\/\/[^\n]*/g, '');
            }
        }
    }
    return null;
}

// --- markup: two tab views and their tabs -----------------------------------
assert.ok(index.includes('id="db-view-tachikoma"'), 'friendly view missing');
assert.ok(index.includes('id="db-view-hostile"'), 'hostile view missing');
assert.ok(index.includes('id="db-tab-tachikoma"'), 'friendly tab missing');
assert.ok(index.includes('id="db-tab-hostile"'), 'hostile tab missing');
assert.match(
    index,
    /id="db-view-hostile"[^>]*hidden/,
    'hostile view must start hidden so the friendly view defines the initial height',
);

// --- tab switching keeps toggling `hidden` -----------------------------------
assert.ok(
    interfaceSource.includes('viewTachikoma.hidden = !tachikomaActive;') &&
    interfaceSource.includes('viewHostile.hidden = tachikomaActive;'),
    'tab switch must keep using the hidden attribute (the CSS guard below relies on it)',
);

// --- panel: grid-stack so the height equals the taller view, always -----------
const panelBlock = extractBlock(stylesSource, /\.database-panel\s*\{/);
assert.ok(panelBlock, '.database-panel block missing from styles.less');
assert.match(panelBlock, /display:\s*grid/, 'panel must be a grid to stack both views in one cell');
assert.match(
    panelBlock,
    /\.db-view\s*\{[^}]*grid-area:\s*2\s*\/\s*1/,
    'both tab views must share grid cell 2/1 so switching tabs never resizes the panel',
);
const hiddenViewBlock = panelBlock.match(/&\[hidden\]\s*\{([^}]*)\}/);
assert.ok(hiddenViewBlock, 'the hidden tab view must keep a styled state');
assert.doesNotMatch(
    hiddenViewBlock[1],
    /display:\s*none/,
    'display:none would drop the hidden view from layout and make the panel height jump',
);
assert.match(hiddenViewBlock[1], /display:\s*block/, 'hidden view must stay a layout participant');
assert.match(hiddenViewBlock[1], /visibility:\s*hidden/, 'hidden view must stay visually hidden');

// --- tower stats: fixed height so selecting a unit cannot resize the panel ----
const towerStatsBlock = extractBlock(stylesSource, /\.tower-stats\s*\{/);
assert.ok(towerStatsBlock, '.tower-stats block missing from styles.less');
assert.doesNotMatch(towerStatsBlock, /min-height:/, 'min-height lets the populated stats grow the panel');
assert.match(towerStatsBlock, /height:\s*110px/, 'stats box must keep the measured populated height');
assert.match(towerStatsBlock, /overflow-y:\s*auto/, 'stats overflow must scroll inside the fixed box');

console.log('Database panel fixed-height guards passed.');
