// 排行榜存储逻辑。
// 纯前端本地实现（当前阶段无后端、不允许可伪造的服务端接口，见 AGENTS.md 与 DEPLOYMENT.md §三.1）：
//  - 用户名保存在 cookie（用户显式要求「保存用户的cookies」），并在 localStorage 缓存一份；
//  - 排行榜记录保存在 localStorage（每台设备本地一份，非共享，待服务端就绪后替换）。
// 代码刻意与 DOM 解耦，便于在无 DOM 环境下单测。
// 排行榜渲染对用户名转义，禁止 innerHTML 直出（用户名字符串不可信，AGENTS.md「不可信输入」）。

export const STORAGE_KEY = 'pd_leaderboard_v1';

export interface LeaderboardEntry {
    username: string;
    wave: number;
    /* 产生时间戳（毫秒）：用于平局时更早达成者靠前、以及将来展示。 */
    timestamp: number;
}

/* 用户名合法字符：中英文、数字、下划线、短横线（限制展示/校验，非安全边界）。非法返回 null。 */
export function sanitizeUsername(raw: string): string | null {
    if (typeof raw !== 'string') return null;
    const name = raw.trim();
    if (name.length < 1 || name.length > 16) return null;
    if (!/^[\w\-\u4e00-\u9fa5]+$/.test(name)) return null;
    return name;
}

/* 读取 localStorage 排行榜；缺失时返回空数组，存储不可用或解析失败返回 null。 */
export function readStoredLeaderboard(): LeaderboardEntry[] | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.entries)) return [];
        const valid = (parsed.entries as any[]).filter(e =>
            e && typeof e.username === 'string' && typeof e.wave === 'number' && typeof e.timestamp === 'number'
        );
        return valid.map(e => ({
            username: sanitizeUsername(e.username) || '???',
            wave: Math.max(0, Math.floor(e.wave)),
            timestamp: e.timestamp
        }));
    } catch (e) {
        return null;
    }
}

/* 写排行榜到 localStorage（整表覆盖）。 */
export function writeStoredLeaderboard(entries: LeaderboardEntry[]) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }));
    } catch (e) {
        /* 存储不可用（隐私模式/配额）时静默忽略：排行榜退化为仅本次会话展示。 */
    }
}

/* 排序：分数降序，平分时更早达成的靠前。返回新数组，不修改入参。 */
export function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    return entries.slice().sort((a, b) => {
        if (b.wave !== a.wave) return b.wave - a.wave;
        return a.timestamp - b.timestamp;
    });
}

/* 合并同一用户名的多条记录为最佳成绩（取最高分，平手取更早）。 */
export function dedupeByUser(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    const byName: { [name: string]: LeaderboardEntry } = {};
    for (const e of entries) {
        const key = e.username.toLowerCase();
        const prev = byName[key];
        if (!prev || e.wave > prev.wave || (e.wave === prev.wave && e.timestamp < prev.timestamp)) {
            byName[key] = e;
        }
    }
    return Object.keys(byName).map(k => byName[k]);
}

/* 提交一局成绩，返回 { entries, rank }：rank 为 1-based 全局名次（该用户名最佳成绩所在排名），未找到返回 null。 */
export function submitScore(username: string, score: number, stored: LeaderboardEntry[] | null): { entries: LeaderboardEntry[]; rank: number | null } {
    const clean = sanitizeUsername(username);
    const safeScore = Math.max(1, Math.floor(score));
    const entries = stored && stored.length ? stored.slice() : [];
    const ts = Date.now();
    entries.push({ username: clean || '???', wave: safeScore, timestamp: ts });
    let merged = dedupeByUser(entries);
    merged = sortEntries(merged);
    const lower = clean ? clean.toLowerCase() : '';
    const idx = clean ? merged.findIndex(e => e.username.toLowerCase() === lower) : -1;
    const rank = idx >= 0 ? idx + 1 : null;
    return { entries: merged, rank };
}
