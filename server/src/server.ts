// HTTP 服务器的组装。与「启动」（监听端口、版本自检）分离，
// 测试因此可以 listen(0) 拿到随机端口做真实的端到端验证。

import { createServer } from 'node:http';
import { ApiDeps, ApiRequest, handleApi } from './http';
import { handleAgentDecide } from './agent';
import { extractToken, readJsonBody, splitPath, MAX_AGENT_BODY_BYTES, MAX_PROMPT_BODY_BYTES } from './transport';

/** 代理端点：异步（要等 provider），因此不走同步的 handleApi。 */
const AGENT_DECIDE_PATH = '/api/agent/decide';
const PROMPT_WRITE_PATH = /^\/api\/runs\/[^/]+\/prompts$/;

export function createApiServer(deps: ApiDeps): any {
    const server = createServer((req: any, res: any) => {
        void handle(req, res);
    });

    async function handle(req: any, res: any): Promise<void> {
        const url = String(req.url || '/');
        const method = String(req.method || 'GET').toUpperCase();
        const { pathname, searchParams } = splitPath(url);

        let result;
        try {
            const apiRequest: ApiRequest = {
                method,
                pathname,
                searchParams,
                token: extractToken(req.headers),
                body: method === 'POST'
                    ? await readJsonBody(
                        req,
                        pathname === AGENT_DECIDE_PATH
                            ? MAX_AGENT_BODY_BYTES
                            : PROMPT_WRITE_PATH.test(pathname)
                              ? MAX_PROMPT_BODY_BYTES
                              : undefined
                    )
                    : null,
            };
            result = pathname === AGENT_DECIDE_PATH
                ? await handleAgentDecide(deps, apiRequest)
                : handleApi(deps, apiRequest);
        } catch (e) {
            console.error('请求处理失败', e);
            result = { status: 500, body: { error: 'INTERNAL_ERROR' } };
        }

        res.statusCode = result.status;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify(result.body));
    }

    return server;
}
