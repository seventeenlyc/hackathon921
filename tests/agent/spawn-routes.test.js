const assert = require('assert');
const {spawnCountForWave, allSpawnPointsReachable, canPlaceTowerAt} = require('../../.test-build/agent/SpawnRoutes.js');

for (const [wave, count] of [[1, 1], [50, 1], [51, 2], [100, 2], [101, 3], [150, 3], [151, 4], [999, 4]]) {
    assert.strictEqual(spawnCountForWave(wave), count, `wave ${wave}`);
}
assert.throws(() => spawnCountForWave(0), RangeError);
assert.throws(() => spawnCountForWave(1.5), RangeError);
const points = [{i: 4, j: 26}, {i: 56, j: 4}, {i: 56, j: 26}, {i: 4, j: 4}];
const checked = [];
assert.strictEqual(allSpawnPointsReachable(points, (i, j) => { checked.push([i, j]); return true; }), true);
assert.deepStrictEqual(checked, points.map(({i, j}) => [i, j]));
assert.strictEqual(allSpawnPointsReachable(points, (i, j) => !(i === 56 && j === 26)), false);
assert.strictEqual(canPlaceTowerAt(4, 26, points), false);
assert.strictEqual(canPlaceTowerAt(20, 12, points), true);
