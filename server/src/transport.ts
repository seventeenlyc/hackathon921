// HTTP 传输层辅助：把 node:http 的原始请求转成路由层需要的普通数据。
// 单独成文件是为了能直接单测（请求体上限、query 解析、Bearer token 提取）。

/** 请求体上限：本 API 的 body 只有昵称和波次，4KB 绰绰有余，超出即视为坏请求。 */
export const MAX_BODY_BYTES = 4096;

/** 读取并解析 JSON 请求体；超限、空、非法 JSON、读取出错一律返回 null（由路由层判 400）。 */
export function readJsonBody(req: any): Promise<unknown> {
    return new Promise(resolve => {
        let size = 0;
        let tooLarge = false;
        const chunks: any[] = [];
        req.on('data', (chunk: any) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                tooLarge = true;
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (tooLarge || chunks.length === 0) return resolve(null);
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (e) {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

/** 拆出 pathname 与 query 参数；非法百分号编码的参数被忽略而不是让请求 500。 */
export function splitPath(url: string): {
    pathname: string;
    searchParams: Record<string, string>;
} {
    const qIndex = url.indexOf('?');
    const pathname = qIndex < 0 ? url : url.slice(0, qIndex);
    const searchParams: Record<string, string> = {};
    if (qIndex >= 0) {
        for (const pair of url.slice(qIndex + 1).split('&')) {
            if (!pair) continue;
            const eq = pair.indexOf('=');
            const key = eq < 0 ? pair : pair.slice(0, eq);
            const value = eq < 0 ? '' : pair.slice(eq + 1);
            try {
                searchParams[decodeURIComponent(key)] = decodeURIComponent(value);
            } catch (e) {
                /* 非法编码：忽略该参数 */
            }
        }
    }
    return { pathname, searchParams };
}

/** 提取 `Authorization: Bearer <token>`；缺失或格式不对返回 null。 */
export function extractToken(headers: any): string | null {
    const raw = headers ? headers['authorization'] : null;
    if (typeof raw !== 'string') return null;
    const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
    return match ? match[1].trim() : null;
}
