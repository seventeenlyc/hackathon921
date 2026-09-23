const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadDecisionSummary() {
    const sourcePath = path.join(__dirname, '..', 'src', 'DecisionSummary.ts');
    assert.ok(fs.existsSync(sourcePath), 'DecisionSummary view is not implemented yet');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
    }).outputText;
    const moduleObj = {exports: {}};
    new Function('module', 'exports', js)(moduleObj, moduleObj.exports);
    return moduleObj.exports.DecisionSummary;
}

const DecisionSummary = loadDecisionSummary();
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const commandPanel = html.indexOf('class="control-card chatbox-panel"');
const summaryPanel = html.indexOf('id="decision-summary-panel"');
const executionPanel = html.indexOf('class="control-card flux-panel"');
assert.ok(commandPanel !== -1 && commandPanel < summaryPanel, 'decision terminal follows the command panel');
assert.ok(summaryPanel !== -1 && summaryPanel < executionPanel, 'execution log remains below the decision terminal');
assert.ok(html.includes('id="decision-summary-status"') && html.includes('id="decision-summary"'));

const panel = {setAttribute(name, value) { this[name] = value; }};
const status = {textContent: ''};
const content = {textContent: ''};
const view = new DecisionSummary(panel, status, content);

view.setThinking('AI 正在分析战场…');
assert.strictEqual(panel['data-state'], 'planning');
assert.strictEqual(status.textContent, 'AI 正在分析战场…');

view.setSummary('<img src=x onerror=alert(1)>', '本波决策摘要');
assert.strictEqual(panel['data-state'], 'ready');
assert.strictEqual(status.textContent, '本波决策摘要');
assert.strictEqual(content.textContent, '<img src=x onerror=alert(1)>');

view.setUnavailable('本轮没有可显示的摘要');
assert.strictEqual(panel['data-state'], 'unavailable');
assert.strictEqual(status.textContent, '本轮没有可显示的摘要');
assert.strictEqual(content.textContent, '');

console.log('Decision summary rendering tests passed.');
