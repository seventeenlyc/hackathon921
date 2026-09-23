// 输入校验：后端 API 的所有输入一律不可信（AGENTS.md「不可信输入」）。
// 这里的规则必须与前端 src/leaderboard/LeaderboardStore.ts 的 sanitizeUsername 保持一致，
// 否则合法昵称会在服务端被拒。前端那套是展示/校验限制，服务端这套才是边界。

export const MAX_USERNAME_LENGTH = 16;
export const MIN_USERNAME_LENGTH = 1;

/** 单局合理的最大波次上限。无限塔防没有硬性终局，这里只是拒绝荒谬值（如 Number.MAX_SAFE_INTEGER）。 */
export const MAX_WAVE = 100000;
export const MAX_STRATEGY_LENGTH = 5000;

const USERNAME_PATTERN = /^[\w\-\u4e00-\u9fa5]+$/;

/** 校验昵称；非法返回 null。与前端同规则：中英文、数字、下划线、短横线，1-16 字符。 */
export function sanitizeUsername(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const name = raw.trim();
    if (name.length < MIN_USERNAME_LENGTH || name.length > MAX_USERNAME_LENGTH) return null;
    if (!USERNAME_PATTERN.test(name)) return null;
    return name;
}

/** 校验波次：必须是 1..MAX_WAVE 的整数；否则返回 null。 */
export function sanitizeWave(raw: unknown): number | null {
    if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
    if (raw < 1 || raw > MAX_WAVE) return null;
    return raw;
}

/** 校验排行榜条数上限：默认 10，夹在 1..100。 */
export function sanitizeLimit(raw: unknown): number {
    const DEFAULT_LIMIT = 10;
    const MAX_LIMIT = 100;
    if (raw == null) return DEFAULT_LIMIT;
    const n = Number(raw);
    if (!Number.isInteger(n)) return DEFAULT_LIMIT;
    if (n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
}

/** 校验开局模式：缺失默认 'ai'，合法值 'ai' | 'human'，其他返回 null。 */
export function sanitizeRunMode(raw: unknown): 'ai' | 'human' | null {
    if (raw === undefined || raw === null) return 'ai';
    if (raw === 'ai' || raw === 'human') return raw;
    return null;
}

/** 校验排行榜查询模式：缺失或空串默认 'ai'，合法值 'ai' | 'human' | 'total'，其他返回 null。 */
export function sanitizeLeaderboardMode(raw: unknown): 'ai' | 'human' | 'total' | null {
    if (raw === undefined || raw === null || raw === '') return 'ai';
    if (raw === 'ai' || raw === 'human' || raw === 'total') return raw;
    return null;
}
