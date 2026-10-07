import { wipeAccountData } from '@/auth/claimLocalData';
import type { SqlDatabase } from '@/database/types';
import { baseRow, insertEntity } from '@/repositories/base';
import { backoffMs, SyncEngine } from '@/sync/syncEngine';
import { FakeRemote } from '../helpers/fakeRemote';
import { item, servicesFor, setupDb } from '../helpers/fixtures';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DAY = '2024-05-01';

interface Device {
  db: SqlDatabase;
  engine: SyncEngine;
  s: ReturnType<typeof servicesFor>;
  owner: { id: string };
}

async function device(remote: FakeRemote, opts: Partial<ConstructorParameters<typeof SyncEngine>[2]> = {}): Promise<Device> {
  const db = await setupDb();
  const owner = { id: USER };
  const engine = new SyncEngine(db, remote, {
    userId: () => owner.id,
    pullOverlapMs: 0,
    deviceInfo: () => ({ platform: 'other', appVersion: 'test' }),
    ...opts,
  });
  return { db, engine, s: servicesFor(db, owner), owner };
}

async function outboxCount(db: SqlDatabase) {
  return (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox'))?.n ?? 0;
}

describe('SyncEngine', () => {
  let remote: FakeRemote;
  beforeEach(() => {
    remote = new FakeRemote();
    remote.authUser = USER;
  });

  it('skips when signed out', async () => {
    const a = await device(remote);
    a.owner.id = 'local';
    await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    expect((await a.engine.sync()).status).toBe('skipped');
    expect(remote.upsertCalls).toBe(0);
  });

  it('pushes local changes, clears the outbox and pulls server metadata back', async () => {
    const a = await device(remote);
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item(), item({ food_name: 'Tea' })]);
    expect(await outboxCount(a.db)).toBe(3);
    const r = await a.engine.sync();
    expect(r).toMatchObject({ status: 'ok', pushed: 3, failed: 0 });
    expect(await outboxCount(a.db)).toBe(0);
    expect(remote.table('meals').get(mealId)).toMatchObject({ user_id: USER, version: 1 });
    expect(remote.table('meal_items').size).toBe(2);
    const local = await a.db.first<{ version: number; server_updated_at: string }>('SELECT version, server_updated_at FROM meals');
    expect(local?.version).toBe(1);
    expect(local?.server_updated_at).toBeTruthy();
    expect(remote.devices.size).toBe(1);
    expect(await a.engine.lastSyncedAt()).not.toBeNull();
  });

  it('does not re-apply rows re-read through the overlap window', async () => {
    const a = await device(remote, { pullOverlapMs: 10 * 60_000 });
    await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    await a.engine.sync();
    const again = await a.engine.sync();
    expect(again).toMatchObject({ status: 'ok', pulled: 0 });
  });

  it('keeps data queued when the network fails and retries later', async () => {
    const a = await device(remote);
    await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    remote.failNext('network');
    expect((await a.engine.sync()).status).toBe('offline');
    expect(await outboxCount(a.db)).toBe(2);
    expect((await a.engine.sync()).status).toBe('ok');
    expect(await outboxCount(a.db)).toBe(0);
    expect(remote.table('meals').size).toBe(1);
  });

  it('never duplicates records when a request is retried after a lost response', async () => {
    const a = await device(remote);
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    remote.failNext('lost-response'); // server applied the meals batch, client saw an error
    expect((await a.engine.sync()).status).toBe('offline');
    expect(await outboxCount(a.db)).toBe(2);
    await a.engine.sync();
    await a.engine.sync();
    expect(remote.table('meals').size).toBe(1);
    expect(remote.table('meals').get(mealId)?.version).toBe(1);
    expect(remote.table('meal_items').size).toBe(1);
  });

  it('keeps an entity queued if it is modified while being pushed', async () => {
    const a = await device(remote);
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    const original = remote.upsert.bind(remote);
    let edited = false;
    remote.upsert = async (entity, rows) => {
      await original(entity, rows);
      if (entity === 'meals' && !edited) {
        edited = true;
        await a.s.meals.updateMeal(mealId, { notes: 'changed during push' });
      }
    };
    await a.engine.sync();
    // The follow-up run (triggered by the pending entry) pushes the new revision.
    await a.engine.sync();
    expect(remote.table('meals').get(mealId)?.notes).toBe('changed during push');
    expect(await outboxCount(a.db)).toBe(0);
  });

  it('isolates a rejected record, backs off and still pushes the others', async () => {
    let now = new Date('2025-01-01T00:00:00Z');
    const a = await device(remote, { now: () => now });
    await a.s.weight.add({ measured_at: '2024-05-01T07:00:00.000Z', weight_kg: 80, notes: null });
    const bad = await a.s.weight.add({ measured_at: '2024-05-02T07:00:00.000Z', weight_kg: 81, notes: null });
    await a.s.weight.add({ measured_at: '2024-05-03T07:00:00.000Z', weight_kg: 82, notes: null });
    remote.rejectIds.add(bad);
    const r = await a.engine.sync();
    expect(r.status).toBe('partial');
    expect(r.pushed).toBe(2);
    expect(r.failed).toBe(1);
    const entry = await a.db.first<{ attempts: number; next_attempt_at: string; last_error: string }>(
      'SELECT attempts, next_attempt_at, last_error FROM sync_outbox',
    );
    expect(entry?.attempts).toBe(1);
    expect(entry?.last_error).toMatch(/check constraint/);
    expect(new Date(entry!.next_attempt_at).getTime()).toBe(now.getTime() + backoffMs(1));

    const calls = remote.upsertCalls;
    await a.engine.sync(); // not due yet
    expect(remote.upsertCalls).toBe(calls);

    remote.rejectIds.clear();
    now = new Date(now.getTime() + backoffMs(1) + 1);
    expect((await a.engine.sync()).status).toBe('ok');
    expect(remote.table('weight_entries').size).toBe(3);
  });

  it('syncs between two devices, including edits and soft deletion', async () => {
    const a = await device(remote);
    const b = await device(remote);
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'dinner' }, [item({ food_name: 'Soup' })]);
    await a.s.goals.setGoal('calories', 2100);
    await a.engine.sync();
    await b.engine.sync();
    expect((await b.s.meals.getDay(DAY))[0]?.items[0]?.food_name).toBe('Soup');
    expect(await b.s.goals.getGoals()).toEqual({ calories: 2100 });

    await b.s.meals.updateMeal(mealId, { title: 'Edited on B' });
    await b.engine.sync();
    await a.engine.sync();
    expect((await a.s.meals.getMeal(mealId))?.title).toBe('Edited on B');

    await a.s.meals.deleteMeal(mealId);
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.s.meals.getDay(DAY)).toEqual([]);
    expect(remote.table('meals').get(mealId)?.deleted_at).not.toBeNull();
  });

  it('resolves concurrent offline edits with last-write-wins on updated_at', async () => {
    const a = await device(remote);
    const b = await device(remote);
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'dinner' }, [item()]);
    await a.engine.sync();
    await b.engine.sync();

    // Both edit offline; B edits later.
    await a.s.meals.updateMeal(mealId, { notes: 'from A' });
    await new Promise((r) => setTimeout(r, 5));
    await b.s.meals.updateMeal(mealId, { notes: 'from B (newer)' });

    // B syncs first, then A: A's older write is ignored by the server and A
    // adopts B's version on pull.
    await b.engine.sync();
    await a.engine.sync();
    expect(remote.table('meals').get(mealId)?.notes).toBe('from B (newer)');
    expect((await a.s.meals.getMeal(mealId))?.notes).toBe('from B (newer)');
    expect(await outboxCount(a.db)).toBe(0);

    // Reverse order: A edits later but B pushes after A pulled... newer local survives pull.
    await b.s.meals.updateMeal(mealId, { notes: 'B again' });
    await new Promise((r) => setTimeout(r, 5));
    await a.s.meals.updateMeal(mealId, { notes: 'A newest' });
    await b.engine.sync();
    await a.engine.sync();
    await b.engine.sync();
    expect(remote.table('meals').get(mealId)?.notes).toBe('A newest');
    expect((await b.s.meals.getMeal(mealId))?.notes).toBe('A newest');
  });

  it('pages through many rows with identical server timestamps without looping', async () => {
    remote.frozenClock = true;
    const a = await device(remote, { pullPageSize: 2 });
    for (let i = 0; i < 7; i += 1) {
      await a.s.water.add({ consumed_at: '2024-05-01T07:00:00.000Z', local_date: DAY, amount_ml: 100 + i });
    }
    await a.engine.sync();
    const b = await device(remote, { pullPageSize: 2 });
    await b.engine.sync();
    expect(await b.s.water.forDay(DAY)).toHaveLength(7);
  });

  it('ignores invalid server rows and rows of other users without failing the sync', async () => {
    const a = await device(remote);
    const now = new Date().toISOString();
    remote.put('weight_entries', { id: '33333333-3333-4333-8333-333333333333', user_id: USER, measured_at: now, weight_kg: -5, notes: null, created_at: now, updated_at: now, deleted_at: null });
    remote.put('weight_entries', { id: '44444444-4444-4444-8444-444444444444', user_id: USER, measured_at: now, weight_kg: 70, notes: null, created_at: now, updated_at: now, deleted_at: null });
    const r = await a.engine.sync();
    expect(r.errors.some((e) => e.includes('invalid weight_entries'))).toBe(true);
    expect((await a.s.weight.list()).map((w) => w.weight_kg)).toEqual([70]);
    remote.put('weight_entries', { id: '55555555-5555-4555-8555-555555555555', user_id: OTHER, measured_at: now, weight_kg: 60, notes: null, created_at: now, updated_at: now, deleted_at: null });
    await a.engine.sync();
    expect(await a.s.weight.list()).toHaveLength(1);
  });

  it('parks children whose parent has not arrived yet and applies them later', async () => {
    const a = await device(remote);
    const now = new Date().toISOString();
    const mealId = '66666666-6666-4666-8666-666666666666';
    remote.put('meal_items', {
      id: '77777777-7777-4777-8777-777777777777', user_id: USER, meal_id: mealId, food_id: null, food_name: 'Late child',
      quantity: 1, unit: 'serving', source: 'manual', calories: 10, protein_g: null, carbs_g: null, fat_g: null,
      fiber_g: null, sugar_g: null, salt_g: null, created_at: now, updated_at: now, deleted_at: null,
    });
    await a.engine.sync();
    expect(await a.db.all('SELECT * FROM meal_items')).toEqual([]);
    remote.put('meals', { id: mealId, user_id: USER, eaten_at: now, local_date: DAY, meal_type: 'lunch', title: null, notes: null, created_at: now, updated_at: now, deleted_at: null });
    await a.engine.sync();
    expect((await a.s.meals.getDay(DAY))[0]?.items[0]?.food_name).toBe('Late child');
  });

  it('runs one sync at a time and schedules one follow-up run', async () => {
    const a = await device(remote);
    await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    const [r1, r2] = await Promise.all([a.engine.sync(), a.engine.sync()]);
    expect(r1).toBe(r2);
    expect(remote.table('meals').size).toBe(1);
  });

  it('does not push records that belong to the local owner or another account', async () => {
    const a = await device(remote);
    a.owner.id = 'local';
    await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    a.owner.id = USER;
    await a.engine.sync();
    expect(remote.table('meals').size).toBe(0);
    expect(await outboxCount(a.db)).toBe(2);
  });

  it('keeps sync cursors per account so a second user on the device gets all their data', async () => {
    const other = await device(remote);
    remote.authUser = OTHER;
    other.owner.id = OTHER;
    await other.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item({ food_name: 'Other' })]);
    await other.engine.sync();

    remote.authUser = USER;
    const a = await device(remote);
    await a.s.meals.addItemsToDay({ date: DAY, mealType: 'dinner' }, [item()]);
    await a.engine.sync();

    // Same device database: user A signs out, OTHER signs in.
    a.owner.id = OTHER;
    remote.authUser = OTHER;
    await a.engine.sync();
    const names = await a.db.all<{ food_name: string }>('SELECT food_name FROM meal_items WHERE user_id = ?', [OTHER]);
    expect(names.map((n) => n.food_name)).toEqual(['Other']);
  });

  it('wipes only the deleted account from the device', async () => {
    const a = await device(remote);
    await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    await a.engine.sync();
    a.owner.id = 'local';
    await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item({ food_name: 'Local' })]);
    await wipeAccountData(a.db, USER);
    expect((await a.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM meals WHERE user_id = ?', [USER]))?.n).toBe(0);
    expect((await a.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM meals WHERE user_id = ?', ['local']))?.n).toBe(1);
    expect(await a.db.first("SELECT key FROM app_meta WHERE key LIKE 'sync.%'")).toBeNull();
  });

  it('keeps a pending local change that is newer than the server copy', async () => {
    const a = await device(remote);
    const id = await a.s.weight.add({ measured_at: '2024-05-01T07:00:00.000Z', weight_kg: 80, notes: null });
    await a.engine.sync();
    const serverRow = remote.table('weight_entries').get(id)!;
    // Server copy changes with an *older* client timestamp (e.g. a slow device).
    remote.put('weight_entries', { ...serverRow, weight_kg: 99, updated_at: '2000-01-01T00:00:00.000Z' });
    await a.s.weight.update(id, { measured_at: '2024-05-01T07:00:00.000Z', weight_kg: 81, notes: null });
    remote.failNext('reject'); // push of the local edit fails once; pull must not clobber it
    await a.engine.sync();
    expect((await a.s.weight.get(id))?.weight_kg).toBe(81);
    expect(await outboxCount(a.db)).toBe(1);
  });

  it('purges synchronized soft-deleted rows after the retention period only', async () => {
    let now = new Date();
    const a = await device(remote, { now: () => now });
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    await a.s.meals.deleteMeal(mealId);
    await a.engine.sync();
    expect(await a.db.all('SELECT id FROM meals')).toHaveLength(1);
    now = new Date(now.getTime() + 31 * 86_400_000);
    await a.engine.sync();
    expect(await a.db.all('SELECT id FROM meals')).toHaveLength(0);
    expect(await a.db.all('SELECT id FROM meal_items')).toHaveLength(0);
  });

  it('does not purge deletions that have not reached the server', async () => {
    let now = new Date();
    const a = await device(remote, { now: () => now });
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    await a.s.meals.deleteMeal(mealId);
    now = new Date(now.getTime() + 31 * 86_400_000);
    a.owner.id = 'local'; // engine skipped entirely; call purge directly
    await a.engine.purge();
    expect(await a.db.all('SELECT id FROM meals')).toHaveLength(1);
  });
});

describe('SyncEngine media', () => {
  let remote: FakeRemote;
  beforeEach(() => {
    remote = new FakeRemote();
    remote.authUser = USER;
  });

  async function addPhoto(d: Device, mealId: string, id = '88888888-8888-4888-8888-888888888888') {
    await d.db.transaction((tx) =>
      insertEntity(tx, 'media_files', {
        ...baseRow(id, USER),
        meal_id: mealId,
        kind: 'photo',
        storage_path: null,
        mime_type: 'image/jpeg',
        size_bytes: 1000,
        width: 100,
        height: 100,
        local_uri: 'file:///photo.jpg',
        upload_status: 'pending',
        upload_attempts: 0,
        upload_error: null,
      }),
    );
    return id;
  }

  it('uploads the binary before pushing metadata and keeps the meal when upload fails', async () => {
    const a = await device(remote);
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    const photoId = await addPhoto(a, mealId);

    remote.failNextUpload('reject');
    const r = await a.engine.sync();
    expect(r.status).toBe('partial');
    expect(remote.table('meals').size).toBe(1); // meal synced regardless
    expect(remote.table('media_files').size).toBe(0); // metadata waits for the binary
    const failed = await a.db.first<{ upload_status: string; upload_attempts: number; local_uri: string }>(
      'SELECT upload_status, upload_attempts, local_uri FROM media_files',
    );
    expect(failed).toMatchObject({ upload_status: 'failed', upload_attempts: 1, local_uri: 'file:///photo.jpg' });

    remote.failNextUpload('network');
    expect((await a.engine.sync()).status).toBe('offline');

    expect((await a.engine.sync()).status).toBe('ok');
    const path = `${USER}/photo/${photoId}.jpg`;
    expect(remote.files.get(path)).toBe('file:///photo.jpg');
    expect(remote.table('media_files').get(photoId)).toMatchObject({ storage_path: path });
    const local = await a.db.first<{ upload_status: string; local_uri: string }>('SELECT upload_status, local_uri FROM media_files');
    expect(local).toEqual({ upload_status: 'uploaded', local_uri: 'file:///photo.jpg' });
  });

  it('downloads media metadata on another device as uploaded without a local file', async () => {
    const a = await device(remote);
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    await addPhoto(a, mealId);
    await a.engine.sync();
    const b = await device(remote);
    await b.engine.sync();
    const row = await b.db.first<{ upload_status: string; local_uri: string | null; storage_path: string }>(
      'SELECT upload_status, local_uri, storage_path FROM media_files',
    );
    expect(row?.upload_status).toBe('uploaded');
    expect(row?.local_uri).toBeNull();
    expect(row?.storage_path).toContain(`${USER}/photo/`);
  });

  it('drops a never-uploaded photo deleted before sync without contacting the server', async () => {
    const a = await device(remote);
    const mealId = await a.s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    const photoId = await addPhoto(a, mealId);
    const ts = new Date(Date.now() + 10).toISOString();
    await a.db.run('UPDATE media_files SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, photoId]);
    await a.engine.sync();
    expect(remote.files.size).toBe(0);
    expect(remote.table('media_files').size).toBe(0);
    expect(await outboxCount(a.db)).toBe(0);
  });
});
