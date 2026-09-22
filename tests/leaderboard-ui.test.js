const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(projectRoot, 'src', 'leaderboard', 'LeaderboardUI.ts'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'styles.less'), 'utf8');

assert.match(uiSource, /getElementById\('inert'\)!\.appendChild\(this\.overlay\)/,
    'Username overlay must be mounted under #inert so scoped Less styles apply');
assert.match(uiSource, /getElementById\('inert'\)!\.appendChild\(this\.root\)/,
    'Leaderboard panel must be mounted under #inert so scoped Less styles apply');
assert.match(styles, /#inert[\s\S]*\.username-overlay/,
    'Username overlay styles must remain scoped under #inert');
assert.match(styles, /#inert[\s\S]*\.leaderboard-panel/,
    'Leaderboard panel styles must remain scoped under #inert');
assert.doesNotMatch(uiSource, /No scores yet[\s\S]{0,180}return;/,
    'Empty leaderboard must not return before rendering the current-user footer');

console.log('Validated leaderboard UI mount points and empty-state footer flow.');
