// 排行榜存储与业务规则测试：正向路径、每一条失败路径、排序与平局规则。
// 用内存 SQLite（:memory:），不需要任何外部服务。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LeaderboardStore, RUN_TTL_MS } from '../src/store';

const T0 = 1_000_000;

function freshStore(): any {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();
    // Keep these business-rule tests concise: each lower-case name represents
    // one stable UID. API tests cover repeated profiles creating distinct UIDs.
    const ids = new Map<string, number>();
    const uid = (name: string) => {
        const key = name.toLowerCase();
        let id = ids.get(key);
        if (!id) {
            id = store.createUser(name, 'aramaki', T0);
            ids.set(key, id);
        }
        return id;
    };
    const view: any = Object.create(store);
    view.createRun = (id: string, name: string, now: number, mode?: 'ai' | 'human') => store.createRun(id, uid(name), now, mode);
    view.recordWave = (id: string, name: string, wave: number, now: number) => store.recordWave(id, uid(name), wave, now);
    view.bestWaveOf = (name: string, mode?: 'ai' | 'human') => store.bestWaveOf(uid(name), mode);
    view.bestRecordOf = (name: string) => store.bestRecordOf(uid(name));
    view.rankOf = (name: string, mode?: 'ai' | 'human' | 'total') => store.rankOf(uid(name), mode);
    return view;
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

test('不同 UID 不能往对方的对局里写成绩（UID_MISMATCH）', () => {
    const store = freshStore();
    store.createRun('r1', 'Alice', T0);
    assert.deepEqual(store.recordWave('r1', 'Bob', 9, T0), {
        accepted: false,
        reason: 'UID_MISMATCH',
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
        top.map((e: any) => [e.username, e.wave]),
        [
            ['Carol', 9],
            ['Alice', 5],
            ['Bob', 5],
        ]
    );
    assert.ok(top[1].achievedAt < top[2].achievedAt, '平局时先达成者 achievedAt 更小');
});

test('排行榜：同一 UID 只出现一次，取最佳波次', () => {
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

test('旧表迁移补齐 mode 列且旧数据默认为 ai 模式', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE runs (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_wave INTEGER NOT NULL DEFAULT 0,
            prompt_head_id TEXT
        );
        CREATE TABLE wave_events (
            run_id TEXT NOT NULL REFERENCES runs(id),
            wave INTEGER NOT NULL,
            at_ms INTEGER NOT NULL,
            PRIMARY KEY (run_id, wave)
        );
        INSERT INTO runs (id, username, created_at, last_wave) VALUES ('legacy-1', 'OldPlayer', 1000, 5);
        INSERT INTO wave_events (run_id, wave, at_ms) VALUES ('legacy-1', 5, 1050);
    `);
    const store = new LeaderboardStore(db);
    store.migrate();

    const run = store.getRun('legacy-1');
    assert.ok(run);
    assert.equal(run?.mode, 'ai');

    const topAi = store.top(10, 'ai');
    assert.equal(topAi.length, 1);
    assert.equal(topAi[0].username, 'OldPlayer');
    assert.equal(topAi[0].mode, 'ai');

    const topHuman = store.top(10, 'human');
    assert.equal(topHuman.length, 0);
});

test('AI 与人类模式隔离，总榜合并同昵称不同模式成绩', () => {
    const store = freshStore();
    store.createRun('r-ai', 'Alice', T0, 'ai');
    store.recordWave('r-ai', 'Alice', 12, T0 + 100);

    store.createRun('r-human', 'Alice', T0, 'human');
    store.recordWave('r-human', 'Alice', 16, T0 + 200);

    const aiTop = store.top(10, 'ai');
    assert.equal(aiTop.length, 1);
    assert.deepEqual([aiTop[0].username, aiTop[0].wave, aiTop[0].mode], ['Alice', 12, 'ai']);
    assert.equal(store.rankOf('Alice', 'ai'), 1);
    assert.equal(store.bestWaveOf('Alice', 'ai'), 12);

    const humanTop = store.top(10, 'human');
    assert.equal(humanTop.length, 1);
    assert.deepEqual([humanTop[0].username, humanTop[0].wave, humanTop[0].mode], ['Alice', 16, 'human']);
    assert.equal(store.rankOf('Alice', 'human'), 1);
    assert.equal(store.bestWaveOf('Alice', 'human'), 16);

    const totalTop = store.top(10, 'total');
    assert.equal(totalTop.length, 2);
    assert.deepEqual(
        totalTop.map((e: any) => [e.username, e.wave, e.mode]),
        [
            ['Alice', 16, 'human'],
            ['Alice', 12, 'ai'],
        ]
    );
    assert.equal(store.rankOf('Alice', 'total'), 1);
});

test('平局时按达成时间升序，总榜最多返回 limit 条记录', () => {
    const store = freshStore();
    store.createRun('r1', 'Alice', T0, 'ai');
    store.recordWave('r1', 'Alice', 20, T0 + 200);

    store.createRun('r2', 'Bob', T0, 'ai');
    store.recordWave('r2', 'Bob', 20, T0 + 100);

    const top = store.top(10, 'ai');
    assert.equal(top[0].username, 'Bob', '更早达成者排在前面');
    assert.equal(top[1].username, 'Alice');

    // 制造 12 条不同模式/用户的记录，测试 limit 10
    for (let i = 0; i < 6; i++) {
        const u = `User${i}`;
        store.createRun(`ai-${i}`, u, T0, 'ai');
        store.recordWave(`ai-${i}`, u, 10 + i, T0 + i * 10);
        store.createRun(`hu-${i}`, u, T0, 'human');
        store.recordWave(`hu-${i}`, u, 10 + i, T0 + i * 10);
    }
    const total10 = store.top(10, 'total');
    assert.equal(total10.length, 10);
});

