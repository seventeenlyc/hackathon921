// 排行榜的持久化与业务规则。
//
// 关键不变量（AGENTS.md「不可信输入」、docs/PRODUCT_CONCEPT.md §9）：
//   成绩以**服务端记录的对局证据**为准，不是客户端上报的最终分数。
//   客户端只能说「我在这一局到了第 N 波」，且只有服务端接受的、单调递增的记录才进入排行榜。
//
// 所有 SQL 都是参数化查询，绝不拼接字符串（AGENTS.md 明确要求）。

import { MAX_WAVE } from './validate';
import { randomBytes } from 'node:crypto';
import { MAX_PROMPT_LENGTH } from './prompts';
import type { BestRunPrompts, PromptInput, PromptNode, PromptWriteResult } from './prompts';

export type PlayMode = 'ai' | 'human';
export type LeaderboardMode = PlayMode | 'total';

export interface LeaderboardEntry {
    username: string;
    wave: number;
    achievedAt: number;
    mode: PlayMode;
}

export interface RunRecord {
    id: string;
    username: string;
    createdAt: number;
    lastWave: number;
    promptHeadId: string | null;
    mode: PlayMode;
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
        this.db.exec('PRAGMA foreign_keys = ON;');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS runs (
                id         TEXT PRIMARY KEY,
                username   TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_wave  INTEGER NOT NULL DEFAULT 0,
                mode       TEXT NOT NULL DEFAULT 'ai'
            );
        `);
        const columns = this.db.prepare('PRAGMA table_info(runs)').all();
        if (!columns.some((column: any) => column.name === 'prompt_head_id')) {
            this.db.exec('ALTER TABLE runs ADD COLUMN prompt_head_id TEXT;');
        }
        if (!columns.some((column: any) => column.name === 'mode')) {
            this.db.exec("ALTER TABLE runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'ai';");
        }
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_runs_username ON runs (username);
            CREATE INDEX IF NOT EXISTS idx_runs_mode ON runs (mode);
            CREATE TABLE IF NOT EXISTS wave_events (
                run_id TEXT NOT NULL REFERENCES runs (id),
                wave   INTEGER NOT NULL,
                at_ms  INTEGER NOT NULL,
                PRIMARY KEY (run_id, wave)
            );
            CREATE INDEX IF NOT EXISTS idx_wave_events_wave ON wave_events (wave);
            CREATE TABLE IF NOT EXISTS prompt_nodes (
                id         TEXT PRIMARY KEY,
                run_id     TEXT NOT NULL REFERENCES runs (id),
                prev_id    TEXT REFERENCES prompt_nodes (id),
                version    INTEGER NOT NULL,
                prompt     TEXT NOT NULL,
                from_wave  INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE (run_id, version)
            );
            CREATE INDEX IF NOT EXISTS idx_prompt_nodes_run ON prompt_nodes (run_id, version);
        `);
    }

    createRun(id: string, username: string, now: number, mode: PlayMode = 'ai'): void {
        if (mode !== 'ai' && mode !== 'human') {
            throw new Error('INVALID_MODE');
        }
        this.db
            .prepare('INSERT INTO runs (id, username, created_at, last_wave, mode) VALUES (?, ?, ?, 0, ?)')
            .run(id, username, now, mode);
    }

    getRun(id: string): RunRecord | null {
        const row = this.db
            .prepare('SELECT id, username, created_at, last_wave, prompt_head_id, mode FROM runs WHERE id = ?')
            .get(id);
        if (!row) return null;
        return {
            id: row.id,
            username: row.username,
            createdAt: row.created_at,
            lastWave: row.last_wave,
            promptHeadId: row.prompt_head_id == null ? null : String(row.prompt_head_id),
            mode: (row.mode === 'human' ? 'human' : 'ai') as PlayMode,
        };
    }

    /** Atomically append one version that really became active at a wave boundary. */
    recordPrompt(runId: string, username: string, input: PromptInput, now: number): PromptWriteResult {
        const run = this.getRun(runId);
        if (!run) return { recorded: false, reason: 'RUN_NOT_FOUND' };
        if (run.username.toLowerCase() !== username.toLowerCase()) {
            return { recorded: false, reason: 'USERNAME_MISMATCH' };
        }

        this.db.exec('BEGIN IMMEDIATE');
        try {
            const current = this.db
                .prepare('SELECT id, prompt, from_wave FROM prompt_nodes WHERE run_id = ? AND version = ?')
                .get(runId, input && input.version);
            if (current) {
                const same = current.prompt === input.prompt && Number(current.from_wave) === input.fromWave;
                this.db.exec('COMMIT');
                return same
                    ? { recorded: true, version: input.version, fromWave: input.fromWave }
                    : { recorded: false, reason: 'PROMPT_VERSION_CONFLICT' };
            }

            const currentRun = this.db
                .prepare('SELECT created_at, last_wave, prompt_head_id FROM runs WHERE id = ?')
                .get(runId);
            if (!currentRun) {
                this.db.exec('COMMIT');
                return { recorded: false, reason: 'RUN_NOT_FOUND' };
            }
            if (now - Number(currentRun.created_at) > RUN_TTL_MS) {
                this.db.exec('COMMIT');
                return { recorded: false, reason: 'RUN_EXPIRED' };
            }
            if (!input || !Number.isInteger(input.version) || input.version < 1) {
                this.db.exec('COMMIT');
                return { recorded: false, reason: 'PROMPT_VERSION_INVALID' };
            }
            if (typeof input.prompt !== 'string' || input.prompt.trim() === '' || input.prompt.length > MAX_PROMPT_LENGTH) {
                this.db.exec('COMMIT');
                return { recorded: false, reason: 'PROMPT_INVALID' };
            }
            if (!Number.isInteger(input.fromWave) || input.fromWave < 1 || input.fromWave > MAX_WAVE) {
                this.db.exec('COMMIT');
                return { recorded: false, reason: 'PROMPT_WAVE_INVALID' };
            }
            if (input.fromWave < Number(currentRun.last_wave)) {
                this.db.exec('COMMIT');
                return { recorded: false, reason: 'PROMPT_WAVE_BEHIND' };
            }
            const latest = this.db
                .prepare('SELECT MAX(version) AS version FROM prompt_nodes WHERE run_id = ?')
                .get(runId);
            if (latest.version != null && input.version <= Number(latest.version)) {
                this.db.exec('COMMIT');
                return { recorded: false, reason: 'PROMPT_VERSION_NOT_INCREASING' };
            }

            const id = randomBytes(16).toString('hex');
            this.db
                .prepare(
                    'INSERT INTO prompt_nodes (id, run_id, prev_id, version, prompt, from_wave, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
                )
                .run(id, runId, currentRun.prompt_head_id == null ? null : currentRun.prompt_head_id, input.version, input.prompt, input.fromWave, now);
            this.db.prepare('UPDATE runs SET prompt_head_id = ? WHERE id = ?').run(id, runId);
            this.db.exec('COMMIT');
            return { recorded: true, version: input.version, fromWave: input.fromWave };
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (rollbackError) { /* preserve original error */ }
            throw error;
        }
    }

    /** Return only the complete chain belonging to the selected user's best run. */
    bestRunPrompts(username: string): BestRunPrompts {
        const selected = this.db
            .prepare(
                `SELECT r.id, r.username, w.wave, w.at_ms
                 FROM runs r JOIN wave_events w ON w.run_id = r.id
                 WHERE lower(r.username) = lower(?) AND r.mode = 'ai'
                 ORDER BY w.wave DESC, w.at_ms ASC, r.id ASC
                 LIMIT 1`
            )
            .get(username);
        if (!selected) return { username, runId: null, wave: null, prompts: [] };

        const run = this.getRun(String(selected.id));
        if (!run) throw new Error('PROMPT_CHAIN_RUN_MISSING');
        const prompts: PromptNode[] = [];
        const seen = new Set<string>();
        let nodeId = run.promptHeadId;
        while (nodeId !== null) {
            if (seen.has(nodeId)) throw new Error('PROMPT_CHAIN_CYCLE');
            seen.add(nodeId);
            const row = this.db
                .prepare('SELECT id, run_id, prev_id, version, prompt, from_wave, created_at FROM prompt_nodes WHERE id = ?')
                .get(nodeId);
            if (!row) throw new Error('PROMPT_CHAIN_MISSING_NODE');
            if (String(row.run_id) !== run.id) throw new Error('PROMPT_CHAIN_CROSS_RUN');
            prompts.push({
                id: String(row.id),
                runId: String(row.run_id),
                prevId: row.prev_id == null ? null : String(row.prev_id),
                version: Number(row.version),
                prompt: String(row.prompt),
                fromWave: Number(row.from_wave),
                createdAt: Number(row.created_at),
            });
            nodeId = row.prev_id == null ? null : String(row.prev_id);
        }
        prompts.reverse();
        return {
            username: String(selected.username),
            runId: String(selected.id),
            wave: Number(selected.wave),
            prompts,
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
        return { accepted: true, bestWave: this.bestWaveOf(username, run.mode) ?? wave };
    }

    /** 某个昵称（大小写不敏感）在指定模式下的历史最佳波次；从未上报过返回 null。 */
    bestWaveOf(username: string, mode: PlayMode = 'ai'): number | null {
        const row = this.db
            .prepare(
                'SELECT MAX(w.wave) AS best FROM wave_events w ' +
                    'JOIN runs r ON r.id = w.run_id WHERE lower(r.username) = lower(?) AND r.mode = ?'
            )
            .get(username, mode);
        return row && row.best != null ? Number(row.best) : null;
    }

    /**
     * 排行榜前 N 名。规则见 docs/PRODUCT_CONCEPT.md §9：
     *   每个昵称取最佳波次，按波次降序；平局时更早达成者靠前。
     * 昵称大小写不敏感地合并（与前端 dedupeByUser 一致），显示名取该组内字典序最小的写法。
     * 总榜合并 AI 与 Human 最佳记录，同昵称可在两榜分别上榜。
     */
    top(limit: number, mode: LeaderboardMode = 'ai'): LeaderboardEntry[] {
        let rows: any[];
        if (mode === 'total') {
            rows = this.db
                .prepare(
                    `WITH best AS (
                         SELECT lower(r.username) AS uname, r.mode AS mode, MAX(w.wave) AS best_wave
                         FROM runs r JOIN wave_events w ON w.run_id = r.id
                         GROUP BY lower(r.username), r.mode
                     ),
                     achieved AS (
                         SELECT b.uname AS uname,
                                b.mode AS mode,
                                b.best_wave AS best_wave,
                                MIN(w.at_ms) AS achieved_at,
                                MIN(r.username) AS display_name
                         FROM best b
                         JOIN runs r ON lower(r.username) = b.uname AND r.mode = b.mode
                         JOIN wave_events w ON w.run_id = r.id AND w.wave = b.best_wave
                         GROUP BY b.uname, b.mode, b.best_wave
                     )
                     SELECT display_name AS username, best_wave AS wave, achieved_at AS achievedAt, mode
                     FROM achieved
                     ORDER BY best_wave DESC, achieved_at ASC, display_name ASC
                     LIMIT ?`
                )
                .all(limit);
        } else {
            rows = this.db
                .prepare(
                    `WITH best AS (
                         SELECT lower(r.username) AS uname, r.mode AS mode, MAX(w.wave) AS best_wave
                         FROM runs r JOIN wave_events w ON w.run_id = r.id
                         WHERE r.mode = ?
                         GROUP BY lower(r.username), r.mode
                     ),
                     achieved AS (
                         SELECT b.uname AS uname,
                                b.mode AS mode,
                                b.best_wave AS best_wave,
                                MIN(w.at_ms) AS achieved_at,
                                MIN(r.username) AS display_name
                         FROM best b
                         JOIN runs r ON lower(r.username) = b.uname AND r.mode = b.mode
                         JOIN wave_events w ON w.run_id = r.id AND w.wave = b.best_wave
                         GROUP BY b.uname, b.mode, b.best_wave
                     )
                     SELECT display_name AS username, best_wave AS wave, achieved_at AS achievedAt, mode
                     FROM achieved
                     ORDER BY best_wave DESC, achieved_at ASC, display_name ASC
                     LIMIT ?`
                )
                .all(mode, limit);
        }
        return rows.map((row: any) => ({
            username: row.username,
            wave: Number(row.wave),
            achievedAt: Number(row.achievedAt),
            mode: (row.mode === 'human' ? 'human' : 'ai') as PlayMode,
        }));
    }

    /** 某个昵称在指定模式排行榜中的 1-based 名次；无记录返回 null。 */
    rankOf(username: string, mode: LeaderboardMode = 'ai'): number | null {
        let row: any;
        if (mode === 'total') {
            row = this.db
                .prepare(
                    `WITH best AS (
                         SELECT lower(r.username) AS uname, r.mode AS mode, MAX(w.wave) AS best_wave
                         FROM runs r JOIN wave_events w ON w.run_id = r.id
                         GROUP BY lower(r.username), r.mode
                     ),
                     achieved AS (
                         SELECT b.uname AS uname,
                                b.mode AS mode,
                                b.best_wave AS best_wave,
                                MIN(w.at_ms) AS achieved_at,
                                MIN(r.username) AS display_name
                         FROM best b
                         JOIN runs r ON lower(r.username) = b.uname AND r.mode = b.mode
                         JOIN wave_events w ON w.run_id = r.id AND w.wave = b.best_wave
                         GROUP BY b.uname, b.mode, b.best_wave
                     ),
                     ranked AS (
                         SELECT uname, mode,
                                ROW_NUMBER() OVER (
                                    ORDER BY best_wave DESC, achieved_at ASC, display_name ASC
                                ) AS rank
                         FROM achieved
                     )
                     SELECT MIN(rank) AS rank FROM ranked WHERE uname = lower(?)`
                )
                .get(username);
        } else {
            row = this.db
                .prepare(
                    `WITH best AS (
                         SELECT lower(r.username) AS uname, r.mode AS mode, MAX(w.wave) AS best_wave
                         FROM runs r JOIN wave_events w ON w.run_id = r.id
                         WHERE r.mode = ?
                         GROUP BY lower(r.username), r.mode
                     ),
                     achieved AS (
                         SELECT b.uname AS uname,
                                b.mode AS mode,
                                b.best_wave AS best_wave,
                                MIN(w.at_ms) AS achieved_at,
                                MIN(r.username) AS display_name
                         FROM best b
                         JOIN runs r ON lower(r.username) = b.uname AND r.mode = b.mode
                         JOIN wave_events w ON w.run_id = r.id AND w.wave = b.best_wave
                         GROUP BY b.uname, b.mode, b.best_wave
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
                .get(mode, username);
        }
        return row && row.rank != null ? Number(row.rank) : null;
    }
}
