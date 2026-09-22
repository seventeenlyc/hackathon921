import {GameClient} from './GameClient';
import type {GameSummary} from './GameClient';
import type {RenderSnapshot} from '../engine/RenderSnapshot';
import type {GameSpeed} from '../agent/GameLoop';

/**
 * The browser's single source of game state in phase C.
 *
 * The server owns the game; this hub only holds the last summary and render
 * frame, forwards intents, and lets the existing UI read one consistent state.
 * Everything network-facing is injected, so the hub is unit-tested in Node.
 */

export type SessionMode = 'ai' | 'human';

export interface GameSessionOptions {
    mode: SessionMode;
    difficulty: number;
    /** Obtains a session token (AI: nickname session; human: anonymous). */
    ensureToken: () => Promise<string | null>;
    /** Current token for the client; called on every request and stream connect. */
    getToken: () => string | null;
    client?: GameClient;
    onSnapshot?: (frame: RenderSnapshot) => void;
    onSummary?: (summary: GameSummary) => void;
    onGameOver?: (summary: GameSummary) => void;
    onError?: (message: string) => void;
}

export class GameSession {
    readonly client: GameClient;

    private readonly options: GameSessionOptions;
    private gameId: string | null = null;
    private latest: RenderSnapshot | null = null;
    private summary: GameSummary | null = null;
    private appliedLanes = 0;
    private requestedLanes: number | null = null;
    private disconnect: (() => void) | null = null;

    constructor(options: GameSessionOptions) {
        this.options = options;
        this.client = options.client || new GameClient({getToken: options.getToken});
    }

    /** Establish a session, create the hosted game and subscribe to its stream. */
    async open(): Promise<GameSummary> {
        const token = await this.options.ensureToken();
        if (!token) throw new Error('NO_SESSION');

        const created = await this.client.createGame({
            mode: this.options.mode,
            difficulty: this.options.difficulty,
        });

        this.gameId = created.id;
        this.setSummary(created);

        this.disconnect = this.client.connect(created.id, {
            onSnapshot: frame => this.applyFrame(frame),
            onOver: summary => {
                this.setSummary({...this.summary!, ...summary});
                if (this.options.onGameOver) this.options.onGameOver(this.summary!);
            },
            onError: message => {
                if (this.options.onError) this.options.onError(message);
            },
        });

        return created;
    }

    /** Latest render frame, or null before the first one arrives. */
    get lastSnapshot(): RenderSnapshot | null {
        return this.latest;
    }

    get id(): string | null {
        return this.gameId;
    }

    /** Raw server state (`idle`/`running`/`paused`/`planning`/`over`). */
    get state(): string {
        return this.summary ? this.summary.state : 'idle';
    }

    get wave(): number {
        return this.summary ? this.summary.wave : 1;
    }

    get speed(): GameSpeed {
        return (this.summary ? this.summary.speed : 1) as GameSpeed;
    }

    get cash(): number {
        return this.summary ? this.summary.cash : 0;
    }

    get isIdle(): boolean {
        return this.state === 'idle';
    }

    get appliedLaneCount(): number {
        return this.appliedLanes;
    }

    get requestedLaneCount(): number {
        return this.requestedLanes === null ? this.appliedLanes : this.requestedLanes;
    }

    get isLaneChangePending(): boolean {
        return this.requestedLanes !== null && this.requestedLanes !== this.appliedLanes;
    }

    async start(): Promise<void> {
        this.setSummary(await this.client.start(this.require()));
    }

    async pause(): Promise<void> {
        this.setSummary(await this.client.pause(this.require()));
    }

    async resume(): Promise<void> {
        this.setSummary(await this.client.resume(this.require()));
    }

    async setSpeed(speed: GameSpeed): Promise<void> {
        this.setSummary(await this.client.setSpeed(this.require(), speed));
    }

    /** Queue a prompt; resolves with the wave it becomes effective at. */
    submitStrategy(text: string) {
        return this.client.submitStrategy(this.require(), text);
    }

    async requestLanes(count: number): Promise<{ requested: number; appliedLanes: number }> {
        const result = await this.client.requestLanes(this.require(), count);
        this.requestedLanes = result.requested;
        return result;
    }

    workerBuild(type: string, i: number, j: number) {
        return this.client.humanBuild(this.require(), type, i, j);
    }

    workerUpgrade(id: string) {
        return this.client.humanUpgrade(this.require(), id);
    }

    close(): void {
        if (this.disconnect) {
            this.disconnect();
            this.disconnect = null;
        }
    }

    private require(): string {
        if (!this.gameId) throw new Error('GAME_NOT_OPEN');
        return this.gameId;
    }

    private applyFrame(frame: RenderSnapshot): void {
        this.latest = frame;
        this.appliedLanes = frame.spawns.length;
        if (this.requestedLanes !== null && this.requestedLanes === this.appliedLanes) {
            this.requestedLanes = null;
        }
        this.setSummary({
            ...this.summary!,
            state: frame.state,
            wave: frame.wave,
            cash: frame.cash,
            baseLife: frame.baseLife,
            tick: frame.tick,
        });
        if (this.options.onSnapshot) this.options.onSnapshot(frame);
    }

    private setSummary(summary: GameSummary): void {
        this.summary = summary;
        if (this.options.onSummary) this.options.onSummary(summary);
    }
}
