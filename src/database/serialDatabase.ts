import { AppError } from '@/utils/errors';
import type { RunResult, SqlDatabase, SqlDriver, SqlExecutor, SqlParams } from './types';

/**
 * Wraps a single SQLite connection and serializes access so that a
 * transaction is never interleaved with unrelated statements (expo-sqlite's
 * `withTransactionAsync` does not guarantee this on its own).
 */
export class SerialDatabase implements SqlDatabase {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly driver: SqlDriver) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private wrap<T>(task: () => Promise<T>): Promise<T> {
    return task().catch((error: unknown) => {
      if (error instanceof AppError) throw error;
      throw new AppError('database', error instanceof Error ? error.message : String(error), {
        cause: error,
      });
    });
  }

  private executor(): SqlExecutor {
    return {
      exec: (sql) => this.wrap(() => this.driver.exec(sql)),
      run: (sql, params = []) => this.wrap(() => this.driver.run(sql, params)),
      all: <T>(sql: string, params: SqlParams = []) => this.wrap(() => this.driver.all<T>(sql, params)),
      first: <T>(sql: string, params: SqlParams = []) => this.wrap(() => this.driver.first<T>(sql, params)),
    };
  }

  exec(sql: string): Promise<void> {
    return this.enqueue(() => this.executor().exec(sql));
  }

  run(sql: string, params: SqlParams = []): Promise<RunResult> {
    return this.enqueue(() => this.executor().run(sql, params));
  }

  all<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.enqueue(() => this.executor().all<T>(sql, params));
  }

  first<T>(sql: string, params: SqlParams = []): Promise<T | null> {
    return this.enqueue(() => this.executor().first<T>(sql, params));
  }

  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const tx = this.executor();
      await tx.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(tx);
        await tx.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          await this.driver.exec('ROLLBACK');
        } catch {
          // The transaction may already be rolled back by SQLite.
        }
        throw error;
      }
    });
  }

  close(): Promise<void> {
    return this.enqueue(() => this.driver.close());
  }
}
