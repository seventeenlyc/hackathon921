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
function openRun(deps: ApiDeps, username: string, mode?: string): { token: string; runId: string } {
    const session = handleApi(deps, request({ method: 'POST', pathname: '/api/session', body: { username, avatarId: 'aramaki' } }));
    assert.equal(session.status, 200);
    const token = session.body.token as string;

    const body = mode !== undefined ? { mode } : {};
    const run = handleApi(deps, request({ method: 'POST', pathname: '/api/runs', token, body }));
    assert.equal(run.status, 201);
    return { token, runId: run.body.runId as string };
}

function createRun(deps: ApiDeps, token: string, mode: string): string {
    const run = handleApi(deps, request({ method: 'POST', pathname: '/api/runs', token, body: { mode } }));
    assert.equal(run.status, 201);
    return run.body.runId as string;
}

test('GET /api/health 返回 ok，并报告 provider 是否已配置', () => {
    const res = handleApi(makeDeps(), request({ pathname: '/api/health' }));
    assert.equal(res.status, 200);
    // 未注入 agent 配置 => 未配置；这也是「后端照常可用、只有 decide 会 503」的探活依据。
    assert.deepEqual(res.body, { ok: true, providerConfigured: false });
});

test('GET /api/health 在配了 provider key 时 providerConfigured 为 true', () => {
    const deps: ApiDeps = { ...makeDeps(), agent: { apiKey: 'test-key' } };
    const res = handleApi(deps, request({ pathname: '/api/health' }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, providerConfigured: true });
});

test('POST /api/session 用合法昵称换取 token', () => {
    const res = handleApi(makeDeps(), request({ method: 'POST', pathname: '/api/session', body: { username: '  Alice ', avatarId: 'aramaki' } }));
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'Alice');
    assert.equal(typeof res.body.token, 'string');
    assert.ok(res.body.token.length > 0);
    assert.equal(res.body.uid, undefined, 'the internal UID is not shown on the profile response');
});

test('相同昵称和头像每次确认都会创建独立 UID，排行榜按 UID 分开', () => {
    const deps = makeDeps();
    const createProfile = () => handleApi(deps, request({
        method: 'POST', pathname: '/api/session',
        body: { username: 'Alice', avatarId: 'aramaki' },
    }));
    const first = createProfile();
    const second = createProfile();
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.notEqual(first.body.token, second.body.token, '同名同头像也必须拿到不同身份 token');

    const startRun = (token: string) => handleApi(deps, request({ method: 'POST', pathname: '/api/runs', token }));
    const firstRun = startRun(first.body.token);
    const secondRun = startRun(second.body.token);
    for (const [run, token, wave] of [[firstRun, first.body.token, 8], [secondRun, second.body.token, 6]] as const) {
        assert.equal(run.status, 201);
        handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${run.body.runId}/waves`, token, body: { wave } }));
    }
    const board = handleApi(deps, request({ pathname: '/api/leaderboard' }));
    assert.equal(board.body.entries.length, 2);
    assert.deepEqual(board.body.entries.map((entry: any) => [entry.username, entry.avatarId, entry.wave]), [
        ['Alice', 'aramaki', 8],
        ['Alice', 'aramaki', 6],
    ]);
    assert.notEqual(board.body.entries[0].uid, board.body.entries[1].uid);
});

test('POST /api/session 拒绝未知头像', () => {
    const res = handleApi(makeDeps(), request({
        method: 'POST', pathname: '/api/session', body: { username: 'Alice', avatarId: 'unknown' },
    }));
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'INVALID_AVATAR' });
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

test('POST /api/runs 与 GET /api/leaderboard 校验模式并拒绝非法值', () => {
    const deps = makeDeps();
    const session = handleApi(deps, request({ method: 'POST', pathname: '/api/session', body: { username: 'Alice', avatarId: 'aramaki' } }));
    const token = session.body.token as string;

    const badRun = handleApi(
        deps,
        request({ method: 'POST', pathname: '/api/runs', token, body: { mode: 'robot' } })
    );
    assert.equal(badRun.status, 400);
    assert.deepEqual(badRun.body, { error: 'INVALID_MODE' });

    const badBoard = handleApi(
        deps,
        request({ pathname: '/api/leaderboard', searchParams: { mode: 'robot' } })
    );
    assert.equal(badBoard.status, 400);
    assert.deepEqual(badBoard.body, { error: 'INVALID_MODE' });
});

test('排行榜按模式隔离查询，缺省为 AI，总榜合并且 me 选择更优记录', () => {
    const deps = makeDeps();
    const aliceAi = openRun(deps, 'Alice', 'ai');
    const aliceHuman = { token: aliceAi.token, runId: createRun(deps, aliceAi.token, 'human') };
    const bobAi = openRun(deps, 'Bob'); // 缺省 mode => ai

    handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${aliceAi.runId}/waves`, token: aliceAi.token, body: { wave: 10 } }));
    handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${aliceHuman.runId}/waves`, token: aliceHuman.token, body: { wave: 25 } }));
    handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${bobAi.runId}/waves`, token: bobAi.token, body: { wave: 15 } }));

    // 默认不传 mode => ai 榜
    const defaultBoard = handleApi(deps, request({ pathname: '/api/leaderboard', token: aliceAi.token }));
    assert.equal(defaultBoard.status, 200);
    assert.deepEqual(
        defaultBoard.body.entries.map((e: any) => [e.rank, e.username, e.wave, e.mode]),
        [
            [1, 'Bob', 15, 'ai'],
            [2, 'Alice', 10, 'ai'],
        ]
    );
    assert.deepEqual(defaultBoard.body.me, { uid: defaultBoard.body.me.uid, username: 'Alice', avatarId: 'aramaki', rank: 2, wave: 10, mode: 'ai' });
    assert.ok(Number.isSafeInteger(defaultBoard.body.me.uid));

    // human 榜：只有 Alice 的 human 成绩
    const humanBoard = handleApi(deps, request({ pathname: '/api/leaderboard', searchParams: { mode: 'human' }, token: aliceAi.token }));
    assert.equal(humanBoard.status, 200);
    assert.deepEqual(
        humanBoard.body.entries.map((e: any) => [e.rank, e.username, e.wave, e.mode]),
        [
            [1, 'Alice', 25, 'human'],
        ]
    );
    assert.deepEqual(humanBoard.body.me, { uid: defaultBoard.body.me.uid, username: 'Alice', avatarId: 'aramaki', rank: 1, wave: 25, mode: 'human' });

    // total 榜：包含两种模式记录，Alice 的总榜 me 选更优的 human/25
    const totalBoard = handleApi(deps, request({ pathname: '/api/leaderboard', searchParams: { mode: 'total' }, token: aliceAi.token }));
    assert.equal(totalBoard.status, 200);
    assert.deepEqual(
        totalBoard.body.entries.map((e: any) => [e.rank, e.username, e.wave, e.mode]),
        [
            [1, 'Alice', 25, 'human'],
            [2, 'Bob', 15, 'ai'],
            [3, 'Alice', 10, 'ai'],
        ]
    );
    assert.deepEqual(totalBoard.body.me, { uid: defaultBoard.body.me.uid, username: 'Alice', avatarId: 'aramaki', rank: 1, wave: 25, mode: 'human' });
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
