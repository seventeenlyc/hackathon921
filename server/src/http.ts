// HTTP 路由层。刻意与 node:http 解耦：输入是一个普通对象，输出是 { status, body }，
// 因此可以在无网络、无端口的条件下直接单测全部路由与拒绝路径。
//
// 会话 token 只解决「谁在提交」；成绩真值来自 store 记录的对局证据（见 store.ts）。

import { LeaderboardStore } from './store';
import { signToken, verifyToken } from './token';
import { sanitizeLimit, sanitizeUsername, sanitizeWave } from './validate';
import { MAX_STRATEGY_LENGTH } from './agent';
import type { AgentConfig } from './agent';
import type { GameHost } from './game/host';

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
    /** 服务端托管对局（阶段 C）。缺失时 /api/games* 返回 503，排行榜不受影响。 */
    games?: GameHost;
}

const WAVE_PATH = /^\/api\/runs\/([^/]+)\/waves$/;
const GAME_PATH = /^\/api\/games\/([^/]+)$/;
const GAME_ACTION_PATH = /^\/api\/games\/([^/]+)\/(start|pause|resume|speed|strategy|lanes|actions)$/;
const GAME_SPEEDS = [1, 2, 4, 8];

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
    // providerConfigured 让运维不必翻 journal 就能判断 LLM 代理是否拿到 key（issue #22 的接口约定）。
    // 排行榜不依赖它：缺 key 时这里仍是 { ok: true }，只有 /api/agent/decide 返回 503。
    if (req.pathname === '/api/health' && method === 'GET') {
        return json(200, { ok: true, providerConfigured: Boolean(deps.agent && deps.agent.apiKey) });
    }

    // 用昵称换一个签名会话 token。无注册、无密码（docs/PRODUCT_CONCEPT.md §14）。
    if (req.pathname === '/api/session' && method === 'POST') {
        const username = sanitizeUsername(field(req.body, 'username'));
        if (!username) return json(400, { error: 'INVALID_USERNAME' });
        return json(200, { token: signToken(deps.secret, username, deps.now()), username });
    }

    // 匿名会话（人类模式用）：人类模式没有昵称门禁，但托管对局仍需一个归属凭证。
    // 主体由服务端随机生成，昵称从不作为凭证（docs/PRODUCT_CONCEPT.md §4）。
    if (req.pathname === '/api/sessions/anonymous' && method === 'POST') {
        // The subject must pass `verifyToken`'s `sanitizeUsername` check (<=16 chars),
        // so take a short slice of the random id rather than all of it.
        const subject = 'anon-' + deps.newRunId().slice(0, 8);
        return json(200, { token: signToken(deps.secret, subject, deps.now()), username: subject });
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

    // ---- 服务端托管对局（阶段 C）----
    // 浏览器只发「意图」，真值在服务端：建塔合法性、金币、波次都由引擎判定与产生。
    if (req.pathname === '/api/games' && method === 'POST') {
        const username = verifyToken(deps.secret, req.token, deps.now());
        if (!username) return json(401, { error: 'INVALID_SESSION' });
        if (!deps.games) return json(503, { error: 'GAMES_UNAVAILABLE' });

        const rawMode = field(req.body, 'mode');
        const mode = rawMode === undefined ? 'ai' : String(rawMode);
        if (mode !== 'ai' && mode !== 'human') return json(400, { error: 'INVALID_MODE' });

        let difficulty: number | undefined;
        const rawDifficulty = field(req.body, 'difficulty');
        if (rawDifficulty !== undefined) {
            const parsed = Number(rawDifficulty);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
                return json(400, { error: 'INVALID_DIFFICULTY' });
            }
            difficulty = parsed;
        }

        const game = deps.games.create(username, { mode, difficulty });
        return json(201, deps.games.summary(game));
    }

    const gameAction = GAME_ACTION_PATH.exec(req.pathname);
    if (gameAction) {
        const username = verifyToken(deps.secret, req.token, deps.now());
        if (!username) return json(401, { error: 'INVALID_SESSION' });
        if (!deps.games) return json(503, { error: 'GAMES_UNAVAILABLE' });
        if (method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

        const game = deps.games.get(gameAction[1]);
        if (!game) return json(404, { error: 'GAME_NOT_FOUND' });
        // 昵称只用于展示与排名聚合，绝不作为控制某局的凭证：归属看会话 token。
        if (game.username !== username) return json(403, { error: 'GAME_FORBIDDEN' });

        const verb = gameAction[2];

        // 指令幂等（§5）：重复的 commandId 返回首次结果，避免重试导致重复开局或重复扣费。
        const rawCommandId = field(req.body, 'commandId');
        const commandId = typeof rawCommandId === 'string' && rawCommandId.length > 0 ? rawCommandId : null;
        const cached = game.commandResult(commandId);
        if (cached.hit) return json(200, cached.result);

        const respond = (response: ApiResponse): ApiResponse => {
            if (commandId && response.status < 400) game.rememberCommand(commandId, response.body);
            return response;
        };

        if (verb === 'start') {
            if (!game.isOver) {
                game.start();
                deps.games.startDriver(game.id);
            }
            return respond(json(200, deps.games.summary(game)));
        }
        if (verb === 'pause') {
            game.pause();
            return respond(json(200, deps.games.summary(game)));
        }
        if (verb === 'resume') {
            game.resume();
            return respond(json(200, deps.games.summary(game)));
        }
        if (verb === 'speed') {
            const speed = Number(field(req.body, 'speed'));
            if (GAME_SPEEDS.indexOf(speed) === -1) return json(400, { error: 'INVALID_SPEED' });
            game.setSpeed(speed as 1 | 2 | 4 | 8);
            return respond(json(200, deps.games.summary(game)));
        }
        if (verb === 'strategy') {
            const text = field(req.body, 'text');
            if (typeof text !== 'string' || text.trim() === '') {
                return json(400, { error: 'EMPTY_STRATEGY' });
            }
            if (text.length > MAX_STRATEGY_LENGTH) {
                return json(400, { error: 'STRATEGY_TOO_LONG' });
            }
            const version = game.submitStrategy(text);
            return respond(json(200, { accepted: true, version: version.version, effectiveWave: version.fromWave }));
        }
        if (verb === 'lanes') {
            const count = Number(field(req.body, 'count'));
            if (!Number.isInteger(count)) return json(400, { error: 'INVALID_LANE_COUNT' });
            const requested = game.requestSpawnCount(count);
            return respond(json(200, {
                accepted: true,
                requested,
                appliedLanes: game.engine.map.enemyBases.length,
            }));
        }
        if (verb === 'actions') {
            // AI 模式禁止浏览器直接提交建塔指令（docs/PRODUCT_CONCEPT.md §2）；只有人类模式允许。
            if (game.mode !== 'human') return json(403, { error: 'AI_MODE_ACTIONS_FORBIDDEN' });

            const action = field(req.body, 'action');
            if (action === 'build_tower') {
                const type = field(req.body, 'type');
                if (typeof type !== 'string') return json(400, { error: 'INVALID_ACTION' });
                const result = game.actions.buildTower(type, Number(field(req.body, 'i')), Number(field(req.body, 'j')));
                return respond(json(result.ok ? 200 : 409, result));
            }
            if (action === 'upgrade_tower') {
                const id = field(req.body, 'id');
                if (typeof id !== 'string') return json(400, { error: 'INVALID_ACTION' });
                const result = game.actions.upgradeTower(id);
                return respond(json(result.ok ? 200 : 409, result));
            }
            return respond(json(400, { error: 'UNKNOWN_ACTION' }));
        }

        return json(404, { error: 'NOT_FOUND' });
    }

    const gameMatch = GAME_PATH.exec(req.pathname);
    if (gameMatch && method === 'GET') {
        const username = verifyToken(deps.secret, req.token, deps.now());
        if (!username) return json(401, { error: 'INVALID_SESSION' });
        if (!deps.games) return json(503, { error: 'GAMES_UNAVAILABLE' });

        const game = deps.games.get(gameMatch[1]);
        if (!game) return json(404, { error: 'GAME_NOT_FOUND' });
        if (game.username !== username) return json(403, { error: 'GAME_FORBIDDEN' });

        return json(200, { ...deps.games.summary(game), snapshot: game.snapshot() });
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
