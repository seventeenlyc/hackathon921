const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// actions/upload-artifact rejects these characters even on Linux, where Vite
// can build and copy such filenames into dist without error.
const forbidden = /["<>:|*?\r\n]/;
const dist = path.resolve(__dirname, '../dist');

function invalidPaths(directory, relative = '') {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const name = path.posix.join(relative, entry.name);
    const invalid = forbidden.test(name) ? [name] : [];
    return entry.isDirectory()
      ? invalid.concat(invalidPaths(path.join(directory, entry.name), name))
      : invalid;
  });
}

assert.ok(forbidden.test('audio/Hi?.mp4'));
assert.ok(!forbidden.test('audio/Hi.mp4'));
assert.deepEqual(invalidPaths(dist), [], 'dist contains paths rejected by actions/upload-artifact');
console.log('Deploy artifact paths are upload-safe.');
