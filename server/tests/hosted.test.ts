// 阶段 B：服务端托管单局，全程无浏览器。
//
// 这些测试直接把无头引擎当后端模拟推进：宿主按 tick 驱动，AI planner 用假 provider
// （无网络）返回工具调用，波次事件写进真实的 LeaderboardStore。它们证明「AI 决策 +
// 战斗推进」可以脱离浏览器完成，并且波次真值来自引擎而不是客户端上报。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LeaderboardStore } from '../src/store';
import { GameHost } from '../src/game/host';
import type { HostedGame } from '../src/game/hosted';

function flush() {
    return new Promise<void>(resolve => setTimeout(resolve, 0));
}

/** Drive exactly `ticks` effective steps, resolving PLANNING after each one. */
async function advance(game: HostedGame, ticks: number) {
    let advanced = 0;
    let guard = 0;
    while (advanced < ticks && guard < ticks * 4 + 200) {
        const before = game.engine.currentTick;
        game.tick();
        if (game.engine.currentTick > before) advanced += 1;
        await flush();
        guard += 1;
    }
}

function makeStore(): LeaderboardStore {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();
    return store;
}

/** A provider that builds on the first candidate the engine offers. No network. */
function buildingProvider() {
    return async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        const user = body.messages.find((m: any) => m.role === 'user');
        const marker = 'Battlefield state (JSON):\n';
        const rest = String(user.content).slice(String(user.content).indexOf(marker) + marker.length);
        const state = JSON.parse(rest.slice(0, rest.indexOf('\n\nPlayer strategy:')));
        const candidate = state.buildCandidates && state.buildCandidates[0];

        const toolCalls = candidate
            ? [{ function: { name: 'build_tower', arguments: JSON.stringify({ type: 'canon', i: candidate.i, j: candidate.j }) } }]
            : [];

        return {
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { tool_calls: toolCalls } }] }),
        };
    };
}

test('托管一局（人类模式）无需浏览器即可推进并产生权威波次事件', async () => {
    const store = makeStore();
    const now = 1_000_000;
    const reached: number[] = [];

    const host = new GameHost({
        newGameId: () => 'game-human',
        onWaveReached: (game, wave) => {
            reached.push(wave);
            store.recordWave(game.id, game.username, wave, now);
        },
    });

    const game = host.create('Alice', {mode: 'human', seed: 31, difficulty: 2});
    store.createRun(game.id, game.username, now);
    assert.equal(game.username, 'Alice');
    assert.equal(game.mode, 'human');

    game.start();
    await advance(game, 400);

    assert.ok(reached.length >= 1, 'the engine must report a reached wave');
    assert.equal(reached[0], 1);
    assert.ok(game.engine.enemies.all().length > 0, 'enemies must have spawned');
    // Authoritative score came from the engine event, not a client report.
    assert.equal(store.bestWaveOf('Alice'), reached[reached.length - 1]);
    host.remove(game.id);
});

test('托管一局（AI 模式）用假 provider 完成决策与建塔', async () => {
    const decisions: Array<{ ok: boolean; action: string }> = [];
    const host = new GameHost({
        newGameId: () => 'game-ai',
        agent: { apiKey: 'test-key', fetchImpl: buildingProvider() as any },
        onDecision: (_game, entry) => decisions.push({ ok: entry.ok, action: entry.action }),
    });

    const game = host.create('Bob', {mode: 'ai', seed: 9090, difficulty: 2});

    // A prompt must be written before the run can start meaningfully.
    game.submitStrategy('Build a canon near the path.');
    game.start();

    await advance(game, 200);

    const towers = game.battlefield.towers();
    assert.ok(towers.length >= 1, 'the AI action must have built a tower');
    assert.ok(game.engine.cash.getBalance() < 200, 'the build must have charged cash');
    assert.ok(decisions.length >= 1, 'a decision must have been recorded');
    assert.equal(decisions[0].action, 'build_tower');
    assert.equal(decisions[0].ok, true);
    host.remove(game.id);
});

test('暂停后引擎不再推进，恢复后继续', async () => {
    const host = new GameHost({newGameId: () => 'game-pause'});
    const game = host.create('Carol', {mode: 'human', seed: 5, difficulty: 1});
    game.start();
    await advance(game, 30);

    game.pause();
    const frozen = game.engine.currentTick;
    game.tick();
    game.tick();
    assert.equal(game.engine.currentTick, frozen);

    game.resume();
    await advance(game, 5);
    assert.ok(game.engine.currentTick > frozen);
    host.remove(game.id);
});

test('改路线在下一个波次边界生效', async () => {
    const host = new GameHost({newGameId: () => 'game-lanes'});
    const game = host.create('Dave', {mode: 'human', seed: 13, difficulty: 1});
    game.start();
    await advance(game, 120);

    assert.equal(game.engine.map.enemyBases.length, 1);
    game.requestSpawnCount(3);
    await advance(game, 200);
    assert.equal(game.engine.map.enemyBases.length, 3);
    host.remove(game.id);
});

test('实时驱动按真实时间推进，并可停止', async () => {
    const host = new GameHost({newGameId: () => 'game-driver', tickMs: 5});
    const game = host.create('Erin', {mode: 'human', seed: 2, difficulty: 1});
    game.start();
    await flush(); // let wave-1 planning resolve

    host.startDriver(game.id);
    await new Promise<void>(resolve => setTimeout(resolve, 80));
    host.stopDriver(game.id);

    const afterStop = game.engine.currentTick;
    assert.ok(afterStop > 0, 'the real-time driver must advance the engine');
    await new Promise<void>(resolve => setTimeout(resolve, 40));
    assert.equal(game.engine.currentTick, afterStop, 'a stopped driver must not advance');
    host.remove(game.id);
});

test('对局之间互不影响', async () => {
    const host = new GameHost({newGameId: (() => {
        let n = 0;
        return () => 'game-' + (++n);
    })()});

    const a = host.create('A', {mode: 'human', seed: 1, difficulty: 1});
    const b = host.create('B', {mode: 'human', seed: 2, difficulty: 1});
    a.start();

    await advance(a, 100);

    assert.notEqual(a.engine.currentTick, b.engine.currentTick);
    assert.equal(b.engine.currentTick, 0, 'the idle game must not advance');
    assert.equal(b.engine.cash.getBalance(), 200);
    host.remove(a.id);
    host.remove(b.id);
});
