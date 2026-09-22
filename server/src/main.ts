// 排行榜 API + LLM 代理入口：绑定 127.0.0.1 上的高位端口，由 nginx 反代 /api/（见 deploy/README.md）。
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
import { GameHost } from './game/host';
import { DEFAULT_PROVIDER_BASE_URL, DEFAULT_PROVIDER_MODEL } from './agent';

const VERSION_CHECK_INTERVAL_MS = 3000;
const FORCE_EXIT_MS = 5000;

function readSecret(): string {
    const file = process.env.PD_SESSION_SECRET_FILE;
    if (file && existsSync(file)) return readFileSync(file, 'utf8').trim();
    return String(process.env.PD_SESSION_SECRET || '').trim();
}

/** LLM 代理的 provider 密钥。与会话密钥同样优先从文件读，避免写进 unit 文件。 */
function readDeepseekKey(): string {
    const file = process.env.DEEPSEEK_API_KEY_FILE;
    if (file && existsSync(file)) return readFileSync(file, 'utf8').trim();
    return String(process.env.DEEPSEEK_API_KEY || '').trim();
}

/**
 * provider 端点与模型名。它们不是密钥，所以允许直接写进 systemd unit 的
 * Environment=（密钥必须留在只有服务用户可读的文件里）。留空 = 用 agent.ts 的默认值。
 */
function readProviderBaseUrl(): string {
    return String(process.env.DEEPSEEK_BASE_URL || '').trim();
}

function readProviderModel(): string {
    return String(process.env.DEEPSEEK_MODEL || '').trim();
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
    // LLM 代理的 provider 密钥（issue #22）。缺失时服务照常起，只是
    // /api/agent/decide 返回 503 —— 排行榜不因缺 key 而不可用。
    const deepseekApiKey = readDeepseekKey();
    // provider 端点与模型：留空则沿用 DeepSeek 官方端点，换 provider 不需要改代码。
    const providerBaseUrl = readProviderBaseUrl();
    const providerModel = readProviderModel();

    const secret = readSecret();
    if (!secret) {
        // fail closed：没有签名密钥就无法校验会话，绝不退化到「不校验」。
        console.error('缺少会话密钥：请配置 PD_SESSION_SECRET_FILE 或 PD_SESSION_SECRET');
        process.exit(1);
    }

    const store = new LeaderboardStore(openDatabase(dbPath));
    store.migrate();

    // 托管对局（阶段 B/C）：服务端持有完整对局并以引擎事件作为波次真值。
    // 打开一局就登记一条 run，波次到达直接写 store —— 成绩不再依赖客户端上报。
    const games = new GameHost({
        newGameId: () => randomBytes(16).toString('hex'),
        agent: { apiKey: deepseekApiKey, baseUrl: providerBaseUrl, model: providerModel },
        onCreated: game => store.createRun(game.id, game.username, Date.now()),
        onWaveReached: (game, wave) => {
            // 人类模式对局不入榜（docs/PRODUCT_CONCEPT.md §9）：只有 AI 策略局可比。
            if (game.mode !== 'ai') return;
            store.recordWave(game.id, game.username, wave, Date.now());
        },
    });

    const startedVersion = resolveVersion(currentLink);
    const server = createApiServer({
        store,
        secret,
        now: () => Date.now(),
        newRunId: () => randomBytes(16).toString('hex'),
        agent: { apiKey: deepseekApiKey, baseUrl: providerBaseUrl, model: providerModel },
        games,
    });

    server.listen(port, '127.0.0.1', () => {
        console.log(`排行榜 API 监听 127.0.0.1:${port}`);
        console.log(deepseekApiKey
            ? `LLM 代理已配置（${providerBaseUrl || DEFAULT_PROVIDER_BASE_URL} / ${providerModel || DEFAULT_PROVIDER_MODEL}）`
            : 'LLM 代理未配置：缺少 DEEPSEEK_API_KEY，/api/agent/decide 将返回 503');
    });

    if (currentLink) {
        setInterval(() => {
            const current = resolveVersion(currentLink);
            if (current && current !== startedVersion) {
                console.log(
                    `检测到版本变化（${startedVersion} -> ${current}），退出以让 systemd 拉起新代码`
                );
                games.stopAllDrivers();
                server.close(() => process.exit(0));
                // 兜底：仍有长连接没断开时强制退出，避免一直跑旧代码。
                setTimeout(() => process.exit(0), FORCE_EXIT_MS);
            }
        }, VERSION_CHECK_INTERVAL_MS);
    }
}

main();
