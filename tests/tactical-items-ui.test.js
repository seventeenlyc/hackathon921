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
    // Four real icons live in src/assets/items/ and the stylesheet must wire each
    // tactical item to the icon matching its effect.
    const iconByItem = {
        evomap: 'icon_crosshair.png',     // 全域轨道打击 — targeting crosshair
        tripo: 'icon_fire.png',           // 火力重构 — fire / damage
        seeed: 'icon_gear.png',           // 天然机油 — attack speed / gears
        hypershell: 'icon_medical.png',   // 外骨骼应急修复 — heal / repair
    };
    for (const [id, key] of [
        ['item-evomap', 'evomap'], ['item-tripo', 'tripo'],
        ['item-seeed', 'seeed'], ['item-hypershell', 'hypershell'],
    ]) {
        assert.ok(html.includes(`id="${id}"`), `${key} needs a visible button`);
        assert.ok(html.includes(`data-i18n="item.${key}.name"`), `${key} needs localized equipment copy`);
        assert.ok(translations.includes(`'item.${key}.name'`), `${key} must have translated equipment copy`);
        const icon = iconByItem[key];
        assert.ok(fs.existsSync(path.join(root, `src/assets/items/${icon}`)), `${key} needs a real icon`);
        assert.ok(css.includes(`url('../assets/items/${icon}')`),
            `${key} stylesheet must reference its tactical icon`);
        assert.ok(new RegExp(`\\.icon-${key}\\b`).test(css), `${key} stylesheet must scope its tactical icon`);
    }
    console.log('Tactical item panel selectors, copy and icons passed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
