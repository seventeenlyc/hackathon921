// 路由层测试：直接调用 handleApi，覆盖每个端点与拒绝路径（无端口、无网络）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ApiDeps, ApiRequest, handleApi } from '../src/http';
import { LeaderboardStore } from '../src/store';

const T0 = 1_000_000;

function makeDeps(): ApiDeps {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();
    let counter = 0;
    return {
        store,
        secret: 'test-secret',
        now: () => T0,
        newRunId: () => `run-${++counter}`,
    };
}

function request(over: Partial<ApiRequest>): ApiRequest {
    return { method: 'GET', pathname: '/', searchParams: {}, token: null, body: null, ...over };
}

/** 走一遍 session → runs，返回可用于后续请求的 token 与 runId。 */
function openRun(deps: ApiDeps, username: string): { token: string; runId: string } {
    const session = handleApi(deps, request({ method: 'POST', pathname: '/api/session', body: { username } }));
    assert.equal(session.status, 200);
    const token = session.body.token as string;

    const run = handleApi(deps, request({ method: 'POST', pathname: '/api/runs', token }));
    assert.equal(run.status, 201);
    return { token, runId: run.body.runId as string };
}

test('GET /api/health 返回 ok', () => {
    const res = handleApi(makeDeps(), request({ pathname: '/api/health' }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
});

test('POST /api/session 用合法昵称换取 token', () => {
    const res = handleApi(makeDeps(), request({ method: 'POST', pathname: '/api/session', body: { username: '  Alice ' } }));
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'Alice');
    assert.equal(typeof res.body.token, 'string');
    assert.ok(res.body.token.length > 0);
});

test('POST /api/session 拒绝非法昵称', () => {
    for (const username of ['', '   ', 'a'.repeat(17), 'abc/def', '<script>x</script>', 42, null]) {
        const res = handleApi(makeDeps(), request({ method: 'POST', pathname: '/api/session', body: { username } }));
        assert.equal(res.status, 400, `应拒绝 ${JSON.stringify(username)}`);
        assert.equal(res.body.error, 'INVALID_USERNAME');
    }
});

test('POST /api/runs 需要有效会话', () => {
    const deps = makeDeps();
    assert.equal(handleApi(deps, request({ method: 'POST', pathname: '/api/runs' })).status, 401);
    assert.equal(
        handleApi(deps, request({ method: 'POST', pathname: '/api/runs', token: 'forged.token' })).status,
        401
    );
});

test('波次上报：正向路径返回 accepted 与最佳波次', () => {
    const deps = makeDeps();
    const { token, runId } = openRun(deps, 'Alice');

    const res = handleApi(
        deps,
        request({ method: 'POST', pathname: `/api/runs/${runId}/waves`, token, body: { wave: 7 } })
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { accepted: true, bestWave: 7 });
});

test('波次上报：没有会话直接拒绝', () => {
    const deps = makeDeps();
    const { runId } = openRun(deps, 'Alice');
    const res = handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${runId}/waves`, body: { wave: 3 } }));
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'INVALID_SESSION');
});

test('波次上报：非法波次是 400', () => {
    const deps = makeDeps();
    const { token, runId } = openRun(deps, 'Alice');
    for (const wave of [0, -1, 1.5, '9', null, Number.MAX_SAFE_INTEGER]) {
        const res = handleApi(
            deps,
            request({ method: 'POST', pathname: `/api/runs/${runId}/waves`, token, body: { wave } })
        );
        assert.equal(res.status, 400, `wave=${JSON.stringify(wave)} 应为 400`);
        assert.equal(res.body.reason, 'WAVE_OUT_OF_RANGE');
    }
});

test('波次上报：未知对局是 404，重复波次是 409', () => {
    const deps = makeDeps();
    const { token, runId } = openRun(deps, 'Alice');

    const missing = handleApi(
        deps,
        request({ method: 'POST', pathname: '/api/runs/does-not-exist/waves', token, body: { wave: 2 } })
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.body.reason, 'RUN_NOT_FOUND');

    handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${runId}/waves`, token, body: { wave: 4 } }));
    const repeat = handleApi(
        deps,
        request({ method: 'POST', pathname: `/api/runs/${runId}/waves`, token, body: { wave: 4 } })
    );
    assert.equal(repeat.status, 409);
    assert.equal(repeat.body.reason, 'WAVE_NOT_INCREASING');
});

test('GET /api/leaderboard 返回排名条目；带会话时附带本人名次', () => {
    const deps = makeDeps();
    const alice = openRun(deps, 'Alice');
    const bob = openRun(deps, 'Bob');

    handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${alice.runId}/waves`, token: alice.token, body: { wave: 12 } }));
    handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${bob.runId}/waves`, token: bob.token, body: { wave: 4 } }));

    const anonymous = handleApi(deps, request({ pathname: '/api/leaderboard' }));
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.body.me, null);
    assert.deepEqual(
        anonymous.body.entries.map((e: any) => [e.rank, e.username, e.wave]),
        [
            [1, 'Alice', 12],
            [2, 'Bob', 4],
        ]
    );

    const asBob = handleApi(deps, request({ pathname: '/api/leaderboard', token: bob.token }));
    assert.equal(asBob.body.me.username, 'Bob');
    assert.equal(asBob.body.me.rank, 2);
    assert.equal(asBob.body.me.wave, 4);
});

test('GET /api/leaderboard 的 limit 参数生效且被夹取', () => {
    const deps = makeDeps();
    for (let i = 0; i < 3; i++) {
        const run = openRun(deps, `p${i}`);
        handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${run.runId}/waves`, token: run.token, body: { wave: i + 1 } }));
    }
    const limited = handleApi(deps, request({ pathname: '/api/leaderboard', searchParams: { limit: '2' } }));
    assert.equal(limited.body.entries.length, 2);
    assert.equal(limited.body.entries[0].wave, 3);
});

test('未知路径返回 404', () => {
    const res = handleApi(makeDeps(), request({ pathname: '/api/unknown' }));
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'NOT_FOUND');
});
