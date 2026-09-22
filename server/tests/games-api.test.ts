// 阶段 C 的托管对局 HTTP 接口：服务端持有真值，浏览器只发意图。
// 直接调用 handleApi（无端口、无网络）覆盖创建/开始/暂停/倍速/Prompt/路线/人类动作
// 与全部拒绝路径，并验证波次到达写入权威成绩。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ApiDeps, ApiRequest, handleApi } from '../src/http';
import { LeaderboardStore } from '../src/store';
import { GameHost } from '../src/game/host';

function makeDeps(): ApiDeps {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();

    let counter = 0;
    const games = new GameHost({
        newGameId: () => `game-${++counter}`,
        onCreated: game => store.createRun(game.id, game.username, 1000),
        // 波次真值来自引擎事件，不经过客户端上报。
        onWaveReached: (game, wave) => {
            store.recordWave(game.id, game.username, wave, 1000);
        },
    });

    return {
        store,
        secret: 'test-secret',
        now: () => 1000,
        // Real ids are 32-char hex; the anonymous subject is built from one, so the
        // test must use a realistic length or it would hide a too-long subject.
        newRunId: () => (++counter).toString(16).padStart(32, '0'),
        games,
    };
}

function request(over: Partial<ApiRequest>): ApiRequest {
    return { method: 'GET', pathname: '/', searchParams: {}, token: null, body: null, ...over };
}

function session(deps: ApiDeps, username: string): string {
    const res = handleApi(deps, request({ method: 'POST', pathname: '/api/session', body: { username } }));
    return res.body.token as string;
}

function createGame(deps: ApiDeps, token: string, mode = 'human', difficulty = 1) {
    return handleApi(deps, request({ method: 'POST', pathname: '/api/games', token, body: { mode, difficulty } }));
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('匿名会话可为人类模式开一局（昵称不作凭证）', () => {
    const deps = makeDeps();
    const anon = handleApi(deps, request({ method: 'POST', pathname: '/api/sessions/anonymous' }));
    assert.equal(anon.status, 200);
    assert.match(String(anon.body.username), /^anon-/);
    assert.ok(String(anon.body.username).length <= 16, 'the subject must satisfy the token validator');

    const created = handleApi(deps, request({
        method: 'POST',
        pathname: '/api/games',
        token: anon.body.token,
        body: { mode: 'human', difficulty: 1 },
    }));
    assert.equal(created.status, 201);
    assert.equal(created.body.mode, 'human');
});

test('POST /api/games 需要会话', () => {
    const res = handleApi(makeDeps(), request({ method: 'POST', pathname: '/api/games', body: { mode: 'human' } }));
    assert.equal(res.status, 401);
});

test('POST /api/games 创建对局并登记一条 run', () => {
    const deps = makeDeps();
    const token = session(deps, 'Alice');
    const res = createGame(deps, token, 'human', 2);

    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'game-1');
    assert.equal(res.body.mode, 'human');
    assert.equal(res.body.state, 'idle');

    // 该对局已在 store 里，可以直接写波次（旧客户端流程仍可用）。
    const wave = handleApi(deps, request({
        method: 'POST',
        pathname: '/api/runs/game-1/waves',
        token,
        body: { wave: 3 },
    }));
    assert.equal(wave.status, 200);
    assert.equal(wave.body.accepted, true);
});

test('POST /api/games 拒绝非法 mode 与 difficulty', () => {
    const deps = makeDeps();
    const token = session(deps, 'Alice');
    assert.equal(createGame(deps, token, 'robot').status, 400);
    assert.equal(
        handleApi(deps, request({ method: 'POST', pathname: '/api/games', token, body: { mode: 'human', difficulty: 9 } })).status,
        400,
    );
});

test('GET /api/games/:id 返回摘要与快照，并做归属校验', () => {
    const deps = makeDeps();
    const alice = session(deps, 'Alice');
    const bob = session(deps, 'Bob');
    const id = createGame(deps, alice).body.id;

    const mine = handleApi(deps, request({ pathname: `/api/games/${id}`, token: alice }));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.grid, undefined);
    assert.equal(mine.body.snapshot.grid.width, 61);
    assert.ok(Array.isArray(mine.body.snapshot.lanes));

    assert.equal(handleApi(deps, request({ pathname: `/api/games/${id}`, token: bob })).status, 403);
    assert.equal(handleApi(deps, request({ pathname: `/api/games/${id}` })).status, 401);
    assert.equal(handleApi(deps, request({ pathname: '/api/games/nope', token: alice })).status, 404);
});

test('开始/暂停/恢复/倍速', () => {
    const deps = makeDeps();
    const token = session(deps, 'Alice');
    const id = createGame(deps, token).body.id;

    const started = handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/start`, token }));
    assert.equal(started.status, 200);
    assert.ok(['planning', 'running'].includes(started.body.state));

    assert.equal(handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/speed`, token, body: { speed: 3 } })).status, 400);
    const speed = handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/speed`, token, body: { speed: 8 } }));
    assert.equal(speed.status, 200);
    assert.equal(speed.body.speed, 8);

    assert.equal(handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/pause`, token })).status, 200);
    assert.equal(handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/resume`, token })).status, 200);

    (deps.games as GameHost).stopAllDrivers();
});

test('Prompt 与路线变更返回生效波次', () => {
    const deps = makeDeps();
    const token = session(deps, 'Alice');
    const id = createGame(deps, token).body.id;

    assert.equal(handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/strategy`, token, body: { text: '   ' } })).status, 400);
    const strategy = handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/strategy`, token, body: { text: 'build canons' } }));
    assert.equal(strategy.status, 200);
    assert.equal(strategy.body.accepted, true);
    assert.equal(strategy.body.effectiveWave, 1);

    const lanes = handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/lanes`, token, body: { count: 3 } }));
    assert.equal(lanes.status, 200);
    assert.equal(lanes.body.requested, 3);
    assert.equal(lanes.body.appliedLanes, 1, 'lane change must wait for the boundary');

    assert.equal(handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/lanes`, token, body: { count: 'x' } })).status, 400);
});

test('人类模式可远程建塔，AI 模式拒绝', () => {
    const deps = makeDeps();
    const token = session(deps, 'Alice');
    const id = createGame(deps, token, 'human').body.id;

    const state = handleApi(deps, request({ pathname: `/api/games/${id}`, token }));
    const candidate = state.body.snapshot.buildCandidates[0];
    assert.ok(candidate, 'the engine must offer a legal build cell while idle');

    const build = handleApi(deps, request({
        method: 'POST',
        pathname: `/api/games/${id}/actions`,
        token,
        body: { action: 'build_tower', type: 'canon', i: candidate.i, j: candidate.j },
    }));
    assert.equal(build.status, 200);
    assert.equal(build.body.ok, true);

    const again = handleApi(deps, request({
        method: 'POST',
        pathname: `/api/games/${id}/actions`,
        token,
        body: { action: 'build_tower', type: 'canon', i: candidate.i, j: candidate.j },
    }));
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'CELL_OCCUPIED');

    const aiId = createGame(deps, token, 'ai').body.id;
    const forbidden = handleApi(deps, request({
        method: 'POST',
        pathname: `/api/games/${aiId}/actions`,
        token,
        body: { action: 'build_tower', type: 'canon', i: 0, j: 0 },
    }));
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error, 'AI_MODE_ACTIONS_FORBIDDEN');
});

test('波次到达写入权威成绩（无客户端上报）', async () => {
    const deps = makeDeps();
    const token = session(deps, 'Zoe');
    const id = createGame(deps, token, 'human', 1).body.id;

    handleApi(deps, request({ method: 'POST', pathname: `/api/games/${id}/start`, token }));
    const games = deps.games as GameHost;
    // Drive the engine manually instead of waiting on the real-time driver, so the
    // assertion is about the wave event, not about wall-clock timing.
    games.stopDriver(id);
    const game = games.get(id);
    assert.ok(game);

    let guard = 0;
    while ((deps.store.bestWaveOf('Zoe') ?? 0) < 1 && guard < 500) {
        game!.tick();
        await flush();
        guard += 1;
    }

    assert.ok((deps.store.bestWaveOf('Zoe') ?? 0) >= 1, 'the engine event must have scored the run');
});
