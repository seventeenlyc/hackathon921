// 端到端测试：起真实的 node:http 服务器（端口 0 = 随机空闲端口），用 fetch 走完整链路。
// 这覆盖路由层之外的部分：请求体解析、Bearer token 提取、状态码与响应头。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApiServer } from '../src/server';
import { LeaderboardStore } from '../src/store';

function startServer() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();
    const server = createApiServer({
        store,
        secret: 'integration-secret',
        now: () => Date.now(),
        newRunId: () => 'run-e2e',
    });
    return { server, store };
}

test('端到端：会话 → 开局 → 上报波次 → 共享排行榜可见', async () => {
    const { server } = startServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const sessionRes = await fetch(`${base}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'Alice', avatarId: 'aramaki' }),
        });
        assert.equal(sessionRes.status, 200);
        const session = await sessionRes.json();
        assert.equal(session.username, 'Alice');
        assert.equal(session.uid, undefined);

        const runRes = await fetch(`${base}/api/runs`, {
            method: 'POST',
            headers: { authorization: `Bearer ${session.token}` },
        });
        assert.equal(runRes.status, 201);
        const { runId } = await runRes.json();

        const waveRes = await fetch(`${base}/api/runs/${runId}/waves`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${session.token}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ wave: 7 }),
        });
        assert.equal(waveRes.status, 200);
        assert.deepEqual(await waveRes.json(), { accepted: true, bestWave: 7 });

        const boardRes = await fetch(`${base}/api/leaderboard?limit=5`, {
            headers: { authorization: `Bearer ${session.token}` },
        });
        assert.equal(boardRes.status, 200);
        // API 结果必须不可缓存，否则切换版本/新成绩会被中间层缓存住。
        assert.equal(boardRes.headers.get('cache-control'), 'no-store');

        const board = await boardRes.json();
        assert.equal(board.entries.length, 1);
        assert.deepEqual(
            [board.entries[0].rank, board.entries[0].username, board.entries[0].wave],
            [1, 'Alice', 7]
        );
        assert.equal(board.me.rank, 1);
        assert.equal(board.me.wave, 7);
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

test('端到端：超大请求体被当作坏请求拒绝，不会拖垮进程', async () => {
    const { server } = startServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const huge = 'x'.repeat(8192);
        const res = await fetch(`${base}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'Alice', avatarId: 'aramaki', padding: huge }),
        });
        // body 超限 → 解析为 null → 昵称缺失 → 400，而不是 500 或进程崩溃。
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, 'INVALID_USERNAME');

        // 服务器仍然健康。
        const health = await fetch(`${base}/api/health`);
        assert.equal(health.status, 200);
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

test('端到端：5000 个中文字符的 Prompt 可通过专用请求体上限，超限请求仍被拒绝', async () => {
    const { server } = startServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const sessionRes = await fetch(`${base}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: '玩家', avatarId: 'aramaki' }),
        });
        const session = await sessionRes.json();
        const runRes = await fetch(`${base}/api/runs`, {
            method: 'POST',
            headers: { authorization: `Bearer ${session.token}` },
        });
        const { runId } = await runRes.json();

        const promptRes = await fetch(`${base}/api/runs/${runId}/prompts`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${session.token}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ version: 1, prompt: '策'.repeat(5000), fromWave: 1 }),
        });
        assert.equal(promptRes.status, 200);

        const tooLargeRes = await fetch(`${base}/api/runs/${runId}/prompts`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${session.token}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ version: 2, prompt: 'B', fromWave: 1, padding: 'x'.repeat(70 * 1024) }),
        });
        assert.equal(tooLargeRes.status, 400);
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
