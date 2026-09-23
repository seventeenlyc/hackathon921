const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

const index = read('index.html');
const strategy = read('src/StrategyPanel.ts');
const interfaceSource = read('src/InterfaceManager.ts');
const controls = read('src/Controls.ts');
const towerPlacer = read('src/TowerPlacer.ts');
const game = read('src/Game.ts');
const battlefield = read('src/agent/InertBattlefield.ts');
const leaderboard = read('src/leaderboard/LeaderboardUI.ts');

assert.match(index, /id="strategy-random"/, 'the strategy console must expose a random strategy button');
assert.match(index, /id="mode"/, 'the operations panel must expose the play-mode switch');
assert.match(index, /id="towers-wrapper"/, 'the UI must mount the deployable tower palette');
assert.match(index, /id="towers-stats"/, 'the UI must mount the selected tower stats');
assert.doesNotMatch(index, /<details class="tower-panel">/, 'tower information must be visible on the primary page');
assert.doesNotMatch(leaderboard, /createElement\('details'\)/, 'leaderboard information must be visible on the primary page');
assert.match(strategy, /randomStrategy()/, 'the random strategy button must use the strategy library');
assert.match(interfaceSource, /playMode === ['"]human['"]/, 'the tower palette must be scoped to human mode');
assert.match(interfaceSource, /if \(playMode === 'human'\) towerPlacer\.place\(TowerClass\)/,
    'AI tower cards must be read-only while human cards enter placement');
assert.doesNotMatch(interfaceSource, /if \(playMode === 'human'\) this\.setTowers\(\)/,
    'the tower palette must be mounted in both play modes');
assert.match(interfaceSource, /aria-label/, 'tower choices must be keyboard and screen-reader discoverable');
assert.match(interfaceSource, /tower\.aimRadius/, 'tower stats must show deployment range');
assert.match(interfaceSource, /tower\.dps/, 'tower stats must show damage per second when applicable');
assert.match(controls, /emit\(['"]click['"]/, 'Canvas clicks must be forwarded through the input boundary');
assert.match(towerPlacer, /GameActions/, 'human placement must use the validated GameActions port');
assert.match(towerPlacer, /buildTower\(/, 'human placement must execute through buildTower');
assert.doesNotMatch(towerPlacer, /cashManager\.withdraw|map\.addElement/, 'human placement must not bypass GameActions');
assert.match(battlefield, /cashManager\.withdraw\(tower\.cost\)/, 'validated tower builds must deduct their cost');
assert.match(game, /playMode === 'ai' \? agentRuntime : humanPlanner/, 'human mode must disable the AI planner');
assert.match(game, /if \(playMode === 'human'\) towerPlacer\.update\(\)/, 'human mode must update placement preview');
assert.match(interfaceSource, /pauseButton\.hidden = state === 'paused'/,
    'the pause control must remain in the upper-right control group outside paused state');
assert.match(interfaceSource, /pauseButton\.disabled = state === 'idle' \|\| state === 'planning'/,
    'the pause control must be disabled until a run can be paused');

const mainSource = read('src/main.ts');
assert.match(game, /export function startHumanRun/, 'Game.ts must export startHumanRun');
assert.doesNotMatch(game, /if \(playMode === 'human'\)\s*\{\s*gameLoop\.start\(\)/,
    'human mode must not auto-start on module load; it waits for nickname confirmation');
assert.match(game, /submitRunScore\(username, wave, playMode\)/,
    'Game.recordReachedWave must pass playMode to submitRunScore');
assert.match(mainSource, /startHumanRun\(name\)/,
    'main.ts must call startHumanRun upon valid nickname confirmation in human mode');
assert.doesNotMatch(mainSource, /if \(playMode === 'ai'\)\s*\{\s*if \(document\.readyState/,
    'main.ts must show UsernameGate in both modes');

console.log('Human mode and random strategy UI assertions passed.');
