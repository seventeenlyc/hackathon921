// 排行榜 API 入口：绑定 127.0.0.1 上的高位端口，由 nginx 反代 /api/（见 deploy/README.md）。
//
// 只用 Node 内置模块：node:http / node:sqlite / node:crypto。零运行时 npm 依赖。
//
// 版本自检重启：部署只切换 current-server 符号链接，进程发现指向变了就退出，
// systemd 以 Restart=always 拉起新代码。这样部署用户不需要任何 sudo 权限，
// 与静态站「符号链接原子切换、不 reload nginx」是同一个思路。

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { openDatabase } from './db';
import { createApiServer } from './server';
import { LeaderboardStore } from './store';

const VERSION_CHECK_INTERVAL_MS = 3000;
const FORCE_EXIT_MS = 5000;

function readSecret(): string {
    const file = process.env.PD_SESSION_SECRET_FILE;
    if (file && existsSync(file)) return readFileSync(file, 'utf8').trim();
    return String(process.env.PD_SESSION_SECRET || '').trim();
}

/** 解析 current-server 符号链接的真实路径，作为「当前运行的代码版本」。 */
function resolveVersion(link: string): string {
    if (!link || !existsSync(link)) return '';
    try {
        return realpathSync(link);
    } catch (e) {
        return '';
    }
}

function main(): void {
    const port = Number(process.env.PD_PORT || '8781');
    const dbPath = String(process.env.PD_DB_PATH || './leaderboard.sqlite3');
    const currentLink = String(process.env.PD_CURRENT_LINK || '');

    const secret = readSecret();
    if (!secret) {
        // fail closed：没有签名密钥就无法校验会话，绝不退化到「不校验」。
        console.error('缺少会话密钥：请配置 PD_SESSION_SECRET_FILE 或 PD_SESSION_SECRET');
        process.exit(1);
    }

    const store = new LeaderboardStore(openDatabase(dbPath));
    store.migrate();

    const startedVersion = resolveVersion(currentLink);
    const server = createApiServer({
        store,
        secret,
        now: () => Date.now(),
        newRunId: () => randomBytes(16).toString('hex'),
    });

    server.listen(port, '127.0.0.1', () => {
        console.log(`排行榜 API 监听 127.0.0.1:${port}`);
    });

    if (currentLink) {
        setInterval(() => {
            const current = resolveVersion(currentLink);
            if (current && current !== startedVersion) {
                console.log(
                    `检测到版本变化（${startedVersion} -> ${current}），退出以让 systemd 拉起新代码`
                );
                server.close(() => process.exit(0));
                // 兜底：仍有长连接没断开时强制退出，避免一直跑旧代码。
                setTimeout(() => process.exit(0), FORCE_EXIT_MS);
            }
        }, VERSION_CHECK_INTERVAL_MS);
    }
}

main();
