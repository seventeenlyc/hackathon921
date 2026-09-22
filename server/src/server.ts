// HTTP 服务器的组装。与「启动」（监听端口、版本自检）分离，
// 测试因此可以 listen(0) 拿到随机端口做真实的端到端验证。

import { createServer } from 'node:http';
import { ApiDeps, handleApi } from './http';
import { extractToken, readJsonBody, splitPath } from './transport';

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
            result = handleApi(deps, {
                method,
                pathname,
                searchParams,
                token: extractToken(req.headers),
                body: method === 'POST' ? await readJsonBody(req) : null,
            });
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
