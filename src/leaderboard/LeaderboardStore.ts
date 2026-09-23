// 本地排行榜仅在共享服务不可用时提供离线展示，不作为共享成绩的真值来源。
// 离线身份使用页面内存中的 userId，刷新后重新选择昵称和头像会生成新身份。
// 代码刻意与 DOM 解耦，便于在无 DOM 环境下单测；用户名只按纯文本展示。

export const STORAGE_KEY = 'pd_leaderboard_v1';

export type PlayMode = 'ai' | 'human';
export type LeaderboardMode = PlayMode | 'total';

export interface LeaderboardEntry {
    /** Page-scoped UID in offline mode; never a display name. */
    userId: string;
    username: string;
    avatarId: string | null;
    wave: number;
    /* 产生时间戳（毫秒）：用于平局时更早达成者靠前、以及将来展示。 */
    timestamp: number;
    mode: PlayMode;
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
        return valid.map((e, index) => ({
            userId: typeof e.userId === 'string' && e.userId ? e.userId : `legacy-${index}-${e.timestamp}`,
            username: sanitizeUsername(e.username) || '???',
            avatarId: typeof e.avatarId === 'string' ? e.avatarId : null,
            wave: Math.max(0, Math.floor(e.wave)),
            timestamp: e.timestamp,
            mode: (e.mode === 'human' ? 'human' : 'ai') as PlayMode,
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

/* 合并同一 UID 在同一模式下的多条记录为最佳成绩（取最高分，平手取更早）。 */
export function dedupeByUser(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    const byKey: { [key: string]: LeaderboardEntry } = {};
    entries = entries.map((entry, index) => ({
        ...entry,
        userId: typeof entry.userId === 'string' && entry.userId ? entry.userId : `legacy-${index}-${entry.timestamp}`,
        avatarId: typeof entry.avatarId === 'string' ? entry.avatarId : null,
    }));
    for (const e of entries) {
        const mode: PlayMode = e.mode === 'human' ? 'human' : 'ai';
        const key = `${e.userId}#${mode}`;
        const prev = byKey[key];
        if (!prev || e.wave > prev.wave || (e.wave === prev.wave && e.timestamp < prev.timestamp)) {
            byKey[key] = { ...e, mode };
        }
    }
    return Object.keys(byKey).map(k => byKey[k]);
}

/* 根据榜单模式筛选条目（AI / Human 视图或 Total 全榜），并完成去重与排序。 */
export function entriesForBoard(entries: LeaderboardEntry[], mode: LeaderboardMode = 'ai'): LeaderboardEntry[] {
    const deduped = dedupeByUser(entries);
    const filtered = mode === 'total' ? deduped : deduped.filter(e => e.mode === mode);
    return sortEntries(filtered);
}

/* 提交一局成绩，返回 { entries, rank }：rank 为 1-based 在当前模式榜单中的名次，未找到返回 null。 */
export function submitScore(
    username: string,
    score: number,
    stored: LeaderboardEntry[] | null,
    mode: PlayMode = 'ai',
    userId = `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    avatarId: string | null = null,
): { entries: LeaderboardEntry[]; rank: number | null } {
    const clean = sanitizeUsername(username);
    const safeScore = Math.max(1, Math.floor(score));
    const safeMode: PlayMode = mode === 'human' ? 'human' : 'ai';
    const entries = stored && stored.length ? stored.slice() : [];
    const ts = Date.now();
    entries.push({ userId, username: clean || '???', avatarId, wave: safeScore, timestamp: ts, mode: safeMode });
    let merged = dedupeByUser(entries);
    merged = sortEntries(merged);
    const boardEntries = entriesForBoard(merged, safeMode);
    const idx = clean ? boardEntries.findIndex(e => e.userId === userId && e.mode === safeMode) : -1;
    const rank = idx >= 0 ? idx + 1 : null;
    return { entries: merged, rank };
}
