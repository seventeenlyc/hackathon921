const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const less = require('less');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/styles/styles.less'), 'utf8');
const translations = fs.readFileSync(path.join(root, 'src/i18n.ts'), 'utf8');

(async () => {
    const {css} = await less.render(source, {filename: path.join(root, 'src/styles/styles.less')});
    // A prior rule nested the grid under .tower-panel; the actual markup puts it in .items-panel.
    assert.ok(css.includes('#inert .controls .items-panel .tactical-items-grid {'),
        'item grid styles must match the right-hand items panel');
    assert.ok(!css.includes('.tower-panel .tactical-items-grid'),
        'item styles must not be scoped to the tower catalogue');
    for (const [id, key] of [
        ['item-evomap', 'evomap'], ['item-tripo', 'tripo'],
        ['item-seeed', 'seeed'], ['item-hypershell', 'hypershell'],
    ]) {
        assert.ok(html.includes(`id="${id}"`), `${key} needs a visible button`);
        assert.ok(html.includes(`data-i18n="item.${key}.name"`), `${key} needs localized equipment copy`);
        assert.ok(translations.includes(`'item.${key}.name'`), `${key} must have translated equipment copy`);
        assert.ok(fs.existsSync(path.join(root, `src/assets/ui/item-${key}.png`)), `${key} needs a real icon`);
    }
    console.log('Tactical item panel selectors, copy and icons passed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
