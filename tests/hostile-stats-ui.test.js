/**
 * 敌方情报面板的实时数值守卫。
 *
 * 卡片数值必须随波次成长：data-* 保存基础值，tools/enemyScaling 换算出当前
 * 波次的有效数值（与 WavesManager 生成逻辑同源）。纯函数与源码标记在此断言。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const scalingSource = fs.readFileSync(path.join(projectRoot, 'src', 'tools', 'enemyScaling.ts'), 'utf8');
const interfaceSource = fs.readFileSync(path.join(projectRoot, 'src', 'InterfaceManager.ts'), 'utf8');
const wavesSource = fs.readFileSync(path.join(projectRoot, 'src', 'WavesManager.ts'), 'utf8');

// --- 纯函数换算：与引擎公式一致 ---
function loadScaling() {
    const js = ts.transpileModule(scalingSource, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
    }).outputText;
    const moduleObj = {exports: {}};
    new Function('module', 'exports', js)(moduleObj, moduleObj.exports);
    return moduleObj.exports;
}
const scaling = loadScaling();

// 波 1：ratio 1.1，原有 0.4 系数提升 30% 为 0.52 → 50 × 1.1 × 0.52 = 28.6
assert.ok(Math.abs(scaling.enemyLifeAtWave(50, 1) - 28.6) < 1e-9, 'wave 1 life must apply ratio and boosted relief');
assert.ok(Math.abs(scaling.enemyLifeAtWave(2000, 1) - 1144) < 1e-9, 'boss wave 1 life must be 2000 × 1.1 × 0.52');
// 波 200：仍使用提升后的 0.52 系数
assert.strictEqual(scaling.enemyLifeAtWave(50, 200), 50 * 21 * 0.52, 'wave 200 keeps the boosted relief factor');
// 波 201：缓冲取消
assert.strictEqual(scaling.enemyLifeAtWave(50, 201), 50 * (1 + 201 / 10), 'wave 201 drops the relief factor');
// 精英 Boss：1–200 波提升 30%，201 波起仍使用原有第 152 波基准
assert.strictEqual(scaling.enemyLifeAtWave(2000, 152, true), 2000 * 16.2 * 0.52,
    'boss life through wave 200 receives the 30% boost');
assert.strictEqual(scaling.enemyLifeAtWave(2000, 200, true), 2000 * 21 * 0.52,
    'boss life hints keep growing through wave 200 like the game');
assert.strictEqual(scaling.enemyLifeAtWave(2000, 300, true), 2000 * 16.2 * 0.4,
    'boss life after wave 201 must freeze at the original wave-152 value');
assert.strictEqual(scaling.enemySpeedAtWave(2.5, 152, 1, true), 1.3, 'boss speed through wave 200 receives the 30% boost');
assert.strictEqual(scaling.enemySpeedAtWave(2.5, 300, 1, true), 1, 'boss speed after wave 201 stays at its original wave-152 value');
// 速度：fast cap 1.7，波 30 时乘数 2 已被封顶为 1.7 → 4 × 1.7 × 0.52 = 3.536
assert.ok(Math.abs(scaling.enemySpeedAtWave(4, 30, 1.7) - 3.536) < 1e-9, 'fast speed at wave 30 = 4 × 1.7 × 0.52');
// 速度上限钳制：波 100 时 fast 的乘数封顶 1.7
assert.strictEqual(scaling.enemySpeedAtWave(4, 100, 1.7), 4 * 1.7 * 0.52, 'speed multiplier must clamp at the cap');
assert.strictEqual(scaling.enemySpeedAtWave(2.5, 100, 1), 2.5 * 0.52, 'uncapped enemy speed also receives the 30% boost');

// --- WavesManager 与共享系数同源（不允许出现游离的字面量系数）---
assert.ok(!/Math\.min\(1 \+ this\.waveCounter \/ 30/.test(wavesSource),
    'wave speed growth must come from the shared enemyScaling module');
assert.ok(!/= 1 \+ this\.waveCounter \/ 10;/.test(wavesSource),
    'wave life ratio must come from the shared enemyScaling module');
assert.ok(wavesSource.includes('waveLifeRatio(this.waveCounter)'), 'generateWave must use the shared life ratio');

// --- InterfaceManager：敌方情报随波次刷新 ---
assert.match(interfaceSource, /updateHostileStats\(wave\)/, 'setWave must refresh the hostile stats');
assert.match(interfaceSource, /enemyLifeAtWave\(/, 'hostile life values must come from the shared scaling module');
assert.match(interfaceSource, /enemySpeedAtWave\(/, 'hostile speed values must come from the shared scaling module');

// --- 标记：卡片携带基础值与速度上限，面板带波次标签 ---
const cards = index.match(/<div class="hostile-card"[^>]*>/g) || [];
assert.strictEqual(cards.length, 5, 'hostile panel must render five cards');
assert.ok(cards.every(card => /data-life="\d+"/.test(card)), 'every hostile card must declare base life');
assert.ok(cards.every(card => /data-speed="[\d.]+"/.test(card)), 'every hostile card must declare base speed');
assert.ok(cards.every(card => /data-cash="\d+"/.test(card)), 'every hostile card must declare base cash');
assert.ok(cards.every(card => /data-speed-cap="[\d.]+"/.test(card)), 'every hostile card must declare its speed cap');
assert.ok(cards.some(card => /data-boss="1"/.test(card)), 'the boss card must be flagged for the frozen-stats rule');
assert.match(index, /id="hostile-wave-tag"/, 'the hostile panel must expose the current-wave tag');
assert.ok(i18nHasWaveTag(), 'the wave tag must have an i18n entry');

function i18nHasWaveTag() {
    const i18nSource = fs.readFileSync(path.join(projectRoot, 'src', 'i18n.ts'), 'utf8');
    return /'database\.waveTag'/.test(i18nSource);
}

console.log('Hostile stats live-value assertions passed.');
