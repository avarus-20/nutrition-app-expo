import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

import { ENTITY_ORDER, remoteColumns } from '../src/database/schema';
import { asUser, asUserCommit, createMigratedDatabase, createUser, insertRow, mealRow, upsertRow } from './helpers';

let client: Client;
let drop: () => Promise<void>;
let alice: string;
let bob: string;

beforeAll(async () => {
  ({ client, drop } = await createMigratedDatabase());
  alice = await createUser(client, 'alice@example.com');
  bob = await createUser(client, 'bob@example.com');
});

afterAll(async () => {
  await drop();
});

function itemRow(userId: string, mealId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    user_id: userId,
    meal_id: mealId,
    food_name: 'Oats',
    quantity: 50,
    unit: 'g',
    calories: 190,
    updated_at: '2024-05-01T08:00:00Z',
    ...overrides,
  };
}

describe('schema', () => {
  it('matches the client table registry column-for-column', async () => {
    for (const entity of ENTITY_ORDER) {
      const r = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [entity],
      );
      expect(r.rows.map((x) => x.column_name).sort()).toEqual(remoteColumns(entity).sort());
    }
  });

  it('creates profile and settings for new auth users', async () => {
    const p = await client.query('SELECT * FROM public.profiles WHERE id = $1', [alice]);
    const s = await client.query('SELECT * FROM public.user_settings WHERE user_id = $1', [alice]);
    expect(p.rowCount).toBe(1);
    expect(s.rows[0]).toMatchObject({ theme: 'system' });
  });

  it('enables RLS on every public table', async () => {
    const r = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(12);
    expect(r.rows.filter((x) => !x.relrowsecurity)).toEqual([]);
  });

  it('has the required indexes', async () => {
    const r = await client.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'`);
    const defs = r.rows.map((x) => x.indexdef).join('\n');
    expect(defs).toMatch(/meals USING btree \(user_id, eaten_at\)/);
    expect(defs).toMatch(/meal_items USING btree \(meal_id\)/);
    expect(defs).toMatch(/weight_entries USING btree \(user_id, measured_at\)/);
    expect(defs).toMatch(/media_files USING btree \(user_id, meal_id\)/);
  });
});

describe('constraints', () => {
  it('rejects negative nutrition values and non-positive quantity', async () => {
    await asUser(client, alice, async (c) => {
      const meal = mealRow(alice);
      await insertRow(c, 'meals', meal);
      await c.query('SAVEPOINT s');
      await expect(insertRow(c, 'meal_items', itemRow(alice, meal.id, { calories: -1 }))).rejects.toThrow(/check/);
      await c.query('ROLLBACK TO SAVEPOINT s');
      await expect(insertRow(c, 'meal_items', itemRow(alice, meal.id, { protein_g: -2 }))).rejects.toThrow(/check/);
      await c.query('ROLLBACK TO SAVEPOINT s');
      await expect(insertRow(c, 'meal_items', itemRow(alice, meal.id, { quantity: 0 }))).rejects.toThrow(/check/);
      await c.query('ROLLBACK TO SAVEPOINT s');
      await expect(insertRow(c, 'meals', mealRow(alice, { meal_type: 'brunch' }))).rejects.toThrow(/check/);
      await c.query('ROLLBACK TO SAVEPOINT s');
      const ok = await insertRow(c, 'meal_items', itemRow(alice, meal.id, { protein_g: null }));
      expect(ok.rowCount).toBe(1);
    });
  });

  it('keeps media inside the owner folder', async () => {
    await asUser(client, alice, async (c) => {
      const meal = mealRow(alice);
      await insertRow(c, 'meals', meal);
      const media = { id: randomUUID(), user_id: alice, meal_id: meal.id, mime_type: 'image/jpeg' };
      await c.query('SAVEPOINT s');
      await expect(insertRow(c, 'media_files', { ...media, storage_path: `${bob}/photo/x.jpg` })).rejects.toThrow(/check/);
      await c.query('ROLLBACK TO SAVEPOINT s');
      await expect(
        insertRow(c, 'media_files', { ...media, storage_path: `${alice}/../${bob}/x.jpg` }),
      ).rejects.toThrow(/check/);
      await c.query('ROLLBACK TO SAVEPOINT s');
      const ok = await insertRow(c, 'media_files', { ...media, storage_path: `${alice}/photo/${media.id}.jpg` });
      expect(ok.rowCount).toBe(1);
    });
  });

  it('enforces one goal per nutrient per user', async () => {
    await asUser(client, alice, async (c) => {
      await insertRow(c, 'nutrition_goals', { id: randomUUID(), user_id: alice, nutrient: 'calories', target: 2000 });
      await expect(
        insertRow(c, 'nutrition_goals', { id: randomUUID(), user_id: alice, nutrient: 'calories', target: 1800 }),
      ).rejects.toThrow(/duplicate key/);
    });
  });
});

describe('row level security', () => {
  let aliceMeal: ReturnType<typeof mealRow>;

  beforeAll(async () => {
    aliceMeal = mealRow(alice);
    await asUserCommit(client, alice, async (c) => {
      await insertRow(c, 'meals', aliceMeal);
      await insertRow(c, 'meal_items', itemRow(alice, aliceMeal.id));
    });
  });

  it('lets owners read their records', async () => {
    const rows = await asUser(client, alice, (c) => c.query('SELECT id FROM public.meals WHERE id = $1', [aliceMeal.id]));
    expect(rows.rowCount).toBe(1);
  });

  it('hides other users records', async () => {
    const meals = await asUser(client, bob, (c) => c.query('SELECT * FROM public.meals'));
    const items = await asUser(client, bob, (c) => c.query('SELECT * FROM public.meal_items'));
    expect(meals.rowCount).toBe(0);
    expect(items.rowCount).toBe(0);
  });

  it('prevents modifying other users records', async () => {
    const r = await asUser(client, bob, (c) =>
      c.query("UPDATE public.meals SET title = 'hacked', updated_at = now() WHERE id = $1", [aliceMeal.id]),
    );
    expect(r.rowCount).toBe(0);
    const check = await client.query('SELECT title FROM public.meals WHERE id = $1', [aliceMeal.id]);
    expect(check.rows[0].title).toBe('Porridge');
  });

  it('prevents hijacking a record id through upsert', async () => {
    await expect(
      asUser(client, bob, (c) => upsertRow(c, 'meals', { ...aliceMeal, user_id: bob, updated_at: '2030-01-01T00:00:00Z' })),
    ).rejects.toThrow(/row-level security/);
  });

  it('prevents inserting records for another user', async () => {
    await expect(asUser(client, bob, (c) => insertRow(c, 'meals', mealRow(alice)))).rejects.toThrow(/row-level security/);
  });

  it('prevents attaching items to another users meal', async () => {
    await expect(
      asUser(client, bob, (c) => insertRow(c, 'meal_items', itemRow(bob, aliceMeal.id))),
    ).rejects.toThrow(/foreign key/);
  });

  it('forbids hard deletes of synchronized rows', async () => {
    await expect(
      asUser(client, alice, (c) => c.query('DELETE FROM public.meals WHERE id = $1', [aliceMeal.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it('denies anonymous access', async () => {
    await expect(asUser(client, null, (c) => c.query('SELECT * FROM public.meals'))).rejects.toThrow(/permission denied/);
  });

  it('isolates profiles and settings', async () => {
    const p = await asUser(client, bob, (c) => c.query('SELECT * FROM public.profiles'));
    expect(p.rows.map((r) => r.id)).toEqual([bob]);
    const u = await asUser(client, bob, (c) =>
      c.query("UPDATE public.user_settings SET theme = 'dark' WHERE user_id = $1", [alice]),
    );
    expect(u.rowCount).toBe(0);
  });
});

describe('sync trigger (last-write-wins)', () => {
  it('assigns server timestamps and versions, applies newer writes and ignores stale ones', async () => {
    const meal = mealRow(alice, { updated_at: '2024-05-01T10:00:00Z', version: 99 });
    const inserted = await asUserCommit(client, alice, (c) => insertRow(c, 'meals', meal));
    expect(inserted.rows[0].version).toBe(1);
    const firstServerTs = inserted.rows[0].server_updated_at as Date;

    // Newer client write wins.
    const newer = await asUserCommit(client, alice, (c) =>
      upsertRow(c, 'meals', { ...meal, title: 'Newer', updated_at: '2024-05-01T11:00:00Z', version: 1 }),
    );
    expect(newer.rows[0]).toMatchObject({ title: 'Newer', version: 2 });
    expect((newer.rows[0].server_updated_at as Date).getTime()).toBeGreaterThan(firstServerTs.getTime());

    // Stale write (older updated_at) is ignored.
    const stale = await asUserCommit(client, alice, (c) =>
      upsertRow(c, 'meals', { ...meal, title: 'Stale', updated_at: '2024-05-01T10:30:00Z' }),
    );
    expect(stale.rowCount).toBe(0);

    // Retrying the exact same change is a no-op (idempotent).
    const retry = await asUserCommit(client, alice, (c) =>
      upsertRow(c, 'meals', { ...meal, title: 'Newer', updated_at: '2024-05-01T11:00:00Z' }),
    );
    expect(retry.rowCount).toBe(0);

    const final = await client.query('SELECT title, version FROM public.meals WHERE id = $1', [meal.id]);
    expect(final.rows[0]).toEqual({ title: 'Newer', version: 2 });
  });

  it('propagates soft deletion as a normal newer write', async () => {
    const meal = mealRow(alice);
    await asUserCommit(client, alice, (c) => insertRow(c, 'meals', meal));
    await asUserCommit(client, alice, (c) =>
      upsertRow(c, 'meals', { ...meal, deleted_at: '2024-05-02T00:00:00Z', updated_at: '2024-05-02T00:00:00Z' }),
    );
    const r = await client.query('SELECT deleted_at FROM public.meals WHERE id = $1', [meal.id]);
    expect(r.rows[0].deleted_at).not.toBeNull();
  });

  it('clamps client clocks running far ahead', async () => {
    const meal = mealRow(alice, { updated_at: '2099-01-01T00:00:00Z' });
    const r = await asUserCommit(client, alice, (c) => insertRow(c, 'meals', meal));
    expect((r.rows[0].updated_at as Date).getFullYear()).toBeLessThan(2099);
  });
});

describe('storage policies', () => {
  it('limits object access to the owner folder of the private bucket', async () => {
    const bucket = await client.query("SELECT public FROM storage.buckets WHERE id = 'user-media'");
    expect(bucket.rows[0].public).toBe(false);

    await asUserCommit(client, alice, (c) =>
      c.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('user-media', $1)", [`${alice}/photo/a.jpg`]),
    );
    await expect(
      asUser(client, alice, (c) =>
        c.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('user-media', $1)", [`${bob}/photo/x.jpg`]),
      ),
    ).rejects.toThrow(/row-level security/);

    const bobView = await asUser(client, bob, (c) => c.query('SELECT name FROM storage.objects'));
    expect(bobView.rowCount).toBe(0);
    const aliceView = await asUser(client, alice, (c) => c.query('SELECT name FROM storage.objects'));
    expect(aliceView.rowCount).toBe(1);
    const bobDelete = await asUser(client, bob, (c) => c.query('DELETE FROM storage.objects'));
    expect(bobDelete.rowCount).toBe(0);
  });
});
