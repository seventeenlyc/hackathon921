import {
    ensureRun,
    ensureRunResult,
    recordPromptVersion,
    recordPromptVersionResult,
    syncReachedWave,
    syncReachedWaveResult,
} from './LeaderboardClient';
import type {ClientResult, PromptWriteResult, StrategyVersionLike} from './LeaderboardClient';

type QueueItem =
    | { kind: 'prompt'; username: string; version: StrategyVersionLike }
    | { kind: 'wave'; username: string; wave: number };

export interface SyncStatus {
    state: 'idle' | 'syncing' | 'failed';
    message: string;
    reason: string | null;
}

export interface RunSyncClient {
    ensureRun: (username: string) => Promise<string | null> | Promise<ClientResult<string>>;
    recordPromptVersion: (username: string, version: StrategyVersionLike) => Promise<PromptWriteResult | null> | Promise<ClientResult<PromptWriteResult>>;
    syncReachedWave: (username: string, wave: number) => Promise<number | null> | Promise<ClientResult<number>>;
}

interface RunSyncOptions {
    wait?: (ms: number) => Promise<void>;
    maxRetries?: number;
}

const DEFAULT_CLIENT: RunSyncClient = {
    ensureRun: ensureRunResult,
    recordPromptVersion: recordPromptVersionResult,
    syncReachedWave: syncReachedWaveResult,
};

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize<T>(value: T | ClientResult<T> | null): ClientResult<T> {
    if (value && typeof value === 'object' && 'ok' in value) return value as ClientResult<T>;
    if (value === null || value === undefined) {
        return { ok: false, status: 0, retryable: true, reason: 'SYNC_FAILED' };
    }
    return { ok: true, value: value as T };
}

export class RunSync {
    private readonly client: RunSyncClient;
    private readonly wait: (ms: number) => Promise<void>;
    private readonly maxRetries: number;
    private readonly queue: QueueItem[] = [];
    private readonly listeners: Array<(status: SyncStatus) => void> = [];
    private readonly drainedListeners: Array<() => void> = [];
    private readonly runPromises = new Map<string, Promise<ClientResult<string>>>();
    private statusValue: SyncStatus = { state: 'idle', message: '', reason: null };
    private pumping = false;
    private idleWaiters: Array<() => void> = [];

    constructor(client: RunSyncClient = DEFAULT_CLIENT, options: RunSyncOptions = {}) {
        this.client = client;
        this.wait = options.wait || sleep;
        this.maxRetries = options.maxRetries == null ? 3 : Math.max(0, options.maxRetries);
    }

    get status(): SyncStatus { return this.statusValue; }

    onStatus(listener: (status: SyncStatus) => void): void {
        this.listeners.push(listener);
    }

    onDrained(listener: () => void): void {
        this.drainedListeners.push(listener);
    }

    /** Start run creation before the first PLANNING boundary without blocking gameplay. */
    prepareRun(username: string): void {
        void this.ensureRunFor(username).then(result => {
            if (!result.ok) this.fail(result);
        });
    }

    /** Both enqueue methods mutate the queue synchronously; network work starts afterwards. */
    enqueuePrompt(username: string, version: StrategyVersionLike): void {
        if (!version.text.trim()) return;
        this.queue.push({ kind: 'prompt', username, version });
        void this.pump();
    }

    enqueueWave(username: string, wave: number): void {
        this.queue.push({ kind: 'wave', username, wave });
        void this.pump();
    }

    retryPending(): void {
        if (this.queue.length > 0) void this.pump();
    }

    whenIdle(): Promise<void> {
        if (!this.pumping) return Promise.resolve();
        return new Promise(resolve => this.idleWaiters.push(resolve));
    }

    private setStatus(status: SyncStatus): void {
        this.statusValue = status;
        this.listeners.forEach(listener => listener(status));
    }

    private fail(result: { reason: string }): void {
        this.setStatus({ state: 'failed', message: '记录未同步', reason: result.reason });
    }

    private ensureRunFor(username: string): Promise<ClientResult<string>> {
        const key = username.toLowerCase();
        const existing = this.runPromises.get(key);
        if (existing) return existing;
        const promise = Promise.resolve(this.client.ensureRun(username)).then(value => normalize(value));
        this.runPromises.set(key, promise);
        void promise.then(result => {
            if (!result.ok) this.runPromises.delete(key);
        });
        return promise;
    }

    private async runItem(item: QueueItem): Promise<ClientResult<unknown>> {
        const runResult = await this.ensureRunFor(item.username);
        if (!runResult.ok) return runResult;
        if (item.kind === 'prompt') {
            return normalize(await this.client.recordPromptVersion(item.username, item.version));
        }
        return normalize(await this.client.syncReachedWave(item.username, item.wave));
    }

    private async runWithRetry(item: QueueItem): Promise<ClientResult<unknown>> {
        for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
            const result = await this.runItem(item);
            if (result.ok || !result.retryable || attempt === this.maxRetries) return result;
            await this.wait(1000 * Math.pow(2, attempt));
        }
        return { ok: false, status: 0, retryable: true, reason: 'SYNC_FAILED' };
    }

    private async pump(): Promise<void> {
        if (this.pumping) return;
        this.pumping = true;
        this.setStatus({ state: 'syncing', message: '', reason: null });
        while (this.queue.length > 0) {
            const item = this.queue[0];
            const result = await this.runWithRetry(item);
            if (!result.ok) {
                this.fail(result);
                this.pumping = false;
                this.resolveIdleWaiters();
                return;
            }
            this.queue.shift();
        }
        this.pumping = false;
        this.setStatus({ state: 'idle', message: '', reason: null });
        this.drainedListeners.forEach(listener => listener());
        this.resolveIdleWaiters();
    }

    private resolveIdleWaiters(): void {
        const waiters = this.idleWaiters.splice(0);
        waiters.forEach(resolve => resolve());
    }
}

export const runSync = new RunSync();
