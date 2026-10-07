import type { SqlExecutor } from '@/database/types';

/** Key/value storage for local app state (preferences, sync cursors, migration flags). */
export const metaRepository = {
  async get(db: SqlExecutor, key: string): Promise<string | null> {
    const row = await db.first<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
    return row?.value ?? null;
  },

  async set(db: SqlExecutor, key: string, value: string): Promise<void> {
    await db.run(
      'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  },

  async remove(db: SqlExecutor, key: string): Promise<void> {
    await db.run('DELETE FROM app_meta WHERE key = ?', [key]);
  },

  async getJson<T>(db: SqlExecutor, key: string): Promise<T | null> {
    const raw = await this.get(db, key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setJson(db: SqlExecutor, key: string, value: unknown): Promise<void> {
    await this.set(db, key, JSON.stringify(value));
  },
};
