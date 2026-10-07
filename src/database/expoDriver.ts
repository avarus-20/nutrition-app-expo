import * as SQLite from 'expo-sqlite';

import type { RunResult, SqlDriver, SqlParams } from './types';

export async function openExpoDriver(name: string): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  const bind = (params: SqlParams) => params as SQLite.SQLiteBindValue[];
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params): Promise<RunResult> => {
      const r = await db.runAsync(sql, bind(params));
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T>(sql: string, params: SqlParams) => db.getAllAsync<T>(sql, bind(params)),
    first: <T>(sql: string, params: SqlParams) => db.getFirstAsync<T>(sql, bind(params)),
    close: () => db.closeAsync(),
  };
}
