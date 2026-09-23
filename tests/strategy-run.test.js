const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'StrategyQueue.ts'), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;

const events = [];
let queued = null;
const openingPrompt = { version: 1, text: 'opening prompt', fromWave: 1 };
const dependencies = {
    './agent/GameLoop': { gameLoop: { isIdle: () => true, start: () => events.push('game-start') } },
    './agent/StrategyStore': {
        effectiveWave: (wave, isIdle) => isIdle ? Math.max(1, wave) : wave + 1,
        strategyStore: {
            submit: (text, fromWave) => { queued = { version: 1, text, fromWave }; return queued; },
            activateForRun: () => queued || openingPrompt,
        },
    },
    './WavesManager': { waveManager: { waveCounter: 1, start: () => events.push('wave-start') } },
    './leaderboard/SessionIdentity': { getSessionUsername: () => 'Alice' },
    './PlayMode': { playMode: 'ai' },
    './leaderboard/RunSync': {
        runSync: {
            prepareRun: (username, mode) => events.push(['prepare', username, mode]),
            enqueuePrompt: (username, version) => events.push(['prompt', username, version]),
        },
    },
    './AudioManager': { audioManager: { beginRun: wave => events.push(['music-start-at-wave', wave]) } },
    './CashManager': { cashManager: { setBalance() {} } },
    './InterfaceManager': { interfaceManager: { setWave() {} } },
    './dev': { devController: { isUnlocked: false, getConfig: () => ({ startWave: 1, startCash: 200 }), onChange() {} }, DEV_MAX_START_WAVE: 9999, DEV_MAX_START_CASH: 1000000000 },
};
const moduleObj = { exports: {} };
new Function('module', 'exports', 'require', js)(
    moduleObj,
    moduleObj.exports,
    name => {
        if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
        return dependencies[name];
    },
);

moduleObj.exports.queueStrategy('opening prompt');
moduleObj.exports.startRun();

const promptEvent = events.find(event => Array.isArray(event) && event[0] === 'prompt');
assert.deepStrictEqual(promptEvent, ['prompt', 'Alice', openingPrompt],
    'the prompt activated before the first PLANNING event must still enter this run history');
assert.ok(events.findIndex(event => Array.isArray(event) && event[0] === 'prepare')
    < events.findIndex(event => Array.isArray(event) && event[0] === 'prompt'),
'the run must be prepared before its opening prompt is appended');
assert.ok(events.some(event => Array.isArray(event) && event[0] === 'music-start-at-wave' && event[1] === 1),
    'music begins with the opening wave, not a random pre-run track');

console.log('Opening prompt run recording passed.');
