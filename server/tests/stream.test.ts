// SSE 状态流：真实 node:http 服务 + fetch 读流，覆盖首发快照帧与全部拒绝路径。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApiServer } from '../src/server';
import { LeaderboardStore } from '../src/store';
import { GameHost } from '../src/game/host';

function startServer() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();

    let counter = 0;
    const games = new GameHost({
        newGameId: () => `game-${++counter}`,
        onCreated: game => store.createRun(game.id, game.username, 1000),
        onWaveReached: (game, wave) => {
            store.recordWave(game.id, game.username, wave, 1000);
        },
    });

    const server = createApiServer({
        store,
        secret: 'stream-secret',
        now: () => Date.now(),
        newRunId: () => `run-${++counter}`,
        games,
    });

    return { server, games };
}

async function openSession(base: string, username: string): Promise<string> {
    const res = await fetch(`${base}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username }),
    });
    return (await res.json()).token as string;
}

test('GET /api/games/:id/stream 推送快照帧并校验会话与归属', async () => {
    const { server, games } = startServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const alice = await openSession(base, 'Alice');
        const bob = await openSession(base, 'Bob');

        const created = await fetch(`${base}/api/games`, {
            method: 'POST',
            headers: { authorization: `Bearer ${alice}`, 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'human', difficulty: 1 }),
        });
        assert.equal(created.status, 201);
        const { id } = await created.json();

        assert.equal((await fetch(`${base}/api/games/${id}/stream`)).status, 401);
        assert.equal((await fetch(`${base}/api/games/${id}/stream?token=${bob}`)).status, 403);

        // The only stream we open is the one we abort, so the server can close.
        const controller = new AbortController();
        const stream = await fetch(`${base}/api/games/${id}/stream?token=${alice}`, { signal: controller.signal });
        assert.equal(stream.status, 200);
        assert.match(String(stream.headers.get('content-type')), /text\/event-stream/);

        const reader = stream.body.getReader();
        let text = '';
        for (let attempt = 0; attempt < 10 && text.indexOf('\n\n') === -1; attempt += 1) {
            const { value, done } = await reader.read();
            if (done) break;
            text += new TextDecoder().decode(value);
        }

        assert.match(text, /event: snapshot/, 'the first frame must be a snapshot');
        const dataLine = text.split('\n').find(line => line.startsWith('data: ')) as string;
        assert.ok(dataLine, 'the frame must carry a data line');
        const frame = JSON.parse(dataLine.slice('data: '.length));
        assert.equal(frame.grid.width, 61);
        assert.equal(frame.state, 'idle');
        assert.equal(frame.cash, 200);

        controller.abort();
        games.stopAllDrivers();
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
