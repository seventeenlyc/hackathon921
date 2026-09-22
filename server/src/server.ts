// HTTP 服务器的组装。与「启动」（监听端口、版本自检）分离，
// 测试因此可以 listen(0) 拿到随机端口做真实的端到端验证。

import { createServer } from 'node:http';
import { ApiDeps, ApiRequest, handleApi } from './http';
import { handleAgentDecide } from './agent';
import { verifyToken } from './token';
import { extractToken, readJsonBody, splitPath, MAX_AGENT_BODY_BYTES } from './transport';

/** 代理端点：异步（要等 provider），因此不走同步的 handleApi。 */
const AGENT_DECIDE_PATH = '/api/agent/decide';

/** SSE 状态流：GET /api/games/:id/stream */
const GAME_STREAM_PATH = /^\/api\/games\/([^/]+)\/stream$/;

/**
 * 渲染快照的推送频率。先按 10 次/秒起步（docs/PRODUCT_CONCEPT.md §5），由浏览器
 * 按自身刷新率插值。慢连接只保留最新画面：上一次 write 未排空就跳过这一帧。
 */
const STREAM_INTERVAL_MS = 100;

function writeJson(res: any, status: number, body: any): void {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(body));
}

/**
 * 处理托管对局的 SSE 状态流；不是这个路由时返回 false，交给普通 JSON 路由。
 *
 * EventSource 不能自定义请求头，所以 token 允许走查询参数；同时也接受
 * Authorization 头，方便用 fetch 读取流。
 */
function handleGameStream(
    deps: ApiDeps,
    req: any,
    res: any,
    pathname: string,
    searchParams: Record<string, string>
): boolean {
    const match = GAME_STREAM_PATH.exec(pathname);
    if (!match) return false;

    const token = extractToken(req.headers) || searchParams.token || null;
    const username = verifyToken(deps.secret, token, deps.now());
    if (!username) {
        writeJson(res, 401, { error: 'INVALID_SESSION' });
        return true;
    }
    if (!deps.games) {
        writeJson(res, 503, { error: 'GAMES_UNAVAILABLE' });
        return true;
    }

    const game = deps.games.get(match[1]);
    if (!game) {
        writeJson(res, 404, { error: 'GAME_NOT_FOUND' });
        return true;
    }
    if (game.username !== username) {
        writeJson(res, 403, { error: 'GAME_FORBIDDEN' });
        return true;
    }

    // 连接即视为「在线」：断开后由 GameHost 启动宽限计时（§4）。
    deps.games.clientConnected(game.id);

    res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
    });

    const send = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let closed = false;
    let backpressured = false;

    const onDrain = () => {
        backpressured = false;
    };
    res.on('drain', onDrain);

    const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        if (typeof res.removeListener === 'function') res.removeListener('drain', onDrain);
        res.end();
        deps.games!.clientDisconnected(game.id);
    };

    // First frame immediately so a fresh tab has something to draw.
    send('snapshot', game.renderSnapshot());

    const timer = setInterval(() => {
        if (closed) return;
        if (game.isOver) {
            send('snapshot', game.renderSnapshot());
            send('over', deps.games!.summary(game));
            cleanup();
            return;
        }
        // 队列里还有没发出去的帧时不排队：丢弃这一帧，等 drain 再继续。
        if (backpressured) return;

        const ok = res.write(`event: snapshot\ndata: ${JSON.stringify(game.renderSnapshot())}\n\n`);
        if (!ok) backpressured = true;
    }, STREAM_INTERVAL_MS);

    req.on('close', cleanup);
    return true;
}

export function createApiServer(deps: ApiDeps): any {
    const server = createServer((req: any, res: any) => {
        void handle(req, res);
    });

    async function handle(req: any, res: any): Promise<void> {
        const url = String(req.url || '/');
        const method = String(req.method || 'GET').toUpperCase();
        const { pathname, searchParams } = splitPath(url);

        if (method === 'GET' && handleGameStream(deps, req, res, pathname, searchParams)) {
            return;
        }

        let result;
        try {
            const apiRequest: ApiRequest = {
                method,
                pathname,
                searchParams,
                token: extractToken(req.headers),
                body: method === 'POST'
                    ? await readJsonBody(req, pathname === AGENT_DECIDE_PATH ? MAX_AGENT_BODY_BYTES : undefined)
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
