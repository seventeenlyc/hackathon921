// HTTP 路由层。刻意与 node:http 解耦：输入是一个普通对象，输出是 { status, body }，
// 因此可以在无网络、无端口的条件下直接单测全部路由与拒绝路径。
//
// 会话 token 只解决「谁在提交」；成绩真值来自 store 记录的对局证据（见 store.ts）。

import { createHash, timingSafeEqual } from 'node:crypto';
import { LeaderboardStore } from './store';
import { signToken, verifyToken } from './token';
import { sanitizeAvatarId, sanitizeLeaderboardMode, sanitizeLimit, sanitizeRunMode, sanitizeUsername, sanitizeWave } from './validate';
import type { AgentConfig } from './agent';
import { MAX_PROMPT_LENGTH } from './prompts';

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
    /** LLM 代理配置（issue #22）。缺失时 /api/agent/decide 返回 503，不崩。 */
    agent?: AgentConfig;
    /** Optional demo-only passphrase; absent means fail closed. Never put it in browser code. */
    devPassword?: string;
}

const WAVE_PATH = /^\/api\/runs\/([^/]+)\/waves$/;
const PROMPT_WRITE_PATH = /^\/api\/runs\/([^/]+)\/prompts$/;
const PROMPT_HISTORY_PATH = /^\/api\/leaderboard\/(\d+)\/prompts$/;

function json(status: number, body: any): ApiResponse {
    return { status, body };
}

function field(body: unknown, name: string): unknown {
    if (!body || typeof body !== 'object') return undefined;
    return (body as Record<string, unknown>)[name];
}

function matchesDevPassword(expected: string, candidate: string): boolean {
    const digest = (text: string) => createHash('sha256').update(text).digest();
    return timingSafeEqual(digest(expected), digest(candidate));
}

export function handleApi(deps: ApiDeps, req: ApiRequest): ApiResponse {
    const method = req.method.toUpperCase();

    // 供 nginx / 运维探活，不触碰数据库。
    // providerConfigured 让运维不必翻 journal 就能判断 LLM 代理是否拿到 key（issue #22 的接口约定）。
    // 排行榜不依赖它：缺 key 时这里仍是 { ok: true }，只有 /api/agent/decide 返回 503。
    if (req.pathname === '/api/health' && method === 'GET') {
        return json(200, { ok: true, providerConfigured: Boolean(deps.agent && deps.agent.apiKey) });
    }

    // 每次确认资料时创建全新的 UID；昵称和头像只作展示资料。
    if (req.pathname === '/api/session' && method === 'POST') {
        const username = sanitizeUsername(field(req.body, 'username'));
        if (!username) return json(400, { error: 'INVALID_USERNAME' });
        const avatarId = sanitizeAvatarId(field(req.body, 'avatarId'));
        if (!avatarId) return json(400, { error: 'INVALID_AVATAR' });
        const now = deps.now();
        const uid = deps.store.createUser(username, avatarId, now);
        return json(200, { token: signToken(deps.secret, uid, now), username });
    }

    // Demo 权限只对这个页面会话 UID 生效；数据库保证即使客户端伪造请求也不能开计榜对局。
    if (req.pathname === '/api/dev/unlock' && method === 'POST') {
        if (!deps.devPassword) return json(503, { error: 'DEV_MODE_UNAVAILABLE' });
        const uid = verifyToken(deps.secret, req.token, deps.now());
        if (!uid || !deps.store.getUser(uid)) return json(401, { error: 'INVALID_SESSION' });
        const password = field(req.body, 'password');
        if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
            return json(400, { error: 'INVALID_PASSWORD' });
        }
        if (!matchesDevPassword(deps.devPassword, password)) return json(401, { error: 'INVALID_PASSWORD' });
        if (!deps.store.enableDevSession(uid)) return json(409, { error: 'RUN_ALREADY_STARTED' });
        return json(200, { enabled: true });
    }

    // 开一局：服务端签发对局会话，后续波次必须挂在它下面。
    if (req.pathname === '/api/runs' && method === 'POST') {
        const uid = verifyToken(deps.secret, req.token, deps.now());
        if (!uid || !deps.store.getUser(uid)) return json(401, { error: 'INVALID_SESSION' });
        if (deps.store.isDevSession(uid)) return json(403, { error: 'DEV_SESSION_UNRANKED' });
        const rawMode = field(req.body, 'mode');
        const mode = sanitizeRunMode(rawMode);
        if (!mode) return json(400, { error: 'INVALID_MODE' });
        const runId = deps.newRunId();
        deps.store.createRun(runId, uid, deps.now(), mode);
        return json(201, { runId });
    }

    // 上报「到达第 N 波」。这是唯一的成绩来源。
    const waveMatch = WAVE_PATH.exec(req.pathname);
    if (waveMatch && method === 'POST') {
        const uid = verifyToken(deps.secret, req.token, deps.now());
        if (!uid || !deps.store.getUser(uid)) return json(401, { error: 'INVALID_SESSION' });

        const wave = sanitizeWave(field(req.body, 'wave'));
        if (wave == null) return json(400, { accepted: false, reason: 'WAVE_OUT_OF_RANGE' });

        const result = deps.store.recordWave(waveMatch[1], uid, wave, deps.now());
        if (!result.accepted) {
            // 状态码让客户端能区分「这一局不能用了，重开」与「这条上报不合法」。
            const status =
                result.reason === 'RUN_NOT_FOUND' || result.reason === 'RUN_EXPIRED'
                    ? 404
                    : result.reason === 'UID_MISMATCH'
                      ? 403
                      : 409;
            return json(status, { accepted: false, reason: result.reason });
        }
        return json(200, { accepted: true, bestWave: result.bestWave });
    }

    // Store only versions that the client reports after StrategyStore.lock().
    const promptWriteMatch = PROMPT_WRITE_PATH.exec(req.pathname);
    if (promptWriteMatch && method === 'POST') {
        const uid = verifyToken(deps.secret, req.token, deps.now());
        if (!uid || !deps.store.getUser(uid)) return json(401, { error: 'INVALID_SESSION' });

        const version = field(req.body, 'version');
        const prompt = field(req.body, 'prompt');
        const fromWave = field(req.body, 'fromWave');
        if (!Number.isInteger(version) || (version as number) < 1) {
            return json(400, { recorded: false, reason: 'PROMPT_VERSION_INVALID' });
        }
        if (typeof prompt !== 'string' || prompt.trim() === '' || prompt.length > MAX_PROMPT_LENGTH) {
            return json(400, { recorded: false, reason: 'PROMPT_INVALID' });
        }
        const safeWave = sanitizeWave(fromWave);
        if (safeWave == null) return json(400, { recorded: false, reason: 'PROMPT_WAVE_INVALID' });

        const result = deps.store.recordPrompt(
            promptWriteMatch[1],
            uid,
            { version: version as number, prompt, fromWave: safeWave },
            deps.now()
        );
        if (result.recorded) return json(200, result);
        const status =
            result.reason === 'RUN_NOT_FOUND' || result.reason === 'RUN_EXPIRED'
                ? 404
                : result.reason === 'UID_MISMATCH'
                  ? 403
                  : result.reason.startsWith('PROMPT_VERSION_') || result.reason === 'PROMPT_WAVE_BEHIND'
                    ? 409
                    : 400;
        return json(status, result);
    }

    // Prompt history is public by design, but only for the server-selected best run.
    const promptHistoryMatch = PROMPT_HISTORY_PATH.exec(req.pathname);
    if (promptHistoryMatch && method === 'GET') {
        const uid = Number(promptHistoryMatch[1]);
        if (!Number.isSafeInteger(uid) || uid < 1) return json(400, { error: 'INVALID_UID' });
        if (!deps.store.getUser(uid)) return json(404, { error: 'USER_NOT_FOUND' });
        return json(200, deps.store.bestRunPrompts(uid));
    }

    // 读取共享排行榜；带 token 时额外返回本人的名次。
    if (req.pathname === '/api/leaderboard' && method === 'GET') {
        const mode = sanitizeLeaderboardMode(req.searchParams.mode);
        if (!mode) return json(400, { error: 'INVALID_MODE' });
        const limit = sanitizeLimit(req.searchParams.limit);
        const entries = deps.store.top(limit, mode).map((entry, index) => ({
            rank: index + 1,
            uid: entry.uid,
            username: entry.username,
            avatarId: entry.avatarId,
            wave: entry.wave,
            achievedAt: entry.achievedAt,
            mode: entry.mode,
        }));

        let me: any = null;
        const viewerUid = verifyToken(deps.secret, req.token, deps.now());
        const viewer = viewerUid ? deps.store.getUser(viewerUid) : null;
        if (viewer) {
            if (mode === 'total') {
                const totalRank = deps.store.rankOf(viewer.uid, 'total');
                const best = deps.store.bestRecordOf(viewer.uid);
                me = {
                    uid: viewer.uid,
                    username: viewer.username,
                    avatarId: viewer.avatarId,
                    rank: totalRank,
                    wave: best ? best.wave : null,
                    mode: best ? best.mode : 'ai',
                };
            } else {
                me = {
                    uid: viewer.uid,
                    username: viewer.username,
                    avatarId: viewer.avatarId,
                    rank: deps.store.rankOf(viewer.uid, mode),
                    wave: deps.store.bestWaveOf(viewer.uid, mode),
                    mode,
                };
            }
        }
        return json(200, { entries, me });
    }

    return json(404, { error: 'NOT_FOUND' });
}
