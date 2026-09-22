import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LeaderboardStore, RUN_TTL_MS } from '../src/store';

const T0 = 1_000_000;

function freshStore(): { store: LeaderboardStore; db: any } {
    const db = new DatabaseSync(':memory:');
    const store = new LeaderboardStore(db);
    store.migrate();
    return { store, db };
}

test('提示词迁移为旧 runs 表补列且重复迁移幂等并开启外键', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE runs (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_wave INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE wave_events (
            run_id TEXT NOT NULL REFERENCES runs(id),
            wave INTEGER NOT NULL,
            at_ms INTEGER NOT NULL,
            PRIMARY KEY (run_id, wave)
        );
    `);
    const store = new LeaderboardStore(db);
    store.migrate();
    store.migrate();

    const columns = db.prepare('PRAGMA table_info(runs)').all().map((row: any) => row.name);
    assert.ok(columns.includes('prompt_head_id'));
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'prompt_nodes'").get().name, 'prompt_nodes');
});

test('提示词节点按生效顺序连接且重试不重复追加', () => {
    const { store, db } = freshStore();
    store.createRun('r1', 'Alice', T0);

    assert.deepEqual(store.recordPrompt('r1', 'Alice', { version: 1, prompt: 'A', fromWave: 1 }, T0), {
        recorded: true,
        version: 1,
        fromWave: 1,
    });
    assert.deepEqual(store.recordWave('r1', 'Alice', 1, T0 + 1), { accepted: true, bestWave: 1 });
    assert.deepEqual(store.recordPrompt('r1', 'Alice', { version: 3, prompt: 'C', fromWave: 2 }, T0 + 2), {
        recorded: true,
        version: 3,
        fromWave: 2,
    });

    const rows = db.prepare('SELECT id, run_id, prev_id, version, prompt, from_wave FROM prompt_nodes ORDER BY version').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].prev_id, null);
    assert.equal(rows[1].prev_id, rows[0].id);
    assert.equal(db.prepare('SELECT prompt_head_id FROM runs WHERE id = ?').get('r1').prompt_head_id, rows[1].id);
    assert.deepEqual(store.bestRunPrompts('Alice').prompts.map(node => [node.version, node.prompt, node.fromWave]), [
        [1, 'A', 1],
        [3, 'C', 2],
    ]);

    assert.deepEqual(store.recordPrompt('r1', 'Alice', { version: 3, prompt: 'C', fromWave: 2 }, T0 + 3), {
        recorded: true,
        version: 3,
        fromWave: 2,
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM prompt_nodes').get().count, 2);
    assert.deepEqual(store.recordPrompt('r1', 'Alice', { version: 3, prompt: 'different', fromWave: 2 }, T0 + 4), {
        recorded: false,
        reason: 'PROMPT_VERSION_CONFLICT',
    });
});

test('提示词校验拒绝非法输入、过期对局和昵称冒用', () => {
    const { store } = freshStore();
    store.createRun('r1', 'Alice', T0);
    const invalid = [
        [{ version: 0, prompt: 'A', fromWave: 1 }, 'PROMPT_VERSION_INVALID'],
        [{ version: 1.5, prompt: 'A', fromWave: 1 }, 'PROMPT_VERSION_INVALID'],
        [{ version: 1, prompt: '', fromWave: 1 }, 'PROMPT_INVALID'],
        [{ version: 1, prompt: 'A'.repeat(5001), fromWave: 1 }, 'PROMPT_INVALID'],
        [{ version: 1, prompt: 'A', fromWave: 0 }, 'PROMPT_WAVE_INVALID'],
    ] as const;
    for (const [input, reason] of invalid) {
        assert.deepEqual(store.recordPrompt('r1', 'Alice', input, T0), { recorded: false, reason });
    }
    assert.deepEqual(store.recordPrompt('r1', 'Mallory', { version: 1, prompt: 'A', fromWave: 1 }, T0), {
        recorded: false,
        reason: 'USERNAME_MISMATCH',
    });
    assert.deepEqual(store.recordPrompt('missing', 'Alice', { version: 1, prompt: 'A', fromWave: 1 }, T0), {
        recorded: false,
        reason: 'RUN_NOT_FOUND',
    });
    assert.deepEqual(store.recordPrompt('r1', 'Alice', { version: 1, prompt: 'A', fromWave: 1 }, T0 + RUN_TTL_MS + 1), {
        recorded: false,
        reason: 'RUN_EXPIRED',
    });
});

test('新增提示词事务失败时回滚节点和链头', () => {
    const { store, db } = freshStore();
    store.createRun('r1', 'Alice', T0);
    db.exec(`CREATE TRIGGER fail_prompt_insert
        BEFORE INSERT ON prompt_nodes
        BEGIN SELECT RAISE(ABORT, 'forced prompt failure'); END;`);

    assert.throws(
        () => store.recordPrompt('r1', 'Alice', { version: 1, prompt: 'A', fromWave: 1 }, T0),
        /forced prompt failure/
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM prompt_nodes').get().count, 0);
    assert.equal(db.prepare('SELECT prompt_head_id FROM runs WHERE id = ?').get('r1').prompt_head_id, null);
});

test('最佳对局按波次、达成时间和 run id 稳定选择且只读取该局链', () => {
    const { store } = freshStore();
    store.createRun('older-high', 'Alice', T0);
    store.recordPrompt('older-high', 'Alice', { version: 1, prompt: 'best', fromWave: 1 }, T0);
    store.recordWave('older-high', 'Alice', 10, T0 + 100);

    store.createRun('newer-low', 'alice', T0 + 10);
    store.recordPrompt('newer-low', 'alice', { version: 1, prompt: 'wrong', fromWave: 1 }, T0 + 10);
    store.recordWave('newer-low', 'alice', 8, T0 + 20);

    const best = store.bestRunPrompts('ALICE');
    assert.equal(best.username, 'Alice');
    assert.equal(best.runId, 'older-high');
    assert.equal(best.wave, 10);
    assert.deepEqual(best.prompts.map(node => node.prompt), ['best']);

    store.createRun('tie-late', 'Alice', T0 + 30);
    store.recordWave('tie-late', 'Alice', 10, T0 + 200);
    assert.equal(store.bestRunPrompts('Alice').runId, 'older-high');

    store.createRun('no-history', 'Bob', T0 + 40);
    store.recordWave('no-history', 'Bob', 20, T0 + 300);
    assert.deepEqual(store.bestRunPrompts('Bob'), { username: 'Bob', runId: 'no-history', wave: 20, prompts: [] });
    assert.deepEqual(store.bestRunPrompts('Nobody'), { username: 'Nobody', runId: null, wave: null, prompts: [] });
});

test('损坏的提示词链不返回假完整结果', () => {
    const { store, db } = freshStore();
    store.createRun('r1', 'Alice', T0);
    store.createRun('r2', 'Bob', T0);
    store.recordWave('r1', 'Alice', 2, T0 + 1);
    store.recordPrompt('r1', 'Alice', { version: 1, prompt: 'A', fromWave: 2 }, T0 + 2);
    store.recordPrompt('r2', 'Bob', { version: 1, prompt: 'B', fromWave: 1 }, T0 + 3);
    const otherNode = db.prepare('SELECT id FROM prompt_nodes WHERE run_id = ?').get('r2').id;
    db.prepare('UPDATE prompt_nodes SET prev_id = ? WHERE run_id = ?').run(otherNode, 'r1');
    assert.throws(() => store.bestRunPrompts('Alice'), /PROMPT_CHAIN_/);
});
