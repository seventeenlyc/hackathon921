const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(projectRoot, 'src', 'leaderboard', 'LeaderboardUI.ts'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'styles.less'), 'utf8');
const index = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const strategySource = fs.readFileSync(path.join(projectRoot, 'src', 'StrategyPanel.ts'), 'utf8');

assert.match(uiSource, /getElementById\('inert'\)!\.appendChild\(this\.overlay\)/,
    'Username overlay must be mounted under #inert so scoped Less styles apply');
assert.match(uiSource, /getElementById\('leaderboard-slot'\)/,
    'Leaderboard panel must prefer the dedicated status-panel slot');
assert.doesNotMatch(uiSource, /HTMLDetailsElement|createElement\('details'\)/,
    'Leaderboard must be visible without opening a secondary disclosure');
assert.match(uiSource, /getElementById\('inert'\)!\.appendChild\(this\.root\)/,
    'Leaderboard panel must retain an #inert fallback for isolated contexts');
assert.match(styles, /#inert[\s\S]*\.username-overlay/,
    'Username overlay styles must remain scoped under #inert');
assert.match(styles, /#inert[\s\S]*\.leaderboard-panel/,
    'Leaderboard panel styles must remain scoped under #inert');
assert.doesNotMatch(uiSource, /No scores yet[\s\S]{0,180}return;/,
    'Empty leaderboard must not return before rendering the current-user footer');
assert.match(index, /id="control-layer"/, 'the page must expose a stable control-layer root');
assert.match(index, /class="control-card status-panel/, 'the page must expose the lower-left status region');
assert.match(index, /class="control-card chatbox-panel/, 'the page must expose the lower-right Chatbox region');
assert.match(index, /id="controls-collapse"/, 'the page must expose an accessible collapse control');
assert.match(index, /tabindex="0"/, 'the battlefield must be keyboard focusable');
assert.match(index, /id="towers-wrapper"/, 'the page must expose the human deployable tower mount');
assert.match(styles, /\.leaderboard-panel[\s\S]*position:\s*fixed[\s\S]*left:\s*0;/,
    'the leaderboard must stay pinned to the primary view\'s upper-left corner');
assert.match(styles, /#inert\.mode-human \.chatbox-panel/, 'the AI strategy panel must stay hidden in human mode');
assert.match(strategySource, /getControlLayer\(\)\.hide\(\)/,
    'valid strategy submission must hide the control layer after queueing');
assert.match(strategySource, /showHint\(\)/,
    'valid strategy submission must reveal the first-view gesture hint');

console.log('Validated leaderboard UI mount points and empty-state footer flow.');
