import { getSchemaVersion, migrate, MIGRATIONS } from '@/database/migrations';
import { ENTITY_ORDER, localColumns } from '@/database/schema';
import { AppError } from '@/utils/errors';
import { createTestDatabase } from '../helpers/nodeDriver';

describe('SQLite migrations', () => {
  it('migrates an empty database to the latest version', async () => {
    const db = createTestDatabase();
    const v = await migrate(db);
    expect(v).toBe(MIGRATIONS[MIGRATIONS.length - 1]?.version);
    expect(await getSchemaVersion(db)).toBe(v);
  });

  it('is idempotent', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await migrate(db);
    const rows = await db.all('SELECT * FROM schema_migrations');
    expect(rows).toHaveLength(MIGRATIONS.length);
  });

  it('creates every column declared in the table registry', async () => {
    const db = createTestDatabase();
    await migrate(db);
    for (const entity of ENTITY_ORDER) {
      const cols = await db.all<{ name: string }>(`PRAGMA table_info(${entity})`);
      const names = cols.map((c) => c.name).sort();
      expect(names).toEqual([...localColumns(entity)].sort());
    }
  });

  it('rolls back a failing migration and keeps the previous version', async () => {
    const db = createTestDatabase();
    await migrate(db);
    const broken = [
      ...MIGRATIONS,
      { version: 999, name: 'broken', statements: ['CREATE TABLE ok_table (id TEXT)', 'THIS IS NOT SQL'] },
    ];
    await expect(migrate(db, broken)).rejects.toMatchObject({ code: 'migration' });
    expect(await getSchemaVersion(db)).toBe(MIGRATIONS.length);
    const t = await db.first("SELECT name FROM sqlite_master WHERE name = 'ok_table'");
    expect(t).toBeNull();
  });

  it('refuses to run against a newer schema', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await db.run("INSERT INTO schema_migrations VALUES (1000, 'future', '2030-01-01')");
    await expect(migrate(db)).rejects.toBeInstanceOf(AppError);
  });

  it('enforces integrity constraints', async () => {
    const db = createTestDatabase();
    await migrate(db);
    const now = new Date().toISOString();
    const meal = `INSERT INTO meals (id, user_id, eaten_at, local_date, meal_type, created_at, updated_at) VALUES (?, 'u', ?, '2024-01-01', ?, ?, ?)`;
    await db.run(meal, ['m1', now, 'lunch', now, now]);
    await expect(db.run(meal, ['m2', now, 'brunch', now, now])).rejects.toBeInstanceOf(AppError);

    const itemSql = `INSERT INTO meal_items (id, user_id, meal_id, food_name, quantity, unit, calories, protein_g, created_at, updated_at)
      VALUES (?, 'u', ?, 'x', ?, 'g', ?, ?, ?, ?)`;
    await db.run(itemSql, ['i1', 'm1', 1, 10, null, now, now]);
    await expect(db.run(itemSql, ['i2', 'm1', 1, -1, null, now, now])).rejects.toThrow(/CHECK/);
    await expect(db.run(itemSql, ['i3', 'm1', 0, 1, null, now, now])).rejects.toThrow(/CHECK/);
    await expect(db.run(itemSql, ['i4', 'm1', 1, 1, -2, now, now])).rejects.toThrow(/CHECK/);
    await expect(db.run(itemSql, ['i5', 'missing-meal', 1, 1, null, now, now])).rejects.toThrow(/FOREIGN KEY/);
  });
});
