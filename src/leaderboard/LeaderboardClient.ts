import {sanitizeUsername} from './LeaderboardStore';
import {getSessionAvatar} from './SessionIdentity';
import {isKnownAvatarId} from './AvatarCatalog';
import type {AvatarId} from './AvatarCatalog';

export type PlayMode = 'ai' | 'human';
export type LeaderboardMode = PlayMode | 'total';

export interface RemoteEntry {
    uid: number;
    rank: number;
    username: string;
    avatarId: AvatarId | null;
    wave: number;
    achievedAt: number;
    mode: PlayMode;
}

export interface RemoteLeaderboard {
    entries: RemoteEntry[];
    me: { uid: number; username: string; avatarId: AvatarId | null; rank: number | null; wave: number | null; mode?: PlayMode } | null;
}

export interface StrategyVersionLike {
    version: number;
    text: string;
    fromWave: number;
}

export interface PromptNode {
    id: string;
    runId: string;
    version: number;
    prompt: string;
    fromWave: number;
    prevId: string | null;
    createdAt: number;
}

export interface BestRunPrompts {
    uid: number;
    username: string;
    runId: string | null;
    wave: number | null;
    prompts: PromptNode[];
}

export interface PromptWriteResult {
    recorded: true;
    version: number;
    fromWave: number;
}

export interface ClientSuccess<T> { ok: true; value: T; }
export interface ClientFailure { ok: false; status: number; retryable: boolean; reason: string; }
export type ClientResult<T> = ClientSuccess<T> | ClientFailure;

interface SessionState {
    username: string;
    avatarId: string;
    token: string;
    runId: string | null;
    mode: PlayMode;
    lastWave: number;
    generation: number;
}

const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = 5000;

let session: SessionState | null = null;
let sessionPromise: { username: string; avatarId: string; generation: number; promise: Promise<ClientResult<string>> } | null = null;
let runPromise: { generation: number; mode: PlayMode; promise: Promise<ClientResult<string>> } | null = null;
let generation = 0;

function withTimeout(): { signal: AbortSignal | undefined; done: () => void } {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => {
        if (controller) controller.abort();
    }, REQUEST_TIMEOUT_MS);
    return {
        signal: controller ? controller.signal : undefined,
        done: () => clearTimeout(timer),
    };
}

function isRetryableStatus(status: number): boolean {
    return status === 0 || status === 429 || status >= 500;
}

async function request<T>(path: string, init: RequestInit, token?: string | null): Promise<ClientResult<T>> {
    const { signal, done } = withTimeout();
    try {
        const headers: Record<string, string> = {
            ...((init.headers as Record<string, string> | undefined) || {}),
        };
        if (token) headers.authorization = 'Bearer ' + token;
        let response: Response;
        try {
            response = await fetch(API_BASE + path, { ...init, headers, signal });
        } catch (error) {
            return { ok: false, status: 0, retryable: true, reason: 'NETWORK_ERROR' };
        }

        let body: any = null;
        try { body = await response.json(); } catch (error) { /* malformed response */ }
        if (!response.ok) {
            return {
                ok: false,
                status: response.status,
                retryable: isRetryableStatus(response.status),
                reason: body && typeof body.reason === 'string'
                    ? body.reason
                    : body && typeof body.error === 'string' ? body.error : 'HTTP_ERROR',
            };
        }
        if (body === null) return { ok: false, status: 502, retryable: true, reason: 'INVALID_RESPONSE' };
        return { ok: true, value: body as T };
    } finally {
        done();
    }
}

async function ensureSessionResult(username: string, requestedAvatarId?: string | null): Promise<ClientResult<string>> {
    const clean = sanitizeUsername(username);
    if (!clean) return { ok: false, status: 400, retryable: false, reason: 'INVALID_USERNAME' };
    const avatarId = isKnownAvatarId(requestedAvatarId || '')
        ? requestedAvatarId as AvatarId
        : getSessionAvatar() || 'sentinel';
    if (session && session.username.toLowerCase() === clean.toLowerCase() && session.avatarId === avatarId) {
        return { ok: true, value: session.token };
    }
    if (sessionPromise && sessionPromise.username.toLowerCase() === clean.toLowerCase() && sessionPromise.avatarId === avatarId) {
        return sessionPromise.promise;
    }

    const requestGeneration = ++generation;
    const promise = (async (): Promise<ClientResult<string>> => {
        const result = await request<{ token?: unknown; username?: unknown }>(
            '/session',
            { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: clean, avatarId }) }
        );
        if (!result.ok) return result;
        if (typeof result.value.token !== 'string') {
            return { ok: false, status: 502, retryable: true, reason: 'INVALID_SESSION_RESPONSE' };
        }
        if (requestGeneration === generation) {
            session = {
                username: typeof result.value.username === 'string' ? result.value.username : clean,
                avatarId,
                token: result.value.token,
                runId: null,
                mode: 'ai',
                lastWave: 0,
                generation: requestGeneration,
            };
            runPromise = null;
        }
        return { ok: true, value: result.value.token };
    })();
    sessionPromise = { username: clean, avatarId, generation: requestGeneration, promise };
    void promise.then(
        () => { if (sessionPromise && sessionPromise.promise === promise) sessionPromise = null; },
        () => { if (sessionPromise && sessionPromise.promise === promise) sessionPromise = null; }
    );
    return promise;
}

export async function ensureRunResult(username: string, mode: PlayMode = 'ai'): Promise<ClientResult<string>> {
    const safeMode: PlayMode = mode === 'human' ? 'human' : 'ai';
    const tokenResult = await ensureSessionResult(username);
    if (!tokenResult.ok) return tokenResult;
    const current = session;
    if (!current || current.username.toLowerCase() !== username.toLowerCase()) {
        return { ok: false, status: 409, retryable: false, reason: 'STALE_SESSION' };
    }
    if (current.runId && current.mode === safeMode) return { ok: true, value: current.runId };
    if (runPromise && runPromise.generation === current.generation && runPromise.mode === safeMode) {
        return runPromise.promise;
    }

    const requestGeneration = current.generation;
    const promise = (async (): Promise<ClientResult<string>> => {
        const result = await request<{ runId?: unknown }>(
            '/runs',
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ mode: safeMode }),
            },
            current.token
        );
        if (!result.ok) return result;
        if (typeof result.value.runId !== 'string') {
            return { ok: false, status: 502, retryable: true, reason: 'INVALID_RUN_RESPONSE' };
        }
        if (session && session.generation === requestGeneration && session.token === current.token) {
            session.runId = result.value.runId;
            session.mode = safeMode;
            session.lastWave = 0;
        }
        return { ok: true, value: result.value.runId };
    })();
    runPromise = { generation: requestGeneration, mode: safeMode, promise };
    void promise.then(
        () => { if (runPromise && runPromise.promise === promise) runPromise = null; },
        () => { if (runPromise && runPromise.promise === promise) runPromise = null; }
    );
    return promise;
}

export async function ensureSessionToken(username: string, avatarId?: string | null): Promise<string | null> {
    const result = await ensureSessionResult(username, avatarId);
    return result.ok ? result.value : null;
}

export async function ensureRun(username: string, mode: PlayMode = 'ai'): Promise<string | null> {
    const result = await ensureRunResult(username, mode);
    return result.ok ? result.value : null;
}

export async function recordPromptVersionResult(
    username: string,
    version: StrategyVersionLike
): Promise<ClientResult<PromptWriteResult>> {
    const runResult = await ensureRunResult(username, 'ai');
    if (!runResult.ok) return runResult;
    const current = session;
    if (!current || current.runId !== runResult.value) {
        return { ok: false, status: 409, retryable: false, reason: 'STALE_SESSION' };
    }
    return request<PromptWriteResult>(
        '/runs/' + encodeURIComponent(runResult.value) + '/prompts',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ version: version.version, prompt: version.text, fromWave: version.fromWave }),
        },
        current.token
    );
}

export async function recordPromptVersion(username: string, version: StrategyVersionLike): Promise<PromptWriteResult | null> {
    const result = await recordPromptVersionResult(username, version);
    return result.ok ? result.value : null;
}

export async function syncReachedWaveResult(
    username: string,
    wave: number,
    mode: PlayMode = 'ai'
): Promise<ClientResult<number>> {
    if (!Number.isInteger(wave) || wave < 1) return { ok: false, status: 400, retryable: false, reason: 'WAVE_INVALID' };
    const runResult = await ensureRunResult(username, mode);
    if (!runResult.ok) return runResult;
    const current = session;
    if (!current || current.runId !== runResult.value) {
        return { ok: false, status: 409, retryable: false, reason: 'STALE_SESSION' };
    }
    if (wave <= current.lastWave) return { ok: true, value: current.lastWave };
    const result = await request<{ accepted?: unknown; bestWave?: unknown }>(
        '/runs/' + encodeURIComponent(runResult.value) + '/waves',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ wave }),
        },
        current.token
    );
    if (!result.ok) return result;
    if (result.value.accepted !== true) return { ok: false, status: 409, retryable: false, reason: 'WAVE_REJECTED' };
    if (session && session.generation === current.generation && session.runId === runResult.value) {
        session.lastWave = Math.max(session.lastWave, wave);
    }
    return { ok: true, value: typeof result.value.bestWave === 'number' ? result.value.bestWave : wave };
}

export async function syncReachedWave(username: string, wave: number, mode: PlayMode = 'ai'): Promise<number | null> {
    const result = await syncReachedWaveResult(username, wave, mode);
    return result.ok ? result.value : null;
}

export async function fetchSharedLeaderboard(
    username: string | null,
    modeOrLimit: LeaderboardMode | number = 'ai',
    limit = 10
): Promise<RemoteLeaderboard | null> {
    const mode: LeaderboardMode = typeof modeOrLimit === 'number' ? 'ai' : modeOrLimit;
    const finalLimit = typeof modeOrLimit === 'number' ? modeOrLimit : limit;
    let token: string | null = null;
    if (username) token = await ensureSessionToken(username, getSessionAvatar());
    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(finalLimit));
    if (mode) searchParams.set('mode', mode);
    const result = await request<any>(
        '/leaderboard?' + searchParams.toString(),
        { method: 'GET' },
        token
    );
    if (!result.ok || !Array.isArray(result.value.entries)) return null;

    const entries: RemoteEntry[] = [];
    for (const raw of result.value.entries) {
        if (!raw || !Number.isSafeInteger(raw.uid) || raw.uid < 1 || typeof raw.username !== 'string' || typeof raw.wave !== 'number') continue;
        entries.push({
            uid: raw.uid,
            rank: typeof raw.rank === 'number' ? raw.rank : entries.length + 1,
            username: raw.username,
            avatarId: isKnownAvatarId(raw.avatarId) ? raw.avatarId : null,
            wave: raw.wave,
            achievedAt: typeof raw.achievedAt === 'number' ? raw.achievedAt : 0,
            mode: raw.mode === 'human' ? 'human' : 'ai',
        });
    }
    let me: RemoteLeaderboard['me'] = null;
    if (result.value.me && typeof result.value.me === 'object' && Number.isSafeInteger(result.value.me.uid) && result.value.me.uid > 0 && typeof result.value.me.username === 'string') {
        me = {
            uid: result.value.me.uid,
            username: result.value.me.username,
            avatarId: isKnownAvatarId(result.value.me.avatarId) ? result.value.me.avatarId : null,
            rank: typeof result.value.me.rank === 'number' ? result.value.me.rank : null,
            wave: typeof result.value.me.wave === 'number' ? result.value.me.wave : null,
            mode: result.value.me.mode === 'human' ? 'human' : 'ai',
        };
    }
    return { entries, me };
}

export async function fetchBestRunPrompts(uid: number): Promise<BestRunPrompts | null> {
    if (!Number.isSafeInteger(uid) || uid < 1) return null;
    const result = await request<BestRunPrompts>(
        '/leaderboard/' + uid + '/prompts',
        { method: 'GET' }
    );
    if (!result.ok || !result.value || !Array.isArray(result.value.prompts)) return null;
    return result.value;
}

export function resetClientState(): void {
    generation += 1;
    session = null;
    sessionPromise = null;
    runPromise = null;
}

export function getSessionToken(): string | null {
    return session ? session.token : null;
}
