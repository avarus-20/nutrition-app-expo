export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

/** Statement-level operations available both inside and outside transactions. */
export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  first<T>(sql: string, params?: SqlParams): Promise<T | null>;
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Runs `fn` inside an exclusive transaction. Other statements issued on the
   * database while the transaction is open wait until it commits/rolls back.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Minimal driver that platform adapters implement. */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlParams): Promise<RunResult>;
  all<T>(sql: string, params: SqlParams): Promise<T[]>;
  first<T>(sql: string, params: SqlParams): Promise<T | null>;
  close(): Promise<void>;
}
