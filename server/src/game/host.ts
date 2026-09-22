// 托管游戏的注册表与实时驱动（阶段 B）。
//
// `HostedGame` 本身不含定时器；真实时间只出现在这里：以约 30Hz 调用
// `game.tick()`，倍速即每帧多调几次。这样测试可以直接按 tick 推进，而生产
// 用一个 setInterval 驱动，二者走同一条确定性模拟路径。

import type {AgentConfig} from '../agent';
import type {DecisionRecord, GameMode} from './hosted';
import {HostedGame} from './hosted';

export interface GameHostOptions {
    newGameId: () => string;
    /** Provider config, shared by every AI game. */
    agent?: AgentConfig;
    /** Driver frame interval in ms; defaults to 1000/30. */
    tickMs?: number;
    defaultDifficulty?: number;
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

export class GameHost {
    private readonly games = new Map<string, HostedGame>();
    private readonly timers = new Map<string, any>();

    constructor(private readonly options: GameHostOptions) {
    }

    create(username: string, opts: CreateGameOptions = {}): HostedGame {
        const id = this.options.newGameId();
        const game = new HostedGame({
            id,
            username,
            mode: opts.mode || 'ai',
            seed: opts.seed === undefined ? seedFromId(id) : opts.seed,
            difficulty: opts.difficulty === undefined ? this.options.defaultDifficulty : opts.difficulty,
            agent: this.options.agent,
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
            createdAt: game.createdAt,
        };
    }
}
