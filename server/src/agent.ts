// LLM 代理：把「玩家策略 + 战场快照」变成塔防动作（issue #22）。
//
// 为什么在服务端：key 不能进前端，且国内浏览器直连不了 provider，只有服务器能到
// （docs/PRODUCT_CONCEPT.md §14）。
//
// 为什么不是哑管道：**系统指令与工具 schema 由服务端持有**，前端只发 strategy + state，
// 既看不到也覆盖不了 system prompt（AGENTS.md：系统指令与玩家 Prompt 必须分离传递）。
//
// 复用排行榜后端的会话 token 做准入，避免这个带 key 的端点被人随意刷成本。
// 纯逻辑（校验 / 拼装 / 归一化 / 错误映射）与 provider 调用分离，因此可无网络单测。

import type { ApiDeps, ApiRequest, ApiResponse } from './http';
import { verifyToken } from './token';
import { MAX_STRATEGY_LENGTH } from './validate';
export { MAX_STRATEGY_LENGTH } from './validate';

/**
 * Provider 端点是可配置的：默认仍是 DeepSeek 官方端点，但可以整体换成任何 OpenAI
 * 兼容端点（例如国内中转）而不改代码 —— 这类端点只有基址和模型名不同，协议面一致。
 *
 * 约定：baseUrl 填到 OpenAI 兼容前缀为止（`https://api.deepseek.com` 或
 * `https://<host>/openai/v1`），请求路径由本模块拼 COMPLETIONS_PATH，因此不会出现
 * 「填了完整 completions URL 又被拼一次」的问题。
 */
export const DEFAULT_PROVIDER_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_PROVIDER_MODEL = 'deepseek-chat';
export const COMPLETIONS_PATH = '/chat/completions';

/** 保留原常量名：语义 = 默认端点的完整 completions URL（测试与日志仍在用）。 */
export const DEEPSEEK_URL = `${DEFAULT_PROVIDER_BASE_URL}${COMPLETIONS_PATH}`;
export const DEEPSEEK_MODEL = DEFAULT_PROVIDER_MODEL;

/** 拼出 completions URL；容忍 baseUrl 末尾多余的斜杠（`…/v1/`）。 */
export function completionsUrl(baseUrl: string): string {
    return `${String(baseUrl).trim().replace(/\/+$/, '')}${COMPLETIONS_PATH}`;
}
/**
 * Player-strategy character cap. Raised from 2000 to 5000 (2026-09-22): real
 * multi-rule strategies routinely exceeded the old limit. This is the
 * authoritative value; the browser mirrors it only to warn early
 * (`src/agent/StrategyLimits.ts`) and never truncates.
 */
export const MAX_ACTIONS_PER_DECISION = 8;
export const PROVIDER_TIMEOUT_MS = 12000;

const TOWER_TYPES = ['canon', 'gatling', 'slow', 'sniper', 'laser'];

/** 提供方响应中我们真正用到的最小面；测试用假实现替换，无需网络。 */
export interface ProviderResponse {
    ok: boolean;
    status: number;
    json: () => Promise<any>;
}

export interface FetchLike {
    (url: string, init: {
        method: string;
        headers: Record<string, string>;
        body: string;
        signal?: any;
    }): Promise<ProviderResponse>;
}

export interface AgentConfig {
    /** 为空表示未配置：接口返回 503 而不是崩溃。 */
    apiKey: string;
    /** OpenAI 兼容端点前缀；缺省用 DEFAULT_PROVIDER_BASE_URL。 */
    baseUrl?: string;
    /** 模型名；缺省用 DEFAULT_PROVIDER_MODEL。 */
    model?: string;
    /** 仅测试注入；生产走全局 fetch。 */
    fetchImpl?: FetchLike;
    timeoutMs?: number;
}

export interface AgentAction {
    name: string;
    arguments: Record<string, unknown>;
}

/**
 * 工具 schema 是服务端契约的一部分：客户端不发它，被篡改的客户端也无法扩大模型能做的事。
 */
export const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'build_tower',
            description: 'Build a tower on an empty grid cell. The engine rejects occupied cells and placements that would block every enemy path; building on the enemy route is allowed whenever another path to the base remains, which reroutes enemies.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: TOWER_TYPES, description: 'Tower type.' },
                    i: { type: 'integer', description: 'Grid column index.' },
                    j: { type: 'integer', description: 'Grid row index.' },
                },
                required: ['type', 'i', 'j'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'upgrade_tower',
            description: 'Upgrade an existing tower, referenced by the id from the state snapshot.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Tower id, formatted "i:j".' },
                },
                required: ['id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'use_item',
            description: 'Use a tactical battle item. Currently available: "natural_oil" (costs 2000 cash, grants all towers 1.5x attack speed for 5s, 10s cooldown).',
            parameters: {
                type: 'object',
                properties: {
                    item: {
                        type: 'string',
                        enum: ['natural_oil'],
                        description: 'Identifier of the item to activate.',
                    },
                },
                required: ['item'],
            },
        },
    },
];

const AGENT_TOOL_NAMES = AGENT_TOOLS.map(tool => tool.function.name);

export const AGENT_SYSTEM_PROMPT = [
    'You are the autonomous player of an endless tower-defense game. A human wrote',
    'a strategy in the user message, and your job is to execute THAT strategy. It is',
    'the mission and it overrides every default preference below. Do not invent',
    'goals the player did not ask for; when the strategy is silent, use the',
    'defaults.',
    '',
    'Rules:',
    '- You affect the battlefield ONLY by calling the provided tools. You cannot',
    '  move enemies or edit the game state directly.',
    '- You are called once at each wave boundary, before the next wave spawns.',
    '  Decide what to build or upgrade now.',
    '- The engine validates every action and may reject it (not enough cash,',
    '  occupied cell, would block the path). If an action is rejected, adapt',
    '  instead of repeating the same call.',
    '- You may return zero, one, or several tool calls. Prefer a few high-value',
    '  actions over many.',
    '- Grid coordinates are (i, j) = (column, row). Any free cell is legal; the',
    '  candidates in the state are suggestions, not the only cells you may use.',
    '- `buildCandidates` are cells beside the route that cover enemy traffic. Use',
    '  them when the strategy is about damage, coverage or defending lanes.',
    '- `pathShapingCandidates` are cells ON the current route whose placement adds',
    '  `addedTiles` to the walk. Use them when the strategy asks to slow enemies by',
    '  making them travel farther (a maze, spiral, snake, detour or choke point).',
    '  Building on the route is allowed: the engine reroutes enemies and rejects',
    '  only a placement that would seal every spawn off (BLOCKS_PATH). One wall',
    '  adds only a few tiles, so keep extending the detour over several waves.',
    '- Enemies can spawn from several lanes; the state lists them in `lanes` and',
    '  `spawns`, and each candidate says which lane it is for. Unless the player',
    '  strategy says otherwise, cover every lane rather than piling up on one.',
    '- You can use tactical battle items via `use_item`. Currently available:',
    '  `natural_oil`, which costs 2000 cash and grants all towers 1.5x attack speed',
    '  for 5 seconds (10s cooldown). Use it when facing dense waves, boss enemies,',
    '  or urgent threats where burst damage is critical, provided you have enough cash',
    '  and it is not on cooldown.',
    '- Return tool calls only. Do not explain.',
].join('\n');

export interface AgentValidationOk {
    ok: true;
    value: { strategy: string; state: Record<string, unknown> };
}

export interface AgentValidationError {
    ok: false;
    error: string;
    message: string;
}

export function validateAgentRequest(body: unknown): AgentValidationOk | AgentValidationError {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'INVALID_REQUEST', message: 'Body must be a JSON object.' };
    }

    const strategy = (body as Record<string, unknown>).strategy;
    const state = (body as Record<string, unknown>).state;

    if (typeof strategy !== 'string' || strategy.trim() === '') {
        return { ok: false, error: 'EMPTY_STRATEGY', message: 'A non-empty strategy string is required.' };
    }

    if (strategy.length > MAX_STRATEGY_LENGTH) {
        return {
            ok: false,
            error: 'STRATEGY_TOO_LONG',
            message: `Strategy is ${strategy.length} characters; the limit is ${MAX_STRATEGY_LENGTH}.`,
        };
    }

    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        return { ok: false, error: 'INVALID_STATE', message: 'A game state snapshot object is required.' };
    }

    return { ok: true, value: { strategy, state: state as Record<string, unknown> } };
}

/**
 * 玩家策略只进 user message，绝不拼进 system prompt —— 这是安全属性，不是风格选择。
 */
export function composeAgentMessages(strategy: string, state: unknown): any[] {
    return [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        {
            role: 'user',
            content: `Battlefield state (JSON):\n${JSON.stringify(state)}\n\nPlayer strategy:\n${strategy}`,
        },
    ];
}

function parseArguments(raw: unknown): Record<string, unknown> {
    if (raw === undefined || raw === null || raw === '') return {};
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }
    return {};
}

/** 把 provider 的 tool calls 归一化成运行时消费的形状；未知工具名丢弃。 */
export function extractAgentActions(payload: any): AgentAction[] {
    const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : undefined;
    const message = choice && choice.message;
    const calls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];

    return calls
        .slice(0, MAX_ACTIONS_PER_DECISION)
        .map((call: any) => {
            const fn = call && call.function;
            return { name: fn && fn.name, arguments: parseArguments(fn && fn.arguments) };
        })
        .filter((action: any) => typeof action.name === 'string' && AGENT_TOOL_NAMES.indexOf(action.name) !== -1);
}

export function mapProviderError(status: number, payload: any): { error: string; message: string } {
    const detail =
        payload && payload.error && typeof payload.error.message === 'string'
            ? payload.error.message
            : `Provider returned HTTP ${status}.`;

    if (status === 401 || status === 403) {
        return { error: 'PROVIDER_AUTH_ERROR', message: 'The configured LLM provider key was rejected.' };
    }
    if (status === 429) {
        return { error: 'PROVIDER_RATE_LIMITED', message: 'The LLM provider is rate limiting this server.' };
    }
    if (status >= 500) {
        return { error: 'PROVIDER_UNAVAILABLE', message: detail };
    }
    return { error: 'PROVIDER_BAD_REQUEST', message: detail };
}

async function callProvider(
    config: AgentConfig,
    messages: any[]
): Promise<{ ok: true; payload: any } | { ok: false; error: string; message: string }> {
    const fetchImpl = (config.fetchImpl || (fetch as unknown as FetchLike));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || PROVIDER_TIMEOUT_MS);

    let response: ProviderResponse;
    try {
        response = await fetchImpl(completionsUrl(config.baseUrl || DEFAULT_PROVIDER_BASE_URL), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model || DEFAULT_PROVIDER_MODEL,
                messages,
                tools: AGENT_TOOLS,
                tool_choice: 'auto',
                temperature: 0.2,
                max_tokens: 900,
            }),
            signal: controller.signal,
        });
    } catch (e) {
        const aborted = e && (e as any).name === 'AbortError';
        return {
            ok: false,
            error: aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
            message: aborted
                ? `The LLM provider did not answer within ${config.timeoutMs || PROVIDER_TIMEOUT_MS}ms.`
                : 'The server could not reach the LLM provider.',
        };
    } finally {
        clearTimeout(timeout);
    }

    let payload: any;
    try {
        payload = await response.json();
    } catch (e) {
        payload = undefined;
    }

    if (!response.ok) {
        const mapped = mapProviderError(response.status, payload);
        return { ok: false, error: mapped.error, message: mapped.message };
    }

    return { ok: true, payload };
}

/**
 * `POST /api/agent/decide` 的处理：需要有效会话 token，失败一律结构化返回，
 * 由前端运行时 fail closed（不下动作、下一波照常开始）。
 */
export async function handleAgentDecide(deps: ApiDeps, req: ApiRequest): Promise<ApiResponse> {
    const username = verifyToken(deps.secret, req.token, deps.now());
    if (!username) {
        return {
            status: 401,
            body: { error: 'INVALID_SESSION', message: 'A valid session is required before the AI can act.' },
        };
    }

    const agent = deps.agent;

    const validation = validateAgentRequest(req.body);
    if (!validation.ok) {
        return { status: 400, body: { error: validation.error, message: validation.message } };
    }

    if (!agent || !agent.apiKey) {
        return {
            status: 503,
            body: {
                error: 'PROVIDER_NOT_CONFIGURED',
                message: 'The server has no DEEPSEEK_API_KEY configured, so the AI cannot act yet.',
            },
        };
    }

    const { strategy, state } = validation.value;
    const result = await callProvider(agent, composeAgentMessages(strategy, state));
    if (!result.ok) {
        return { status: 502, body: { error: result.error, message: result.message } };
    }

    const actions = extractAgentActions(result.payload);
    const usage = result.payload && result.payload.usage ? result.payload.usage : undefined;
    return { status: 200, body: { ok: true, actions, usage } };
}
