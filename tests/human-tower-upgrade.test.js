const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('index.html');
const placer = read('src/TowerPlacer.ts');
const ui = read('src/InterfaceManager.ts');
const game = read('src/Game.ts');
const styles = read('src/styles/styles.less');
const translations = read('src/i18n.ts');

assert.match(html, /id="tower-upgrade-panel"/, 'the battlefield must mount a selected-tower panel');
assert.match(html, /id="tower-upgrade-level"/, 'the panel must expose the selected tower level');
assert.match(html, /id="tower-upgrade-cost"/, 'the panel must expose the next upgrade cost');
assert.match(html, /id="tower-upgrade-button"/, 'the panel must expose a manual upgrade button');
assert.match(placer, /getState\(\)\.towers/, 'selection must use live engine action state');
assert.match(placer, /upgradeTower\(/, 'manual upgrades must use the validated GameActions port');
assert.match(placer, /playMode !== 'human'/, 'the human action path must reject AI mode');
assert.match(game, /towerPlacer\.setSelectionListener/, 'the selected-tower panel must follow selection changes');
assert.match(ui, /textContent\s*=/, 'selected tower data must be rendered as text');
assert.doesNotMatch(ui, /innerHTML\s*=/, 'selected tower data must never enter HTML parsing');
assert.match(ui, /cashManager\.canWithdraw/, 'the upgrade button must reflect available resources');
assert.match(ui, /tower\.upgradeCost === null/, 'the upgrade button must stop at maximum level');
assert.match(ui, /towerUpgradeButton\.disabled\s*=/, 'invalid upgrade states must disable the button');
assert.match(ui, /cashManager\.onBalanceChange\(\(\) => this\.updateTowerUpgradeAvailability\(\)\)/,
    'cash changes must refresh upgrade affordability immediately');
assert.match(styles, /\.tower-upgrade-panel/, 'the panel must use the tactical database visual system');
assert.match(translations, /tower\.upgrade\.button[\s\S]*?zh:[\s\S]*?en:/,
    'upgrade controls must have Chinese and English labels');

console.log('Human tower upgrade UI assertions passed.');
