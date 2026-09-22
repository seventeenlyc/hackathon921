// HTTP 路由层。刻意与 node:http 解耦：输入是一个普通对象，输出是 { status, body }，
// 因此可以在无网络、无端口的条件下直接单测全部路由与拒绝路径。
//
// 会话 token 只解决「谁在提交」；成绩真值来自 store 记录的对局证据（见 store.ts）。

import { LeaderboardStore } from './store';
import { signToken, verifyToken } from './token';
import { sanitizeLimit, sanitizeUsername, sanitizeWave } from './validate';

export interface ApiRequest {
    method: string;
    pathname: string;
    searchParams: Record<string, string>;
    token: string | null;
    body: unknown;
}

export interface ApiResponse {
    status: number;
    body: any;
}

export interface ApiDeps {
    store: LeaderboardStore;
    secret: string;
    now: () => number;
    newRunId: () => string;
}

const WAVE_PATH = /^\/api\/runs\/([^/]+)\/waves$/;

function json(status: number, body: any): ApiResponse {
    return { status, body };
}

function field(body: unknown, name: string): unknown {
    if (!body || typeof body !== 'object') return undefined;
    return (body as Record<string, unknown>)[name];
}

export function handleApi(deps: ApiDeps, req: ApiRequest): ApiResponse {
    const method = req.method.toUpperCase();

    // 供 nginx / 运维探活，不触碰数据库。
    if (req.pathname === '/api/health' && method === 'GET') {
        return json(200, { ok: true });
    }

    // 用昵称换一个签名会话 token。无注册、无密码（docs/PRODUCT_CONCEPT.md §14）。
    if (req.pathname === '/api/session' && method === 'POST') {
        const username = sanitizeUsername(field(req.body, 'username'));
        if (!username) return json(400, { error: 'INVALID_USERNAME' });
        return json(200, { token: signToken(deps.secret, username, deps.now()), username });
    }

    // 开一局：服务端签发对局会话，后续波次必须挂在它下面。
    if (req.pathname === '/api/runs' && method === 'POST') {
        const username = verifyToken(deps.secret, req.token, deps.now());
        if (!username) return json(401, { error: 'INVALID_SESSION' });
        const runId = deps.newRunId();
        deps.store.createRun(runId, username, deps.now());
        return json(201, { runId });
    }

    // 上报「到达第 N 波」。这是唯一的成绩来源。
    const waveMatch = WAVE_PATH.exec(req.pathname);
    if (waveMatch && method === 'POST') {
        const username = verifyToken(deps.secret, req.token, deps.now());
        if (!username) return json(401, { error: 'INVALID_SESSION' });

        const wave = sanitizeWave(field(req.body, 'wave'));
        if (wave == null) return json(400, { accepted: false, reason: 'WAVE_OUT_OF_RANGE' });

        const result = deps.store.recordWave(waveMatch[1], username, wave, deps.now());
        if (!result.accepted) {
            // 状态码让客户端能区分「这一局不能用了，重开」与「这条上报不合法」。
            const status =
                result.reason === 'RUN_NOT_FOUND' || result.reason === 'RUN_EXPIRED'
                    ? 404
                    : result.reason === 'USERNAME_MISMATCH'
                      ? 403
                      : 409;
            return json(status, { accepted: false, reason: result.reason });
        }
        return json(200, { accepted: true, bestWave: result.bestWave });
    }

    // 读取共享排行榜；带 token 时额外返回本人的名次。
    if (req.pathname === '/api/leaderboard' && method === 'GET') {
        const limit = sanitizeLimit(req.searchParams.limit);
        const entries = deps.store.top(limit).map((entry, index) => ({
            rank: index + 1,
            username: entry.username,
            wave: entry.wave,
            achievedAt: entry.achievedAt,
        }));

        let me: any = null;
        const viewer = verifyToken(deps.secret, req.token, deps.now());
        if (viewer) {
            me = {
                username: viewer,
                rank: deps.store.rankOf(viewer),
                wave: deps.store.bestWaveOf(viewer),
            };
        }
        return json(200, { entries, me });
    }

    return json(404, { error: 'NOT_FOUND' });
}
