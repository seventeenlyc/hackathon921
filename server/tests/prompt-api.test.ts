import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ApiDeps, ApiRequest, handleApi } from '../src/http';
import { LeaderboardStore } from '../src/store';
import { signToken, verifyToken } from '../src/token';

const T0 = 1_000_000;

function makeDeps(nowValue = T0): ApiDeps {
    const db = new DatabaseSync(':memory:');
    const store = new LeaderboardStore(db);
    store.migrate();
    let counter = 0;
    return {
        store,
        secret: 'test-secret',
        now: () => nowValue,
        newRunId: () => `run-${++counter}`,
    };
}

function request(over: Partial<ApiRequest>): ApiRequest {
    return { method: 'GET', pathname: '/', searchParams: {}, token: null, body: null, ...over };
}

function openRun(deps: ApiDeps, username: string): { token: string; runId: string } {
    const session = handleApi(deps, request({ method: 'POST', pathname: '/api/session', body: { username, avatarId: 'aramaki' } }));
    assert.equal(session.status, 200);
    const token = session.body.token as string;
    const run = handleApi(deps, request({ method: 'POST', pathname: '/api/runs', token }));
    assert.equal(run.status, 201);
    return { token, runId: run.body.runId as string };
}

function createRun(deps: ApiDeps, token: string): string {
    const run = handleApi(deps, request({ method: 'POST', pathname: '/api/runs', token }));
    assert.equal(run.status, 201);
    return run.body.runId as string;
}

test('POST prompts records a prompt and GET returns the best run chain without a token', () => {
    const deps = makeDeps();
    const { token, runId } = openRun(deps, '玩家');
    const write = handleApi(deps, request({
        method: 'POST',
        pathname: `/api/runs/${runId}/prompts`,
        token,
        body: { version: 1, prompt: '先观察再建塔', fromWave: 1 },
    }));
    assert.equal(write.status, 200);
    assert.deepEqual(write.body, { recorded: true, version: 1, fromWave: 1 });
    handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${runId}/waves`, token, body: { wave: 3 } }));

    const read = handleApi(deps, request({
        method: 'GET',
        pathname: `/api/leaderboard/${verifyToken(deps.secret, token, deps.now())}/prompts`,
    }));
    assert.equal(read.status, 200);
    assert.equal(read.body.username, '玩家');
    assert.equal(read.body.runId, runId);
    assert.equal(read.body.wave, 3);
    assert.deepEqual(read.body.prompts.map((node: any) => [node.version, node.prompt, node.fromWave]), [[1, '先观察再建塔', 1]]);
    assert.equal(JSON.stringify(read.body).includes(token), false);
});

test('每局从空链记录 Prompt，低分局保留但不替换纪录链，破纪录后完整更新', () => {
    const deps = makeDeps();
    const { token, runId: firstRun } = openRun(deps, 'Alice');
    const recordPrompt = (runId: string, version: number, prompt: string) => handleApi(deps, request({
        method: 'POST', pathname: `/api/runs/${runId}/prompts`, token,
        body: { version, prompt, fromWave: version },
    }));
    const recordWave = (runId: string, wave: number) => handleApi(deps, request({
        method: 'POST', pathname: `/api/runs/${runId}/waves`, token, body: { wave },
    }));
    recordPrompt(firstRun, 1, 'first opening');
    recordWave(firstRun, 5);

    const nextRun = createRun(deps, token);
    assert.equal(recordPrompt(nextRun, 1, 'second opening').status, 200);
    assert.equal(recordPrompt(nextRun, 2, 'second revision').status, 200);
    recordWave(nextRun, 3);

    const boardBeforeRecord = handleApi(deps, request({ pathname: '/api/leaderboard' }));
    const uid = boardBeforeRecord.body.entries[0].uid;
    const getHistory = () => handleApi(deps, request({ pathname: `/api/leaderboard/${uid}/prompts` }));
    const beforeRecord = getHistory();
    assert.equal(beforeRecord.body.runId, firstRun, '低分局不能替换当前最佳链');
    assert.deepEqual(beforeRecord.body.prompts.map((node: any) => node.prompt), ['first opening']);

    recordWave(nextRun, 6);
    const afterRecord = getHistory();
    assert.equal(afterRecord.body.runId, nextRun);
    assert.deepEqual(afterRecord.body.prompts.map((node: any) => [node.version, node.prompt, node.prevId]), [
        [1, 'second opening', null],
        [2, 'second revision', afterRecord.body.prompts[0].id],
    ]);
});

test('prompt write maps authentication, ownership, validation, conflict and expiry failures', () => {
    const deps = makeDeps();
    const alice = openRun(deps, 'Alice');
    const bob = openRun(deps, 'Bob');
    const path = `/api/runs/${alice.runId}/prompts`;

    assert.equal(handleApi(deps, request({ method: 'POST', pathname: path, body: { version: 1, prompt: 'A', fromWave: 1 } })).status, 401);
    assert.equal(handleApi(deps, request({ method: 'POST', pathname: path, token: bob.token, body: { version: 1, prompt: 'A', fromWave: 1 } })).status, 403);
    assert.equal(handleApi(deps, request({ method: 'POST', pathname: '/api/runs/missing/prompts', token: alice.token, body: { version: 1, prompt: 'A', fromWave: 1 } })).status, 404);

    for (const body of [
        { version: 0, prompt: 'A', fromWave: 1 },
        { version: 1, prompt: '', fromWave: 1 },
        { version: 1, prompt: 'A', fromWave: 0 },
        { version: 1, prompt: 'A'.repeat(5001), fromWave: 1 },
    ]) {
        const invalid = handleApi(deps, request({ method: 'POST', pathname: path, token: alice.token, body }));
        assert.equal(invalid.status, 400);
    }

    assert.equal(handleApi(deps, request({ method: 'POST', pathname: path, token: alice.token, body: { version: 1, prompt: 'A', fromWave: 1 } })).status, 200);
    assert.equal(handleApi(deps, request({ method: 'POST', pathname: path, token: alice.token, body: { version: 1, prompt: 'B', fromWave: 1 } })).status, 409);

    const expiredDeps = makeDeps(T0 + 6 * 60 * 60 * 1000 + 1);
    const expired = openRun({ ...expiredDeps, now: () => T0 } as ApiDeps, 'Alice');
    const expiredWrite = handleApi(expiredDeps, request({ method: 'POST', pathname: `/api/runs/${expired.runId}/prompts`, token: expired.token, body: { version: 1, prompt: 'A', fromWave: 1 } }));
    assert.equal(expiredWrite.status, 404);
});

test('public prompt history returns an empty result for users without a score and rejects bad path encoding', () => {
    const deps = makeDeps();
    const session = handleApi(deps, request({ method: 'POST', pathname: '/api/session', body: { username: 'Nobody', avatarId: 'aramaki' } }));
    const uid = verifyToken(deps.secret, session.body.token, deps.now());
    const empty = handleApi(deps, request({ pathname: `/api/leaderboard/${uid}/prompts` }));
    assert.deepEqual(empty, { status: 200, body: { uid, username: 'Nobody', runId: null, wave: null, prompts: [] } });
    assert.equal(handleApi(deps, request({ pathname: '/api/leaderboard/999/prompts' })).status, 404);
    assert.equal(handleApi(deps, request({ pathname: '/api/leaderboard/0/prompts' })).status, 400);
    const malformed = handleApi(deps, request({ pathname: '/api/leaderboard/%E0%A4%A/prompts' }));
    assert.equal(malformed.status, 404);
});

test('a prompt POST accepts 5000 Chinese characters after validation', () => {
    const deps = makeDeps();
    const { token, runId } = openRun(deps, 'Alice');
    const prompt = '策'.repeat(5000);
    const result = handleApi(deps, request({ method: 'POST', pathname: `/api/runs/${runId}/prompts`, token, body: { version: 1, prompt, fromWave: 1 } }));
    assert.equal(result.status, 200);
});
