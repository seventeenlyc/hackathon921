// LLM 代理路由的单元测试（issue #22）。
//
// 直接调 handleAgentDecide（无端口、无网络），provider 用假 fetch 替换。
// 重点覆盖安全属性：系统指令与玩家文本分离、会话准入、错误映射、不泄露 key。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ApiDeps, ApiRequest } from '../src/http';
import { LeaderboardStore } from '../src/store';
import { signToken } from '../src/token';
import {
    AGENT_SYSTEM_PROMPT,
    DEEPSEEK_URL,
    MAX_STRATEGY_LENGTH,
    composeAgentMessages,
    extractAgentActions,
    handleAgentDecide,
    mapProviderError,
    validateAgentRequest,
} from '../src/agent';

const T0 = 1_000_000;
const SECRET = 'agent-test-secret';

function makeDeps(over: Partial<ApiDeps> = {}): ApiDeps {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const store = new LeaderboardStore(db);
    store.migrate();
    return {
        store,
        secret: SECRET,
        now: () => T0,
        newRunId: () => 'run-1',
        agent: { apiKey: 'test-key' },
        ...over,
    };
}

function request(over: Partial<ApiRequest> = {}): ApiRequest {
    return {
        method: 'POST',
        pathname: '/api/agent/decide',
        searchParams: {},
        token: signToken(SECRET, 'Alice', T0),
        body: { strategy: 'hold the base', state: { wave: 3 } },
        ...over,
    };
}

function providerResponse(status: number, payload: any) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('validateAgentRequest 接受合法请求', () => {
    const result = validateAgentRequest({ strategy: 'build near base', state: { wave: 1 } });
    assert.equal(result.ok, true);
});

test('validateAgentRequest 接受恰好达到上限的策略', () => {
    // The agreed cap (docs/PRODUCT_CONCEPT.md §7); pinning it makes a silent
    // limit change a deliberate test edit.
    assert.equal(MAX_STRATEGY_LENGTH, 5000);
    const result = validateAgentRequest({ strategy: 'x'.repeat(MAX_STRATEGY_LENGTH), state: {} });
    assert.equal(result.ok, true);
});

test('validateAgentRequest 拒绝非法请求', () => {
    assert.equal((validateAgentRequest(null) as any).error, 'INVALID_REQUEST');
    assert.equal((validateAgentRequest([]) as any).error, 'INVALID_REQUEST');
    assert.equal((validateAgentRequest({ strategy: '   ', state: {} }) as any).error, 'EMPTY_STRATEGY');
    assert.equal(
        (validateAgentRequest({ strategy: 'x'.repeat(MAX_STRATEGY_LENGTH + 1), state: {} }) as any).error,
        'STRATEGY_TOO_LONG'
    );
    assert.equal((validateAgentRequest({ strategy: 'ok', state: null }) as any).error, 'INVALID_STATE');
    assert.equal((validateAgentRequest({ strategy: 'ok', state: [] }) as any).error, 'INVALID_STATE');
});

test('composeAgentMessages 不把玩家策略放进 system prompt', () => {
    const strategy = 'PRIORITIZE SLOWING FAST ENEMIES';
    const messages = composeAgentMessages(strategy, { wave: 3 });

    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[0].content, AGENT_SYSTEM_PROMPT);
    assert.ok(messages[0].content.indexOf(strategy) === -1, '策略不得泄漏进 system prompt');
    assert.equal(messages[1].role, 'user');
    assert.ok(messages[1].content.indexOf(strategy) !== -1);
    assert.ok(messages[1].content.indexOf('"wave":3') !== -1);
});

test('extractAgentActions 归一化工具调用、丢弃未知工具、限制数量', () => {
    const payload = {
        choices: [{
            message: {
                tool_calls: [
                    { function: { name: 'build_tower', arguments: '{"type":"canon","i":1,"j":2}' } },
                    { function: { name: 'delete_everything', arguments: '{}' } },
                    { function: { name: 'upgrade_tower', arguments: 'not json' } },
                    { function: { name: 'use_item', arguments: '{"item":"natural_oil"}' } },
                ],
            },
        }],
    };

    assert.deepEqual(extractAgentActions(payload), [
        { name: 'build_tower', arguments: { type: 'canon', i: 1, j: 2 } },
        { name: 'upgrade_tower', arguments: {} },
        { name: 'use_item', arguments: { item: 'natural_oil' } },
    ]);
});

test('extractAgentActions 在模型不调工具时返回空列表', () => {
    assert.deepEqual(extractAgentActions({ choices: [{ message: { content: 'I will wait.' } }] }), []);
    assert.deepEqual(extractAgentActions(undefined), []);
});

test('mapProviderError 把 provider 失败映射成可读错误码', () => {
    assert.equal(mapProviderError(401, {}).error, 'PROVIDER_AUTH_ERROR');
    assert.equal(mapProviderError(429, {}).error, 'PROVIDER_RATE_LIMITED');
    assert.equal(mapProviderError(503, {}).error, 'PROVIDER_UNAVAILABLE');
    assert.equal(mapProviderError(400, {}).error, 'PROVIDER_BAD_REQUEST');
});

test('无有效会话 token 时返回 401', async () => {
    const res = await handleAgentDecide(makeDeps(), request({ token: null }));
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'INVALID_SESSION');
});

test('未配置 key 时返回 503 而不是崩溃', async () => {
    const res = await handleAgentDecide(makeDeps({ agent: { apiKey: '' } }), request());
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'PROVIDER_NOT_CONFIGURED');
});

test('缺少 agent 配置时同样 503', async () => {
    const res = await handleAgentDecide(makeDeps({ agent: undefined }), request());
    assert.equal(res.status, 503);
});

test('请求非法时返回 400 且不调用 provider', async () => {
    let called = false;
    const deps = makeDeps({
        agent: { apiKey: 'k', fetchImpl: (async () => { called = true; return providerResponse(200, {}); }) as any },
    });
    const res = await handleAgentDecide(deps, request({ body: { strategy: '   ' } }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'EMPTY_STRATEGY');
    assert.equal(called, false);
});

test('成功时下发给 provider 的是服务端系统指令与工具 schema，返回归一化动作', async () => {
    let sent: any;
    const deps = makeDeps({
        agent: {
            apiKey: 'secret-key',
            fetchImpl: (async (url: string, init: any) => {
                sent = { url, init, body: JSON.parse(init.body) };
                return providerResponse(200, {
                    choices: [{ message: { tool_calls: [{ function: { name: 'build_tower', arguments: '{"type":"slow","i":4,"j":5}' } }] } }],
                    usage: { total_tokens: 321 },
                });
            }) as any,
        },
    });

    const res = await handleAgentDecide(deps, request());

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.actions, [{ name: 'build_tower', arguments: { type: 'slow', i: 4, j: 5 } }]);
    assert.deepEqual(res.body.usage, { total_tokens: 321 });

    assert.equal(sent.body.messages[0].role, 'system');
    assert.equal(sent.body.messages[0].content, AGENT_SYSTEM_PROMPT);
    assert.ok(sent.body.messages[0].content.indexOf('hold the base') === -1);
    assert.ok(sent.body.messages[1].content.indexOf('hold the base') !== -1);
    assert.equal(sent.body.model, 'deepseek-chat');
    assert.ok(Array.isArray(sent.body.tools) && sent.body.tools.length === 3);
    assert.ok(sent.body.tools.some((t: any) => t.function.name === 'use_item'));
    assert.equal(sent.init.headers.authorization, 'Bearer secret-key');
});

test('模型不调工具时返回空动作列表', async () => {
    const deps = makeDeps({
        agent: { apiKey: 'k', fetchImpl: (async () => providerResponse(200, { choices: [{ message: { content: 'wait' } }] })) as any },
    });
    const res = await handleAgentDecide(deps, request());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.actions, []);
});

test('provider 鉴权失败映射成 502，且响应体不含 key', async () => {
    const deps = makeDeps({
        agent: {
            apiKey: 'secret-key',
            fetchImpl: (async () => providerResponse(401, { error: { message: 'Authentication Fails' } })) as any,
        },
    });
    const res = await handleAgentDecide(deps, request());
    assert.equal(res.status, 502);
    assert.equal(res.body.error, 'PROVIDER_AUTH_ERROR');
    assert.ok(JSON.stringify(res.body).indexOf('secret-key') === -1);
});

test('provider 网络失败映射成 502 PROVIDER_UNAVAILABLE', async () => {
    const deps = makeDeps({
        agent: {
            apiKey: 'k',
            fetchImpl: (async () => {
                throw new Error('ECONNRESET');
            }) as any,
        },
    });
    const res = await handleAgentDecide(deps, request());
    assert.equal(res.status, 502);
    assert.equal(res.body.error, 'PROVIDER_UNAVAILABLE');
});

test('provider 端点与模型可由配置覆盖，baseUrl 末尾斜杠被归一', async () => {
    let sent: any;
    const deps = makeDeps({
        agent: {
            apiKey: 'test-key',
            baseUrl: 'https://relay.example.test/openai/v1/',
            model: 'Deepseek-v4-flash',
            fetchImpl: (async (url: string, init: any) => {
                sent = { url, body: JSON.parse(init.body) };
                return providerResponse(200, { choices: [{ message: { tool_calls: [] } }] });
            }) as any,
        },
    });

    const res = await handleAgentDecide(deps, request());

    assert.equal(res.status, 200);
    assert.equal(sent.url, 'https://relay.example.test/openai/v1/chat/completions');
    assert.equal(sent.body.model, 'Deepseek-v4-flash');
});

test('未配置端点与模型时仍走内置默认值', async () => {
    let sent: any;
    const deps = makeDeps({
        agent: {
            apiKey: 'test-key',
            fetchImpl: (async (url: string) => {
                sent = { url };
                return providerResponse(200, { choices: [{ message: { tool_calls: [] } }] });
            }) as any,
        },
    });

    await handleAgentDecide(deps, request());

    assert.equal(sent.url, DEEPSEEK_URL);
});
