import Database from 'better-sqlite3';

import { SerialDatabase } from '@/database/serialDatabase';
import type { SqlDriver, SqlParams } from '@/database/types';

/** In-memory SQLite driver for Node tests (same SQL engine as the app). */
export function createNodeDriver(filename = ':memory:'): SqlDriver {
  const db = new Database(filename);
  const p = (params: SqlParams) => params as unknown[];
  return {
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params) => {
      const r = db.prepare(sql).run(...p(params));
      return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
    },
    all: async <T>(sql: string, params: SqlParams) => db.prepare(sql).all(...p(params)) as T[],
    first: async <T>(sql: string, params: SqlParams) =>
      (db.prepare(sql).get(...p(params)) as T | undefined) ?? null,
    close: async () => {
      db.close();
    },
  };
}

export function createTestDatabase(): SerialDatabase {
  return new SerialDatabase(createNodeDriver());
}
