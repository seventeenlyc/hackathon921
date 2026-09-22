// 托管游戏的注册表与实时驱动（阶段 B）。
//
// `HostedGame` 本身不含定时器；真实时间只出现在这里：以约 30Hz 调用
// `game.tick()`，倍速即每帧多调几次。这样测试可以直接按 tick 推进，而生产
// 用一个 setInterval 驱动，二者走同一条确定性模拟路径。

import type {AgentConfig} from '../agent';
import type {DecisionRecord, GameMode} from './hosted';
import {HostedGame} from './hosted';

export type {HostedGame};

export interface GameHostOptions {
    newGameId: () => string;
    /** Provider config, shared by every AI game. */
    agent?: AgentConfig;
    /** Driver frame interval in ms; defaults to 1000/30. */
    tickMs?: number;
    defaultDifficulty?: number;
    /** Injected clock; defaults to Date.now. */
    now?: () => number;
    /** Continue this long after the last stream disconnects (default 30 s). */
    graceMs?: number;
    /** Reclaim a disconnect-paused game after this long (default 10 min). */
    reclaimMs?: number;
    /** Keep a finished game before reclaiming it (default 5 min). */
    finishedTtlMs?: number;
    /** Reclaim a game that was never started after this long (default 30 min). */
    idleTtlMs?: number;
    /** Injectable timers, so lifecycle tests drive them without real time. */
    setTimer?: (fn: () => void, ms: number) => any;
    clearTimer?: (handle: any) => void;
    onReclaimed?: (game: HostedGame, reason: string) => void;
    onMaintenance?: (game: HostedGame) => void;
    /** Called right after a game is registered, so the host can open its run row. */
    onCreated?: (game: HostedGame) => void;
    onWaveReached?: (game: HostedGame, wave: number) => void;
    onGameOver?: (game: HostedGame) => void;
    onDecision?: (game: HostedGame, entry: DecisionRecord) => void;
    onError?: (game: HostedGame, message: string) => void;
}

export interface CreateGameOptions {
    mode?: GameMode;
    difficulty?: number;
    seed?: number;
}

/** FNV-1a seed from the random game id, so a game is reproducible given its id. */
function seedFromId(id: string): number {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

const DEFAULT_GRACE_MS = 30_000;
const DEFAULT_RECLAIM_MS = 10 * 60_000;
const DEFAULT_FINISHED_TTL_MS = 5 * 60_000;
const DEFAULT_IDLE_TTL_MS = 30 * 60_000;

export class GameHost {
    private readonly games = new Map<string, HostedGame>();
    private readonly timers = new Map<string, any>();
    private readonly graceTimers = new Map<string, any>();
    private readonly reclaimTimers = new Map<string, any>();
    private accepting = true;

    constructor(private readonly options: GameHostOptions) {
    }

    get isAccepting(): boolean {
        return this.accepting;
    }

    private now(): number {
        return this.options.now ? this.options.now() : Date.now();
    }

    private setTimer(fn: () => void, ms: number): any {
        if (this.options.setTimer) return this.options.setTimer(fn, ms);
        const handle = setTimeout(fn, ms);
        // Grace/reclaim timers are housekeeping: they must never keep the process
        // (or a test runner) alive on their own.
        if (handle && typeof handle.unref === 'function') handle.unref();
        return handle;
    }

    private clearTimer(handle: any) {
        if (handle === undefined || handle === null) return;
        if (this.options.clearTimer) this.options.clearTimer(handle);
        else clearTimeout(handle);
    }

    private clearLifecycleTimers(id: string) {
        this.clearTimer(this.graceTimers.get(id));
        this.graceTimers.delete(id);
        this.clearTimer(this.reclaimTimers.get(id));
        this.reclaimTimers.delete(id);
    }

    /** A browser stream attached: cancel any grace/reclaim countdown. */
    clientConnected(id: string) {
        const game = this.games.get(id);
        if (!game) return;
        this.clearLifecycleTimers(id);
        game.clientConnected();
    }

    /**
     * A browser stream detached. When the last one goes, keep the game running for
     * the grace window (a refresh must not pause a run), then pause it.
     */
    clientDisconnected(id: string) {
        const game = this.games.get(id);
        if (!game) return;
        game.clientDisconnected();
        if (game.hasClients) return;
        if (game.engine.isOver) return;
        // A reconnect after the pause keeps the game paused until the user resumes.
        if (game.isPausedByDisconnect) return;

        this.clearLifecycleTimers(id);
        const grace = this.options.graceMs === undefined ? DEFAULT_GRACE_MS : this.options.graceMs;
        this.graceTimers.set(id, this.setTimer(() => this.pauseForDisconnect(id), grace));
    }

    private pauseForDisconnect(id: string) {
        const game = this.games.get(id);
        if (!game || game.hasClients || game.engine.isOver) return;
        game.pauseForDisconnect();

        const reclaim = this.options.reclaimMs === undefined ? DEFAULT_RECLAIM_MS : this.options.reclaimMs;
        this.reclaimTimers.set(id, this.setTimer(() => this.reclaim(id, 'DISCONNECT_TIMEOUT'), reclaim));
    }

    private reclaim(id: string, reason: string) {
        const game = this.games.get(id);
        if (!game) return;
        this.clearLifecycleTimers(id);
        this.stopDriver(id);
        this.games.delete(id);
        if (this.options.onReclaimed) this.options.onReclaimed(game, reason);
    }

    /** Reclaim finished or never-started games. Safe to call on an interval. */
    sweep() {
        const now = this.now();
        const finishedTtl = this.options.finishedTtlMs === undefined ? DEFAULT_FINISHED_TTL_MS : this.options.finishedTtlMs;
        const idleTtl = this.options.idleTtlMs === undefined ? DEFAULT_IDLE_TTL_MS : this.options.idleTtlMs;

        for (const game of Array.from(this.games.values())) {
            if (game.finishedAt !== null && now - game.finishedAt > finishedTtl) {
                this.reclaim(game.id, 'FINISHED');
                continue;
            }
            if (game.finishedAt === null && !game.hasClients && !game.isPausedByDisconnect
                && game.state === 'idle' && now - game.createdAt > idleTtl) {
                this.reclaim(game.id, 'IDLE_TIMEOUT');
            }
        }
    }

    /**
     * Deployment shutdown (phase D): stop taking new games, freeze the ones in
     * flight so no further decisions execute, and stop their drivers. The caller
     * then closes the server; confirmed wave scores are already persisted.
     */
    beginMaintenance() {
        this.accepting = false;
        this.stopAllDrivers();
        for (const game of Array.from(this.games.values())) {
            this.clearLifecycleTimers(game.id);
            game.interrupt();
            if (this.options.onMaintenance) this.options.onMaintenance(game);
        }
    }

    create(username: string, opts: CreateGameOptions = {}): HostedGame {
        if (!this.accepting) throw new Error('NOT_ACCEPTING');
        const id = this.options.newGameId();
        const game = new HostedGame({
            id,
            username,
            mode: opts.mode || 'ai',
            seed: opts.seed === undefined ? seedFromId(id) : opts.seed,
            difficulty: opts.difficulty === undefined ? this.options.defaultDifficulty : opts.difficulty,
            agent: this.options.agent,
            now: this.options.now,
            onWaveReached: this.options.onWaveReached,
            onGameOver: finished => {
                this.stopDriver(finished.id);
                if (this.options.onGameOver) this.options.onGameOver(finished);
            },
            onDecision: this.options.onDecision,
            onError: this.options.onError,
        });

        this.games.set(id, game);
        if (this.options.onCreated) this.options.onCreated(game);
        return game;
    }

    get(id: string): HostedGame | undefined {
        return this.games.get(id);
    }

    list(): HostedGame[] {
        return Array.from(this.games.values());
    }

    size(): number {
        return this.games.size;
    }

    remove(id: string) {
        this.stopDriver(id);
        this.games.delete(id);
    }

    /** Start the real-time driver for a game. No-op if it is already running. */
    startDriver(id: string): boolean {
        const game = this.games.get(id);
        if (!game) return false;
        if (this.timers.has(id)) return true;

        const tickMs = this.options.tickMs === undefined ? 1000 / 30 : this.options.tickMs;
        this.timers.set(id, setInterval(() => {
            // `tick()` is a no-op while paused, planning or over; speed only decides
            // how many base steps happen per frame.
            for (let step = 0; step < game.speed; step++) {
                game.tick();
            }
        }, tickMs));
        return true;
    }

    stopDriver(id: string) {
        const timer = this.timers.get(id);
        if (timer !== undefined) {
            clearInterval(timer);
            this.timers.delete(id);
        }
    }

    stopAllDrivers() {
        for (const id of Array.from(this.timers.keys())) {
            this.stopDriver(id);
        }
    }

    /** A plain, serialisable view of a game, for a host that reports or renders it. */
    summary(game: HostedGame) {
        return {
            id: game.id,
            username: game.username,
            mode: game.mode,
            state: game.state,
            wave: game.wave,
            speed: game.speed,
            cash: game.engine.cash.getBalance(),
            baseLife: game.engine.map.homeBase.getLife(),
            tick: game.engine.currentTick,
            decisions: game.decisionsMade,
            connected: game.hasClients,
            pausedByDisconnect: game.isPausedByDisconnect,
            interrupted: game.isInterrupted,
            createdAt: game.createdAt,
        };
    }
}
