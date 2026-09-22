// 排行榜存储与业务规则测试：正向路径、每一条失败路径、排序与平局规则。
// 用内存 SQLite（:memory:），不需要任何外部服务。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LeaderboardStore, RUN_TTL_MS } from '../src/store';

const T0 = 1_000_000;

function freshStore(): LeaderboardStore {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();
    return store;
}

test('记录波次：首次上报即被接受，最佳波次随之更新', () => {
    const store = freshStore();
    store.createRun('r1', 'Alice', T0);

    assert.deepEqual(store.recordWave('r1', 'Alice', 1, T0), { accepted: true, bestWave: 1 });
    assert.deepEqual(store.recordWave('r1', 'Alice', 2, T0 + 10), { accepted: true, bestWave: 2 });
    assert.equal(store.bestWaveOf('Alice'), 2);
});

test('波次必须单调递增：重复与倒退都被拒绝', () => {
    const store = freshStore();
    store.createRun('r1', 'Alice', T0);
    store.recordWave('r1', 'Alice', 5, T0);

    assert.deepEqual(store.recordWave('r1', 'Alice', 5, T0 + 1), {
        accepted: false,
        reason: 'WAVE_NOT_INCREASING',
    });
    assert.deepEqual(store.recordWave('r1', 'Alice', 3, T0 + 2), {
        accepted: false,
        reason: 'WAVE_NOT_INCREASING',
    });
    // 被拒绝的上报不得改变已有成绩。
    assert.equal(store.bestWaveOf('Alice'), 5);
});

test('未知对局返回 RUN_NOT_FOUND', () => {
    const store = freshStore();
    assert.deepEqual(store.recordWave('nope', 'Alice', 1, T0), {
        accepted: false,
        reason: 'RUN_NOT_FOUND',
    });
});

test('别人不能往你的对局里写成绩（USERNAME_MISMATCH）', () => {
    const store = freshStore();
    store.createRun('r1', 'Alice', T0);
    assert.deepEqual(store.recordWave('r1', 'Bob', 9, T0), {
        accepted: false,
        reason: 'USERNAME_MISMATCH',
    });
    assert.equal(store.bestWaveOf('Bob'), null);
});

test('超过有效期的对局拒绝新波次（RUN_EXPIRED）', () => {
    const store = freshStore();
    store.createRun('r1', 'Alice', T0);
    assert.deepEqual(store.recordWave('r1', 'Alice', 1, T0 + RUN_TTL_MS + 1), {
        accepted: false,
        reason: 'RUN_EXPIRED',
    });
});

test('越界波次被拒绝（WAVE_OUT_OF_RANGE）', () => {
    const store = freshStore();
    store.createRun('r1', 'Alice', T0);
    for (const bad of [0, -1, 2.5, Number.MAX_SAFE_INTEGER]) {
        assert.deepEqual(store.recordWave('r1', 'Alice', bad, T0), {
            accepted: false,
            reason: 'WAVE_OUT_OF_RANGE',
        });
    }
});

test('排行榜：波次降序，平局时更早达成者靠前', () => {
    const store = freshStore();
    store.createRun('ra', 'Alice', T0);
    store.createRun('rb', 'Bob', T0);
    store.createRun('rc', 'Carol', T0);

    store.recordWave('rb', 'Bob', 5, T0 + 200);
    store.recordWave('ra', 'Alice', 5, T0 + 100);
    store.recordWave('rc', 'Carol', 9, T0 + 300);

    const top = store.top(10);
    assert.deepEqual(
        top.map(e => [e.username, e.wave]),
        [
            ['Carol', 9],
            ['Alice', 5],
            ['Bob', 5],
        ]
    );
    assert.ok(top[1].achievedAt < top[2].achievedAt, '平局时先达成者 achievedAt 更小');
});

test('排行榜：同一昵称只出现一次，取最佳波次（大小写不敏感）', () => {
    const store = freshStore();
    store.createRun('r1', 'Alice', T0);
    store.createRun('r2', 'alice', T0);

    store.recordWave('r1', 'Alice', 4, T0 + 10);
    store.recordWave('r2', 'alice', 8, T0 + 20);

    const top = store.top(10);
    assert.equal(top.length, 1, '大小写不同视为同一个人');
    assert.equal(top[0].wave, 8);
});

test('排行榜 limit 生效', () => {
    const store = freshStore();
    for (let i = 0; i < 5; i++) {
        const name = `user${i}`;
        store.createRun(`r${i}`, name, T0);
        store.recordWave(`r${i}`, name, i + 1, T0 + i);
    }
    assert.equal(store.top(2).length, 2);
    assert.equal(store.top(2)[0].wave, 5);
});

test('rankOf 给出 1-based 名次，无记录返回 null', () => {
    const store = freshStore();
    store.createRun('ra', 'Alice', T0);
    store.createRun('rb', 'Bob', T0);
    store.recordWave('ra', 'Alice', 10, T0);
    store.recordWave('rb', 'Bob', 3, T0 + 1);

    assert.equal(store.rankOf('Alice'), 1);
    assert.equal(store.rankOf('bob'), 2, '大小写不敏感');
    assert.equal(store.rankOf('Nobody'), null);
});

test('migrate 幂等：重复调用不报错', () => {
    const store = freshStore();
    assert.doesNotThrow(() => store.migrate());
    assert.doesNotThrow(() => store.migrate());
});
