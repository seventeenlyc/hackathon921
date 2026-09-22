// 排行榜的持久化与业务规则。
//
// 关键不变量（AGENTS.md「不可信输入」、docs/PRODUCT_CONCEPT.md §9）：
//   成绩以**服务端记录的对局证据**为准，不是客户端上报的最终分数。
//   客户端只能说「我在这一局到了第 N 波」，且只有服务端接受的、单调递增的记录才进入排行榜。
//
// 所有 SQL 都是参数化查询，绝不拼接字符串（AGENTS.md 明确要求）。

import { MAX_WAVE } from './validate';

export interface LeaderboardEntry {
    username: string;
    wave: number;
    achievedAt: number;
}

export interface RunRecord {
    id: string;
    username: string;
    createdAt: number;
    lastWave: number;
}

export type WaveRejection =
    | 'RUN_NOT_FOUND'
    | 'USERNAME_MISMATCH'
    | 'RUN_EXPIRED'
    | 'WAVE_OUT_OF_RANGE'
    | 'WAVE_NOT_INCREASING';

export type WaveResult =
    | { accepted: true; bestWave: number }
    | { accepted: false; reason: WaveRejection };

/** 一局的有效期：超过后不再接受波次上报，客户端应重新开局。 */
export const RUN_TTL_MS = 6 * 60 * 60 * 1000;

export class LeaderboardStore {
    constructor(private readonly db: any) {}

    migrate(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS runs (
                id         TEXT PRIMARY KEY,
                username   TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_wave  INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_runs_username ON runs (username);
            CREATE TABLE IF NOT EXISTS wave_events (
                run_id TEXT NOT NULL REFERENCES runs (id),
                wave   INTEGER NOT NULL,
                at_ms  INTEGER NOT NULL,
                PRIMARY KEY (run_id, wave)
            );
            CREATE INDEX IF NOT EXISTS idx_wave_events_wave ON wave_events (wave);
        `);
    }

    createRun(id: string, username: string, now: number): void {
        this.db
            .prepare('INSERT INTO runs (id, username, created_at, last_wave) VALUES (?, ?, ?, 0)')
            .run(id, username, now);
    }

    getRun(id: string): RunRecord | null {
        const row = this.db
            .prepare('SELECT id, username, created_at, last_wave FROM runs WHERE id = ?')
            .get(id);
        if (!row) return null;
        return {
            id: row.id,
            username: row.username,
            createdAt: row.created_at,
            lastWave: row.last_wave,
        };
    }

    /**
     * 记录一次「到达波次」。只有通过全部校验才落库，并返回该用户当前的最佳波次。
     *
     * 失败原因是结构化的：客户端据此决定「重新开一局」还是「这条上报被拒绝」，
     * 不静默吞掉（AGENTS.md「失败即 fail closed」）。
     */
    recordWave(runId: string, username: string, wave: number, now: number): WaveResult {
        const run = this.getRun(runId);
        if (!run) return { accepted: false, reason: 'RUN_NOT_FOUND' };
        // 昵称比较大小写不敏感：同一人换大小写不应被当成冒用，见 top() 的分组规则。
        if (run.username.toLowerCase() !== username.toLowerCase()) {
            return { accepted: false, reason: 'USERNAME_MISMATCH' };
        }
        if (now - run.createdAt > RUN_TTL_MS) return { accepted: false, reason: 'RUN_EXPIRED' };
        if (!Number.isInteger(wave) || wave < 1 || wave > MAX_WAVE) {
            return { accepted: false, reason: 'WAVE_OUT_OF_RANGE' };
        }
        if (wave <= run.lastWave) return { accepted: false, reason: 'WAVE_NOT_INCREASING' };

        // 事务：波次事件与 run 的游标必须一起前进，否则中断会留下不一致状态。
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db
                .prepare('INSERT INTO wave_events (run_id, wave, at_ms) VALUES (?, ?, ?)')
                .run(runId, wave, now);
            this.db.prepare('UPDATE runs SET last_wave = ? WHERE id = ?').run(wave, runId);
            this.db.exec('COMMIT');
        } catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
        return { accepted: true, bestWave: this.bestWaveOf(username) ?? wave };
    }

    /** 某个昵称（大小写不敏感）的历史最佳波次；从未上报过返回 null。 */
    bestWaveOf(username: string): number | null {
        const row = this.db
            .prepare(
                'SELECT MAX(w.wave) AS best FROM wave_events w ' +
                    'JOIN runs r ON r.id = w.run_id WHERE lower(r.username) = lower(?)'
            )
            .get(username);
        return row && row.best != null ? Number(row.best) : null;
    }

    /**
     * 排行榜前 N 名。规则见 docs/PRODUCT_CONCEPT.md §9：
     *   每个昵称取最佳波次，按波次降序；平局时更早达成者靠前。
     * 昵称大小写不敏感地合并（与前端 dedupeByUser 一致），显示名取该组内字典序最小的写法。
     */
    top(limit: number): LeaderboardEntry[] {
        const rows = this.db
            .prepare(
                `WITH best AS (
                     SELECT lower(r.username) AS uname, MAX(w.wave) AS best_wave
                     FROM runs r JOIN wave_events w ON w.run_id = r.id
                     GROUP BY lower(r.username)
                 ),
                 achieved AS (
                     SELECT b.uname AS uname,
                            b.best_wave AS best_wave,
                            MIN(w.at_ms) AS achieved_at,
                            MIN(r.username) AS display_name
                     FROM best b
                     JOIN runs r ON lower(r.username) = b.uname
                     JOIN wave_events w ON w.run_id = r.id AND w.wave = b.best_wave
                     GROUP BY b.uname, b.best_wave
                 )
                 SELECT display_name AS username, best_wave AS wave, achieved_at AS achievedAt
                 FROM achieved
                 ORDER BY best_wave DESC, achieved_at ASC, display_name ASC
                 LIMIT ?`
            )
            .all(limit);
        return rows.map((row: any) => ({
            username: row.username,
            wave: Number(row.wave),
            achievedAt: Number(row.achievedAt),
        }));
    }

    /** 某个昵称在全局排行榜中的 1-based 名次；无记录返回 null。 */
    rankOf(username: string): number | null {
        const row = this.db
            .prepare(
                `WITH best AS (
                     SELECT lower(r.username) AS uname, MAX(w.wave) AS best_wave
                     FROM runs r JOIN wave_events w ON w.run_id = r.id
                     GROUP BY lower(r.username)
                 ),
                 achieved AS (
                     SELECT b.uname AS uname,
                            b.best_wave AS best_wave,
                            MIN(w.at_ms) AS achieved_at,
                            MIN(r.username) AS display_name
                     FROM best b
                     JOIN runs r ON lower(r.username) = b.uname
                     JOIN wave_events w ON w.run_id = r.id AND w.wave = b.best_wave
                     GROUP BY b.uname, b.best_wave
                 ),
                 ranked AS (
                     SELECT uname,
                            ROW_NUMBER() OVER (
                                ORDER BY best_wave DESC, achieved_at ASC, display_name ASC
                            ) AS rank
                     FROM achieved
                 )
                 SELECT rank FROM ranked WHERE uname = lower(?)`
            )
            .get(username);
        return row && row.rank != null ? Number(row.rank) : null;
    }
}
