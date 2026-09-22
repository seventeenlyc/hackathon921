// SQLite 连接。
//
// 用 Node 22 内置的 node:sqlite（免 --experimental-sqlite 需 Node >= 22.13），
// 因此后端没有任何运行时 npm 依赖 —— 见 docs/PRODUCT_CONCEPT.md §14。

import { DatabaseSync } from 'node:sqlite';

/**
 * 打开（或创建）排行榜数据库。
 *
 * - WAL：读写不互相阻塞，适合「频繁写入 + 偶尔读取排行榜」的形态。
 * - busy_timeout：并发写入撞锁时等待而不是立即抛错。
 * - foreign_keys：wave_events 引用 runs，删 run 时不留孤儿行。
 */
export function openDatabase(path: string): any {
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 3000;');
    db.exec('PRAGMA foreign_keys = ON;');
    return db;
}
