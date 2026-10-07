import { BACKUP_VERSION, backupRecordCount, parseBackup } from '@/services/backupService';
import { localDateTimeToIso } from '@/utils/dates';
import { item, servicesFor, setupDb } from '../helpers/fixtures';

const USER = '11111111-1111-4111-8111-111111111111';

async function seeded() {
  const db = await setupDb();
  const s = servicesFor(db);
  const foodId = await s.foods.create({
    name: 'Oat porridge',
    brand: null,
    barcode: null,
    serving_size: 250,
    serving_unit: 'g',
    calories: 180,
    protein_g: 6,
    carbs_g: 30,
    fat_g: 3,
    fiber_g: 4,
    sugar_g: null,
    salt_g: null,
  });
  await s.foods.setFavorite(foodId, true);
  await s.goals.setGoal('calories', 2100);
  const mealId = await s.meals.createMeal(
    {
      local_date: '2024-05-01',
      eaten_at: localDateTimeToIso('2024-05-01', '08:15'),
      meal_type: 'breakfast',
      title: null,
      notes: null,
    },
    [
      item({ food_name: 'Egg, "boiled"', quantity: 2, calories: 140 }),
      item({ food_name: '=HYPERLINK("x")', calories: 10 }),
    ],
  );
  await s.weight.add({
    measured_at: '2024-05-01T06:00:00.000Z',
    weight_kg: 72.5,
    notes: null,
  });
  await s.water.add({
    consumed_at: '2024-05-01T09:00:00.000Z',
    local_date: '2024-05-01',
    amount_ml: 250,
  });
  const deleted = await s.weight.add({
    measured_at: '2024-04-01T06:00:00.000Z',
    weight_kg: 80,
    notes: null,
  });
  await s.weight.remove(deleted);
  return { db, s, foodId, mealId };
}

const count = async (db: Awaited<ReturnType<typeof setupDb>>, table: string, where = 'deleted_at IS NULL') =>
  (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`))!.n;

describe('BackupService export', () => {
  it('exports live records without ownership or sync metadata', async () => {
    const { s } = await seeded();
    const backup = await s.backup.exportBackup('2024-05-02T00:00:00.000Z');
    expect(backup).toMatchObject({
      format: 'nutrition-tracker-backup',
      version: BACKUP_VERSION,
      app_version: 'test',
    });
    expect(backup.data.foods).toHaveLength(1);
    expect(backup.data.favorite_foods).toHaveLength(1);
    expect(backup.data.meal_items).toHaveLength(2);
    expect(backup.data.weight_entries).toHaveLength(1);
    expect(backup.data).not.toHaveProperty('media_files');
    for (const row of Object.values(backup.data).flat()) {
      expect(row).not.toHaveProperty('user_id');
      expect(row).not.toHaveProperty('server_updated_at');
      expect(row).not.toHaveProperty('deleted_at');
    }
    expect(backupRecordCount(parseBackup(await s.backup.exportJson()))).toBe(8);
  });

  it('exports food entries as spreadsheet-safe CSV', async () => {
    const { s } = await seeded();
    const csv = await s.backup.exportCsv();
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n');
    expect(lines[0]).toBe(
      'date,time,meal,food,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,salt_g,source',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^2024-05-01,08:15,breakfast,"Egg, ""boiled""",2,piece,140,/);
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('parseBackup', () => {
  const envelope = (data: unknown, version = 1) =>
    JSON.stringify({
      format: 'nutrition-tracker-backup',
      version,
      exported_at: '2024-01-01T00:00:00Z',
      data,
    });

  it('rejects malformed and foreign files', () => {
    expect(() => parseBackup('not json')).toThrow(expect.objectContaining({ code: 'invalid_import' }));
    expect(() => parseBackup('{"hello":1}')).toThrow(expect.objectContaining({ code: 'invalid_import' }));
    expect(() => parseBackup(envelope({ meals: [{ id: 'x' }] }))).toThrow(
      expect.objectContaining({ code: 'invalid_import' }),
    );
  });

  it('rejects newer versions', () => {
    expect(() => parseBackup(envelope({}, BACKUP_VERSION + 1))).toThrow(
      expect.objectContaining({
        code: 'unsupported_version',
        details: { version: BACKUP_VERSION + 1 },
      }),
    );
  });

  it('collapses duplicate ids to the newest copy and ignores unknown fields', () => {
    const water = (updated_at: string, amount_ml: number) => ({
      id: '22222222-2222-4222-8222-222222222222',
      created_at: '2024-01-01T00:00:00Z',
      updated_at,
      consumed_at: '2024-01-01T08:00:00Z',
      local_date: '2024-01-01',
      amount_ml,
      extra: 'ignored',
    });
    const backup = parseBackup(
      `\uFEFF${envelope({ water_entries: [water('2024-01-02T00:00:00Z', 300), water('2024-01-01T00:00:00Z', 200)] })}`,
    );
    expect(backup.data.water_entries).toHaveLength(1);
    expect(backup.data.water_entries[0]).toMatchObject({ amount_ml: 300 });
    expect(backup.data.water_entries[0]).not.toHaveProperty('extra');
    expect(backup.data.meals).toEqual([]);
  });
});

describe('BackupService restore', () => {
  it('restores into an empty database and queues everything for sync', async () => {
    const { s } = await seeded();
    const json = await s.backup.exportJson();

    const db = await setupDb();
    const owner = { id: USER };
    const target = servicesFor(db, owner);
    const result = await target.backup.restore(parseBackup(json));
    expect(result).toEqual({ inserted: 8, updated: 0, skipped: 0 });
    expect(await count(db, 'meal_items', `user_id = '${USER}'`)).toBe(2);
    expect(await count(db, 'sync_outbox', '1')).toBe(8);
    expect((await target.goals.getGoals()).calories).toBe(2100);
    expect(await target.foods.favorites()).toHaveLength(1);
  });

  it('is idempotent and only replaces records with newer versions', async () => {
    const { db, s, mealId } = await seeded();
    const backup = parseBackup(await s.backup.exportJson());
    expect(await s.backup.restore(backup)).toEqual({
      inserted: 0,
      updated: 0,
      skipped: 8,
    });

    // Local edit after the backup: the local version wins.
    await s.meals.updateMeal(mealId, { title: 'Local title' });
    // Newer copy in the file: the backup wins.
    const newer = structuredClone(backup);
    newer.data.weight_entries[0] = {
      ...newer.data.weight_entries[0]!,
      weight_kg: 71,
      updated_at: '2999-01-01T00:00:00.000Z',
    };
    newer.data.meals[0] = { ...newer.data.meals[0]!, title: 'Old title' };
    expect(await s.backup.restore(newer)).toEqual({
      inserted: 0,
      updated: 1,
      skipped: 7,
    });
    expect((await s.meals.getMeal(mealId))?.title).toBe('Local title');
    expect(
      (await db.first<{ weight_kg: number }>('SELECT weight_kg FROM weight_entries WHERE deleted_at IS NULL'))
        ?.weight_kg,
    ).toBe(71);
  });

  it('merges goals and favorites by their natural key', async () => {
    const { s } = await seeded();
    const backup = parseBackup(await s.backup.exportJson());
    const db = await setupDb();
    const t = servicesFor(db);
    await t.goals.setGoal('calories', 1800);
    const goal = backup.data.nutrition_goals[0]!;
    backup.data.nutrition_goals[0] = {
      ...goal,
      id: '33333333-3333-4333-8333-333333333333',
      updated_at: '2999-01-01T00:00:00.000Z',
    };
    const result = await t.backup.restore(backup);
    expect(result.updated).toBe(1);
    expect((await t.goals.getGoals()).calories).toBe(2100);
    expect(await count(db, 'nutrition_goals')).toBe(1);
  });

  it('skips records whose parent is missing or that violate local constraints', async () => {
    const { s } = await seeded();
    const backup = parseBackup(await s.backup.exportJson());
    backup.data.meals = [];
    backup.data.water_entries[0] = {
      ...backup.data.water_entries[0]!,
      amount_ml: 50000,
    };
    const db = await setupDb();
    const result = await servicesFor(db).backup.restore(backup);
    expect(result).toEqual({ inserted: 4, updated: 0, skipped: 3 });
    expect(await count(db, 'meal_items')).toBe(0);
    expect(await count(db, 'water_entries')).toBe(0);
  });
});
