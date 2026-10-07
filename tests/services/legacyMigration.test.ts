import AsyncStorage from '@react-native-async-storage/async-storage';

import { LEGACY_MIGRATION_KEY, migrateLegacyAsyncStorage } from '@/services/legacyMigration';
import { metaRepository } from '@/repositories/metaRepository';
import { servicesFor, setupDb } from '../helpers/fixtures';

async function seedLegacy() {
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([
    [
      'meals_2024-03-10',
      JSON.stringify([
        { id: 'b7c2a3e4-1111-4a5b-9c8d-000000000002', title: 'Борщ', calories: 350, createdAt: '2024-03-10' },
        { id: 'b7c2a3e4-1111-4a5b-9c8d-000000000001', title: 'Kaurapuuro', calories: 210.4, createdAt: '2024-03-10' },
      ]),
    ],
    [
      'meals_2024-03-11',
      JSON.stringify([
        { id: 'dup', title: 'Apple', calories: '52' },
        { id: 'dup', title: 'Apple again', calories: 52 },
        { title: '', calories: 100 },
        { id: 'bad', title: 'Negative', calories: -10 },
        { id: 'nan', title: 'NaN', calories: 'abc' },
        'not an object',
      ]),
    ],
    ['meals_2024-03-12', '{not json'],
    ['meals_2024-02-30', '[]'],
    ['meals_notadate', '[]'],
    ['app_lang', 'fi'],
  ]);
}

describe('legacy AsyncStorage migration', () => {
  beforeEach(seedLegacy);

  it('imports valid legacy meals and reports invalid data', async () => {
    const db = await setupDb();
    const report = await migrateLegacyAsyncStorage(db, 'local');
    expect(report.status).toBe('completed');
    expect(report.keys).toBe(4);
    expect(report.entriesFound).toBe(8);
    expect(report.imported).toBe(5);
    expect(report.skippedInvalid).toBe(3);
    expect(report.invalidKeys.sort()).toEqual(['meals_2024-02-30', 'meals_2024-03-12']);

    const { meals } = servicesFor(db);
    const day1 = await meals.getDay('2024-03-10');
    // Legacy order was newest first; imported meals are chronological.
    expect(day1.map((m) => m.items[0]?.food_name)).toEqual(['Kaurapuuro', 'Борщ']);
    expect(day1[0]?.items[0]).toMatchObject({ calories: 210, quantity: 1, unit: 'serving', source: 'legacy' });
    const day2 = await meals.getDay('2024-03-11');
    expect(day2.map((m) => m.items[0]?.food_name)).toEqual(['—', 'Apple again', 'Apple']);
  });

  it('is idempotent: re-running (even forced) never duplicates records', async () => {
    const db = await setupDb();
    await migrateLegacyAsyncStorage(db, 'local');
    const again = await migrateLegacyAsyncStorage(db, 'local');
    expect(again.imported).toBe(5); // cached report returned
    const forced = await migrateLegacyAsyncStorage(db, 'local', { force: true });
    expect(forced.imported).toBe(0);
    expect(forced.alreadyPresent).toBe(5);
    const count = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM meals');
    expect(count?.n).toBe(5);
    const items = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM meal_items');
    expect(items?.n).toBe(5);
  });

  it('produces identical ids on a fresh database (deterministic)', async () => {
    const a = await setupDb();
    const b = await setupDb();
    await migrateLegacyAsyncStorage(a, 'local');
    await migrateLegacyAsyncStorage(b, 'local');
    const ids = async (db: typeof a) => (await db.all<{ id: string }>('SELECT id FROM meals ORDER BY id')).map((r) => r.id);
    expect(await ids(a)).toEqual(await ids(b));
  });

  it('keeps the original AsyncStorage data', async () => {
    const db = await setupDb();
    await migrateLegacyAsyncStorage(db, 'local');
    expect(await AsyncStorage.getItem('meals_2024-03-10')).toContain('Борщ');
  });

  it('enqueues imported records for synchronization and records completion', async () => {
    const db = await setupDb();
    await migrateLegacyAsyncStorage(db, 'local');
    const outbox = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox');
    expect(outbox?.n).toBe(10);
    expect(await metaRepository.getJson(db, LEGACY_MIGRATION_KEY)).toMatchObject({ status: 'completed' });
  });

  it('handles an empty store', async () => {
    await AsyncStorage.clear();
    const db = await setupDb();
    const report = await migrateLegacyAsyncStorage(db, 'local');
    expect(report.status).toBe('nothing_to_migrate');
    expect(report.imported).toBe(0);
  });

  it('rolls back completely when the database write fails', async () => {
    const db = await setupDb();
    await db.exec('DROP TABLE meal_items');
    await expect(migrateLegacyAsyncStorage(db, 'local')).rejects.toMatchObject({ code: 'migration' });
    const count = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM meals');
    expect(count?.n).toBe(0);
    expect(await metaRepository.get(db, LEGACY_MIGRATION_KEY)).toBeNull();
  });
});
