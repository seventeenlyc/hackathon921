// 排行榜与 Prompt 历史的持久化。
//
// 成绩以服务端记录的波次事件为准；用户身份以服务端自增 UID 为准。
// 昵称和头像只是每个 UID 的展示资料，不参与身份校验或聚合。
// 所有 SQL 都使用参数化查询。

import { MAX_WAVE, sanitizeAvatarId, sanitizeUsername } from './validate';
import { randomBytes } from 'node:crypto';
import { MAX_PROMPT_LENGTH } from './prompts';
import type { BestRunPrompts, PromptInput, PromptNode, PromptWriteResult } from './prompts';

export type PlayMode = 'ai' | 'human';
export type LeaderboardMode = PlayMode | 'total';

export interface UserProfile {
    uid: number;
    username: string;
    avatarId: string | null;
    createdAt: number;
}

export interface LeaderboardEntry {
    uid: number;
    username: string;
    avatarId: string | null;
    wave: number;
    achievedAt: number;
    mode: PlayMode;
}

export interface RunRecord {
    id: string;
    uid: number;
    username: string;
    createdAt: number;
    lastWave: number;
    promptHeadId: string | null;
    mode: PlayMode;
}

export type WaveRejection =
    | 'RUN_NOT_FOUND'
    | 'UID_MISMATCH'
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
            CREATE TABLE IF NOT EXISTS users (
                uid        INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT NOT NULL,
                avatar_id  TEXT,
                created_at INTEGER NOT NULL,
                legacy_key TEXT UNIQUE
            );
            CREATE TABLE IF NOT EXISTS runs (
                id         TEXT PRIMARY KEY,
                username   TEXT NOT NULL,
                user_id    INTEGER REFERENCES users (uid),
                created_at INTEGER NOT NULL,
                last_wave  INTEGER NOT NULL DEFAULT 0,
                mode       TEXT NOT NULL DEFAULT 'ai'
            );
        `);
        const columns = this.db.prepare('PRAGMA table_info(runs)').all();
        if (!columns.some((column: any) => column.name === 'user_id')) {
            this.db.exec('ALTER TABLE runs ADD COLUMN user_id INTEGER REFERENCES users (uid);');
        }
        if (!columns.some((column: any) => column.name === 'prompt_head_id')) {
            this.db.exec('ALTER TABLE runs ADD COLUMN prompt_head_id TEXT;');
        }
        if (!columns.some((column: any) => column.name === 'mode')) {
            this.db.exec("ALTER TABLE runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'ai';");
        }

        // Historical rows were grouped by nickname. They cannot be separated
        // retroactively, so each old case-insensitive nickname group becomes
        // one legacy UID. Every profile created after this migration is unique.
        const unassigned = this.db
            .prepare('SELECT lower(username) AS legacy_key, MIN(username) AS username, MIN(created_at) AS created_at FROM runs WHERE user_id IS NULL GROUP BY lower(username)')
            .all();
        if (unassigned.length > 0) {
            this.db.exec('BEGIN IMMEDIATE');
            try {
                for (const row of unassigned) {
                    const key = String(row.legacy_key);
                    this.db
                        .prepare('INSERT INTO users (username, avatar_id, created_at, legacy_key) VALUES (?, NULL, ?, ?) ON CONFLICT (legacy_key) DO NOTHING')
                        .run(String(row.username), Number(row.created_at), key);
                    this.db
                        .prepare('UPDATE runs SET user_id = (SELECT uid FROM users WHERE legacy_key = ?) WHERE user_id IS NULL AND lower(username) = ?')
                        .run(key, key);
                }
                this.db.exec('COMMIT');
            } catch (error) {
                try { this.db.exec('ROLLBACK'); } catch (rollbackError) { /* keep the migration error */ }
                throw error;
            }
        }

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_runs_user ON runs (user_id);
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

    /** Create one new profile for this page session, even when its display fields match another profile. */
    createUser(username: string, avatarId: string, now: number): number {
        const clean = sanitizeUsername(username);
        const avatar = sanitizeAvatarId(avatarId);
        if (!clean) throw new Error('INVALID_USERNAME');
        if (!avatar) throw new Error('INVALID_AVATAR');
        const result = this.db
            .prepare('INSERT INTO users (username, avatar_id, created_at) VALUES (?, ?, ?)')
            .run(clean, avatar, now);
        const uid = Number(result.lastInsertRowid);
        if (!Number.isSafeInteger(uid) || uid < 1) throw new Error('UID_OUT_OF_RANGE');
        return uid;
    }

    getUser(uid: number): UserProfile | null {
        if (!Number.isSafeInteger(uid) || uid < 1) return null;
        const row = this.db
            .prepare('SELECT uid, username, avatar_id, created_at FROM users WHERE uid = ?')
            .get(uid);
        if (!row) return null;
        return {
            uid: Number(row.uid),
            username: String(row.username),
            avatarId: row.avatar_id == null ? null : String(row.avatar_id),
            createdAt: Number(row.created_at),
        };
    }

    createRun(id: string, uid: number, now: number, mode: PlayMode = 'ai'): void {
        if (mode !== 'ai' && mode !== 'human') throw new Error('INVALID_MODE');
        const user = this.getUser(uid);
        if (!user) throw new Error('USER_NOT_FOUND');
        this.db
            .prepare('INSERT INTO runs (id, user_id, username, created_at, last_wave, mode) VALUES (?, ?, ?, ?, 0, ?)')
            .run(id, uid, user.username, now, mode);
    }

    getRun(id: string): RunRecord | null {
        const row = this.db
            .prepare('SELECT id, user_id, username, created_at, last_wave, prompt_head_id, mode FROM runs WHERE id = ?')
            .get(id);
        if (!row) return null;
        return {
            id: String(row.id),
            uid: Number(row.user_id),
            username: String(row.username),
            createdAt: Number(row.created_at),
            lastWave: Number(row.last_wave),
            promptHeadId: row.prompt_head_id == null ? null : String(row.prompt_head_id),
            mode: (row.mode === 'human' ? 'human' : 'ai') as PlayMode,
        };
    }

    /** Atomically append one version that really became active at a wave boundary. */
    recordPrompt(runId: string, uid: number, input: PromptInput, now: number): PromptWriteResult {
        const run = this.getRun(runId);
        if (!run) return { recorded: false, reason: 'RUN_NOT_FOUND' };
        if (run.uid !== uid) return { recorded: false, reason: 'UID_MISMATCH' };

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
                .prepare('INSERT INTO prompt_nodes (id, run_id, prev_id, version, prompt, from_wave, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(id, runId, currentRun.prompt_head_id == null ? null : currentRun.prompt_head_id, input.version, input.prompt, input.fromWave, now);
            this.db.prepare('UPDATE runs SET prompt_head_id = ? WHERE id = ?').run(id, runId);
            this.db.exec('COMMIT');
            return { recorded: true, version: input.version, fromWave: input.fromWave };
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (rollbackError) { /* preserve original error */ }
            throw error;
        }
    }

    /** Return the complete chain for this UID's current best AI run. */
    bestRunPrompts(uid: number): BestRunPrompts {
        const user = this.getUser(uid);
        if (!user) return { uid, username: '', runId: null, wave: null, prompts: [] };
        const selected = this.db
            .prepare(
                `SELECT r.id, r.username, w.wave, w.at_ms
                 FROM runs r JOIN wave_events w ON w.run_id = r.id
                 WHERE r.user_id = ? AND r.mode = 'ai'
                 ORDER BY w.wave DESC, w.at_ms ASC, r.id ASC
                 LIMIT 1`
            )
            .get(uid);
        if (!selected) return { uid, username: user.username, runId: null, wave: null, prompts: [] };

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
            uid,
            username: String(selected.username),
            runId: String(selected.id),
            wave: Number(selected.wave),
            prompts,
        };
    }

    /** Accept one monotonic server-recorded wave event for the owning UID. */
    recordWave(runId: string, uid: number, wave: number, now: number): WaveResult {
        const run = this.getRun(runId);
        if (!run) return { accepted: false, reason: 'RUN_NOT_FOUND' };
        if (run.uid !== uid) return { accepted: false, reason: 'UID_MISMATCH' };
        if (now - run.createdAt > RUN_TTL_MS) return { accepted: false, reason: 'RUN_EXPIRED' };
        if (!Number.isInteger(wave) || wave < 1 || wave > MAX_WAVE) {
            return { accepted: false, reason: 'WAVE_OUT_OF_RANGE' };
        }
        if (wave <= run.lastWave) return { accepted: false, reason: 'WAVE_NOT_INCREASING' };

        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.prepare('INSERT INTO wave_events (run_id, wave, at_ms) VALUES (?, ?, ?)').run(runId, wave, now);
            this.db.prepare('UPDATE runs SET last_wave = ? WHERE id = ?').run(wave, runId);
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
        return { accepted: true, bestWave: this.bestWaveOf(uid, run.mode) ?? wave };
    }

    bestWaveOf(uid: number, mode: PlayMode = 'ai'): number | null {
        const row = this.db
            .prepare('SELECT MAX(w.wave) AS best FROM wave_events w JOIN runs r ON r.id = w.run_id WHERE r.user_id = ? AND r.mode = ?')
            .get(uid, mode);
        return row && row.best != null ? Number(row.best) : null;
    }

    bestRecordOf(uid: number): { wave: number; mode: PlayMode } | null {
        const row = this.db
            .prepare(
                `WITH best AS (
                     SELECT r.mode AS mode, MAX(w.wave) AS best_wave, MIN(w.at_ms) AS achieved_at
                     FROM runs r JOIN wave_events w ON w.run_id = r.id
                     WHERE r.user_id = ?
                     GROUP BY r.mode
                 )
                 SELECT mode, best_wave AS wave FROM best
                 ORDER BY best_wave DESC, achieved_at ASC, mode ASC
                 LIMIT 1`
            )
            .get(uid);
        if (!row) return null;
        return { mode: (row.mode === 'human' ? 'human' : 'ai') as PlayMode, wave: Number(row.wave) };
    }

    top(limit: number, mode: LeaderboardMode = 'ai'): LeaderboardEntry[] {
        const modeFilter = mode === 'total' ? '' : 'WHERE r.mode = ?';
        const query = `
            WITH best AS (
                SELECT r.user_id AS uid, r.mode AS mode, MAX(w.wave) AS best_wave
                FROM runs r JOIN wave_events w ON w.run_id = r.id
                ${modeFilter}
                GROUP BY r.user_id, r.mode
            ),
            achieved AS (
                SELECT b.uid, b.mode, b.best_wave, MIN(w.at_ms) AS achieved_at,
                       u.username AS display_name, u.avatar_id AS avatar_id
                FROM best b
                JOIN runs r ON r.user_id = b.uid AND r.mode = b.mode
                JOIN wave_events w ON w.run_id = r.id AND w.wave = b.best_wave
                JOIN users u ON u.uid = b.uid
                GROUP BY b.uid, b.mode, b.best_wave, u.username, u.avatar_id
            )
            SELECT uid, display_name AS username, avatar_id AS avatarId,
                   best_wave AS wave, achieved_at AS achievedAt, mode
            FROM achieved
            ORDER BY best_wave DESC, achieved_at ASC, uid ASC
            LIMIT ?
        `;
        const rows = mode === 'total' ? this.db.prepare(query).all(limit) : this.db.prepare(query).all(mode, limit);
        return rows.map((row: any) => ({
            uid: Number(row.uid),
            username: String(row.username),
            avatarId: row.avatarId == null ? null : String(row.avatarId),
            wave: Number(row.wave),
            achievedAt: Number(row.achievedAt),
            mode: (row.mode === 'human' ? 'human' : 'ai') as PlayMode,
        }));
    }

    rankOf(uid: number, mode: LeaderboardMode = 'ai'): number | null {
        const modeFilter = mode === 'total' ? '' : 'WHERE r.mode = ?';
        const query = `
            WITH best AS (
                SELECT r.user_id AS uid, r.mode AS mode, MAX(w.wave) AS best_wave
                FROM runs r JOIN wave_events w ON w.run_id = r.id
                ${modeFilter}
                GROUP BY r.user_id, r.mode
            ),
            achieved AS (
                SELECT b.uid, b.mode, b.best_wave, MIN(w.at_ms) AS achieved_at
                FROM best b
                JOIN runs r ON r.user_id = b.uid AND r.mode = b.mode
                JOIN wave_events w ON w.run_id = r.id AND w.wave = b.best_wave
                GROUP BY b.uid, b.mode, b.best_wave
            ),
            ranked AS (
                SELECT uid, mode, ROW_NUMBER() OVER (
                    ORDER BY best_wave DESC, achieved_at ASC, uid ASC
                ) AS rank
                FROM achieved
            )
            SELECT MIN(rank) AS rank FROM ranked WHERE uid = ?
        `;
        const row = mode === 'total'
            ? this.db.prepare(query).get(uid)
            : this.db.prepare(query).get(mode, uid);
        return row && row.rank != null ? Number(row.rank) : null;
    }
}
