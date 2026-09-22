// 阶段 D：托管对局的生命周期——断线宽限/暂停、重连、回收、指令幂等、维护退出。
// 时间与定时器均注入，测试不依赖真实时间。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { GameHost } from '../src/game/host';
import { LeaderboardStore } from '../src/store';
import { ApiDeps, ApiRequest, handleApi } from '../src/http';

interface FakeTimer {
    id: number;
    fn: () => void;
    ms: number;
}

function makeHost(overrides: { graceMs?: number; reclaimMs?: number } = {}) {
    const state = { now: 1000, seq: 0, tasks: new Map<number, FakeTimer>() };
    let counter = 0;

    const host = new GameHost({
        newGameId: () => 'g' + (++counter),
        now: () => state.now,
        graceMs: overrides.graceMs === undefined ? 30000 : overrides.graceMs,
        reclaimMs: overrides.reclaimMs === undefined ? 600000 : overrides.reclaimMs,
        finishedTtlMs: 300000,
        idleTtlMs: 60000,
        setTimer: (fn, ms) => {
            const id = ++state.seq;
            state.tasks.set(id, {id, fn, ms});
            return id;
        },
        clearTimer: id => {
            state.tasks.delete(id);
        },
        tickMs: 5,
    });

    const delays = () => Array.from(state.tasks.values()).map(task => task.ms);
    const fire = (ms: number) => {
        for (const task of Array.from(state.tasks.values())) {
            if (task.ms === ms) {
                state.tasks.delete(task.id);
                task.fn();
            }
        }
    };

    return {host, state, delays, fire};
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('断线宽限：宽限内继续，宽限后暂停，超时回收', async () => {
    const {host, delays, fire} = makeHost();
    const game = host.create('Alice', {mode: 'human', seed: 1, difficulty: 1});
    host.clientConnected(game.id);
    game.start();
    await flush();
    for (let i = 0; i < 5; i += 1) {
        game.tick();
        await flush();
    }

    host.clientDisconnected(game.id);
    assert.deepEqual(delays(), [30000], 'a disconnect schedules the grace timer');

    // Still running during the grace window.
    game.tick();
    assert.equal(game.engine.isFrozen, false);

    // A reconnect inside the grace window cancels the timer.
    host.clientConnected(game.id);
    assert.deepEqual(delays(), []);

    // Disconnect again and let the grace expire.
    host.clientDisconnected(game.id);
    fire(30000);
    assert.equal(game.isPausedByDisconnect, true, 'grace expiry pauses for disconnect');
    assert.equal(game.engine.isFrozen, true);
    assert.equal(game.state, 'paused');
    assert.deepEqual(delays(), [600000], 'a reclaim timer is scheduled');

    const frozenTick = game.engine.currentTick;
    game.tick();
    assert.equal(game.engine.currentTick, frozenTick, 'a paused game must not advance');

    fire(600000);
    assert.equal(host.get(game.id), undefined, 'the instance is reclaimed after the timeout');
});

test('暂停后的重连保持暂停，直到用户显式恢复', async () => {
    const {host, fire} = makeHost();
    const game = host.create('Bob', {mode: 'human', seed: 2, difficulty: 1});
    host.clientConnected(game.id);
    game.start();
    await flush();

    host.clientDisconnected(game.id);
    fire(30000);
    assert.equal(game.isPausedByDisconnect, true);

    host.clientConnected(game.id);
    assert.equal(game.isPausedByDisconnect, true, 'a reconnect after the pause keeps it paused');
    assert.equal(game.engine.isFrozen, true);

    game.resume();
    assert.equal(game.isPausedByDisconnect, false);
    assert.equal(game.engine.isFrozen, false);
});

test('维护退出：停止接收新局并冻结在途对局', async () => {
    const {host} = makeHost();
    const game = host.create('Carol', {mode: 'human', seed: 3, difficulty: 1});
    game.start();
    await flush();

    host.beginMaintenance();

    assert.equal(host.isAccepting, false);
    assert.throws(() => host.create('Dave', {mode: 'human'}), /NOT_ACCEPTING/);
    assert.equal(game.isInterrupted, true);
    assert.equal(game.engine.isFrozen, true);
});

test('回收扫描：已结束与从未开始的对局都会过期', async () => {
    const {host, state} = makeHost();

    const idle = host.create('Idle', {mode: 'human', seed: 4, difficulty: 1});
    const finished = host.create('Done', {mode: 'human', seed: 5, difficulty: 1});
    finished.finishedAt = state.now;

    state.now += 60001;
    host.sweep();
    assert.equal(host.get(idle.id), undefined, 'a never-started game is reclaimed');
    assert.ok(host.get(finished.id), 'a finished game survives the idle TTL');

    state.now += 300001;
    host.sweep();
    assert.equal(host.get(finished.id), undefined, 'a finished game is reclaimed after its TTL');
});

test('指令幂等：重复的 commandId 返回首次结果', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();
    let counter = 0;
    const games = new GameHost({
        newGameId: () => 'game-' + (++counter),
        onCreated: game => store.createRun(game.id, game.username, 1000),
    });
    const deps: ApiDeps = {
        store,
        secret: 'lifecycle-secret',
        now: () => 1000,
        newRunId: () => 'run-' + (++counter),
        games,
    };

    const request = (over: Partial<ApiRequest>): ApiRequest => ({
        method: 'GET', pathname: '/', searchParams: {}, token: null, body: null, ...over,
    });
    const token = handleApi(deps, request({method: 'POST', pathname: '/api/session', body: {username: 'Erin'}})).body.token;
    const id = handleApi(deps, request({method: 'POST', pathname: '/api/games', token, body: {mode: 'human', difficulty: 1}})).body.id;

    const first = handleApi(deps, request({
        method: 'POST', pathname: `/api/games/${id}/strategy`, token, body: {text: 'first', commandId: 'c1'},
    }));
    const second = handleApi(deps, request({
        method: 'POST', pathname: `/api/games/${id}/strategy`, token, body: {text: 'second', commandId: 'c1'},
    }));

    assert.equal(first.status, 200);
    assert.deepEqual(second.body, first.body, 'a repeated command id returns the original result');
});
