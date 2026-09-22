// 服务端托管的一局完整对局（阶段 B）。
//
// 这里把无头引擎、动作端口、Prompt 版本与 AI planner 组装在一起，使一局可以在
// **没有浏览器参与**的情况下自行完成「出怪 → AI 决策 → 继续战斗」，并以引擎事件
// 作为波次的唯一真值来源（而不是像旧前端那样由客户端上报）。
//
// 时钟由宿主驱动：真实时间的定时器每帧调用 `engine.tick()` 若干次（倍速即次数）。
// 因此本模块本身不依赖任何定时器，测试可以直接按 tick 推进。

import {GameEngine} from '../../../src/engine/GameEngine';
import {EngineBattlefield} from '../../../src/engine/EngineBattlefield';
import {GameActions} from '../../../src/agent/GameActions';
import {StrategyStore} from '../../../src/agent/StrategyStore';
import type {GameSnapshot} from '../../../src/agent/types';
import type {GameSpeed, Planner} from '../../../src/agent/GameLoop';
import type {AgentAction, AgentConfig} from '../agent';
import {decideWithProvider} from '../agent';

export type GameMode = 'ai' | 'human';

/** What the AI did this round, for a host that wants to show or log it. */
export interface DecisionRecord {
    wave: number;
    action: string;
    detail: string;
    ok: boolean;
    message: string;
}

export interface HostedGameOptions {
    id: string;
    /** Owner, from the session token. Used for access control and score attribution. */
    username: string;
    seed: number;
    mode: GameMode;
    difficulty?: number;
    /** Fixed pause between waves in human mode; 0 for AI. Defaults per mode. */
    interWaveDelayMs?: number;
    /** Provider config. Absent means the AI has nothing to call and takes no action. */
    agent?: AgentConfig;
    onWaveReached?: (game: HostedGame, wave: number) => void;
    onGameOver?: (game: HostedGame) => void;
    onDecision?: (game: HostedGame, entry: DecisionRecord) => void;
    onError?: (game: HostedGame, message: string) => void;
}

/** Immediate planner: a human game has no AI thinking window. */
const humanPlanner: Planner = {plan: () => Promise.resolve()};

/**
 * The AI planner. It runs while the engine is frozen in PLANNING, so a provider
 * call cannot advance the battle. Failure is closed: no action is taken and the
 * wave still starts, exactly like the browser runtime.
 */
class AgentPlanner implements Planner {
    constructor(
        private readonly engine: GameEngine,
        private readonly actions: GameActions,
        private readonly store: StrategyStore,
        private readonly config: AgentConfig,
        private readonly onDecision: (entry: DecisionRecord) => void,
        private readonly onError: (message: string) => void
    ) {
    }

    async plan(): Promise<void> {
        // The store is locked when the loop enters PLANNING, so `active()` is the
        // version this wave must obey; later edits defer to the next wave.
        const strategy = this.store.active().text;
        if (!strategy.trim()) {
            this.onError('EMPTY_STRATEGY');
            return;
        }

        let state: GameSnapshot;
        try {
            state = this.actions.getState();
        } catch (e) {
            this.onError('STATE_READ_FAILED');
            return;
        }

        const result = await decideWithProvider(this.config, strategy, state);
        if (!result.ok) {
            this.onError(result.message);
            return;
        }

        const wave = this.engine.wave;
        for (const action of result.actions) {
            this.execute(action, wave);
        }
    }

    private execute(action: AgentAction, wave: number) {
        const args = action.arguments || {};

        if (action.name === 'build_tower') {
            const result = this.actions.buildTower(String(args.type), Number(args.i), Number(args.j));
            this.onDecision({
                wave,
                action: 'build_tower',
                detail: `${String(args.type)} at (${String(args.i)}, ${String(args.j)})`,
                ok: result.ok,
                message: result.message,
            });
            return;
        }

        if (action.name === 'upgrade_tower') {
            const result = this.actions.upgradeTower(String(args.id));
            this.onDecision({
                wave,
                action: 'upgrade_tower',
                detail: `tower ${String(args.id)}`,
                ok: result.ok,
                message: result.message,
            });
            return;
        }

        this.onDecision({
            wave,
            action: String(action.name),
            detail: '',
            ok: false,
            message: 'UNKNOWN_ACTION',
        });
    }
}

/**
 * A single hosted game. Every piece of mutable state (engine, prompt versions,
 * action port) belongs to this instance, so several games can run at once.
 */
export class HostedGame {
    readonly id: string;
    readonly username: string;
    readonly mode: GameMode;
    readonly engine: GameEngine;
    readonly battlefield: EngineBattlefield;
    readonly actions: GameActions;
    readonly strategy = new StrategyStore();
    readonly createdAt: number;

    private readonly onWaveReachedCb?: (game: HostedGame, wave: number) => void;
    private readonly onGameOverCb?: (game: HostedGame) => void;
    private readonly onDecisionCb?: (game: HostedGame, entry: DecisionRecord) => void;
    private readonly onErrorCb?: (game: HostedGame, message: string) => void;

    constructor(options: HostedGameOptions) {
        this.id = options.id;
        this.username = options.username;
        this.mode = options.mode;
        this.createdAt = Date.now();
        this.onWaveReachedCb = options.onWaveReached;
        this.onGameOverCb = options.onGameOver;
        this.onDecisionCb = options.onDecision;
        this.onErrorCb = options.onError;

        this.engine = new GameEngine({
            seed: options.seed,
            difficulty: options.difficulty,
            interWaveDelayMs: options.interWaveDelayMs === undefined
                ? (options.mode === 'human' ? 7000 : 0)
                : options.interWaveDelayMs,
        });
        this.battlefield = new EngineBattlefield(this.engine);
        this.actions = new GameActions(this.battlefield);

        // Lock the queued prompt exactly when PLANNING opens, so the AI plans the
        // upcoming wave with the version the player had submitted by then.
        this.engine.onChange(state => {
            if (state === 'planning') this.strategy.lock();
        });

        this.engine.onWaveReached(wave => {
            if (this.onWaveReachedCb) this.onWaveReachedCb(this, wave);
        });
        this.engine.onGameOver(() => {
            if (this.onGameOverCb) this.onGameOverCb(this);
        });

        if (options.mode === 'ai' && options.agent) {
            const planner = new AgentPlanner(
                this.engine,
                this.actions,
                this.strategy,
                options.agent,
                entry => {
                    if (this.onDecisionCb) this.onDecisionCb(this, entry);
                },
                message => {
                    if (this.onErrorCb) this.onErrorCb(this, message);
                }
            );
            this.engine.setPlanner(planner);
        } else {
            // Human mode, or AI mode with no provider: nobody plans this wave.
            this.engine.setPlanner(humanPlanner);
        }
    }

    get state() {
        return this.engine.state;
    }

    get wave(): number {
        return this.engine.wave;
    }

    get speed(): GameSpeed {
        return this.engine.speed;
    }

    get isOver(): boolean {
        return this.engine.isOver;
    }

    start() {
        this.engine.start();
    }

    pause() {
        this.engine.pause();
    }

    resume() {
        this.engine.resume();
    }

    setSpeed(speed: GameSpeed) {
        this.engine.setSpeed(speed);
    }

    /**
     * Submit a prompt. While IDLE it becomes active for wave 1; otherwise it is
     * queued for the next wave boundary. The version arithmetic lives in
     * `StrategyStore`/`effectiveWave`.
     */
    submitStrategy(text: string) {
        const fromWave = this.engine.isIdle() ? this.wave : this.wave + 1;
        return this.strategy.submit(text, fromWave);
    }

    /** Queue a lane count for the next wave boundary. */
    requestSpawnCount(count: number): number {
        return this.engine.requestSpawnCount(count);
    }

    /** The compressed observation, as the AI sees it. */
    snapshot(): GameSnapshot {
        return this.actions.getState();
    }

    /** Advance one base simulation step. The host's real-time driver calls this. */
    tick() {
        this.engine.tick();
    }
}
