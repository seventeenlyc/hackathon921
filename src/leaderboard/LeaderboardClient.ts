// 共享排行榜的 API 客户端。
//
// 职责边界：把「本地记录」与「服务端同步」分开。
//  - 服务端是共享排行榜的真值来源（docs/PRODUCT_CONCEPT.md §9）：不同设备看到同一份排名；
//  - 本地 localStorage 只在 API 不可用时提供降级展示，界面会明确标注「离线」；
//  - 任何网络失败都不抛给调用方，一律返回 null 让上层降级 —— 排行榜是附加功能，
//    后端抖一下不该让游戏本体报错。
//
// 成绩校验由服务端负责：这里只上报「到达第 N 波」，服务端记录并以自己的记录为准。

import { sanitizeUsername } from './LeaderboardStore';

export interface RemoteEntry {
    rank: number;
    username: string;
    wave: number;
    achievedAt: number;
}

export interface RemoteLeaderboard {
    entries: RemoteEntry[];
    me: { username: string; rank: number | null; wave: number | null } | null;
}

interface SessionState {
    username: string;
    token: string;
    runId: string | null;
    lastWave: number;
}

const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = 5000;

/* 模块级会话状态：token 与当前对局。刷新页面即重置（无账号体系，见 §14）。 */
let session: SessionState | null = null;

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

async function request(path: string, init: RequestInit, token?: string | null): Promise<any | null> {
    const { signal, done } = withTimeout();
    try {
        const headers: Record<string, string> = {
            ...((init.headers as Record<string, string> | undefined) || {}),
        };
        if (token) headers['authorization'] = 'Bearer ' + token;
        const response = await fetch(API_BASE + path, { ...init, headers, signal });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        return null;
    } finally {
        done();
    }
}

/** 取得（必要时新建）当前昵称的会话 token。 */
async function ensureSession(username: string): Promise<string | null> {
    if (session && session.username.toLowerCase() === username.toLowerCase()) {
        return session.token;
    }
    const data = await request('/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username }),
    });
    if (!data || typeof data.token !== 'string') return null;
    session = {
        username: typeof data.username === 'string' ? data.username : username,
        token: data.token,
        runId: null,
        lastWave: 0,
    };
    return data.token;
}

/**
 * 把一次「到达波次」同步到服务端，返回服务端确认的最佳波次；离线时返回 null。
 *
 * 波次回退意味着新的一局（重开或换了昵称）。此时必须重新开局，否则服务端会以
 * WAVE_NOT_INCREASING 拒绝，这一局的成绩将永远进不了共享排行榜。
 */
export async function syncReachedWave(username: string, wave: number): Promise<number | null> {
    const clean = sanitizeUsername(username);
    if (!clean || !Number.isInteger(wave) || wave < 1) return null;

    const token = await ensureSession(clean);
    if (!token || !session) return null;

    if (wave <= session.lastWave) {
        session.runId = null;
        session.lastWave = 0;
    }

    // 用局部变量承接：session 是模块级可变状态，跨 await 后 TS 无法保证其字段仍被收窄。
    let runId: string | null = session.runId;
    if (!runId) {
        const run = await request('/runs', { method: 'POST' }, token);
        if (!run || typeof run.runId !== 'string') return null;
        runId = String(run.runId);
        session.runId = runId;
        session.lastWave = 0;
    }
    if (!runId) return null;

    const result = await request(
        '/runs/' + encodeURIComponent(runId) + '/waves',
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ wave }),
        },
        token
    );

    if (!result || result.accepted !== true) return null;
    session.lastWave = wave;
    return typeof result.bestWave === 'number' ? result.bestWave : wave;
}

/** 拉取共享排行榜；离线或出错返回 null，调用方回退到本地展示。 */
export async function fetchSharedLeaderboard(
    username: string | null,
    limit = 10
): Promise<RemoteLeaderboard | null> {
    let token: string | null = null;
    if (username) {
        const clean = sanitizeUsername(username);
        if (clean) token = await ensureSession(clean);
    }

    const data = await request(
        '/leaderboard?limit=' + encodeURIComponent(String(limit)),
        { method: 'GET' },
        token
    );
    if (!data || !Array.isArray(data.entries)) return null;

    const entries: RemoteEntry[] = [];
    for (const raw of data.entries) {
        if (!raw || typeof raw.username !== 'string' || typeof raw.wave !== 'number') continue;
        entries.push({
            rank: typeof raw.rank === 'number' ? raw.rank : entries.length + 1,
            username: raw.username,
            wave: raw.wave,
            achievedAt: typeof raw.achievedAt === 'number' ? raw.achievedAt : 0,
        });
    }

    let me: RemoteLeaderboard['me'] = null;
    if (data.me && typeof data.me === 'object' && typeof data.me.username === 'string') {
        me = {
            username: data.me.username,
            rank: typeof data.me.rank === 'number' ? data.me.rank : null,
            wave: typeof data.me.wave === 'number' ? data.me.wave : null,
        };
    }

    return { entries, me };
}

/** 仅供测试：清空内存中的会话与对局状态。 */
export function resetClientState(): void {
    session = null;
}
