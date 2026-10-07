import { claimLocalData, wipeAccountData } from '@/auth/claimLocalData';
import { targetSize } from '@/media/photoSize';
import { MAX_PHOTOS_PER_MEAL, type PreparedPhoto } from '@/services/photoService';
import { SyncEngine } from '@/sync/syncEngine';
import { FakeFiles } from '../helpers/fakeFiles';
import { FakeRemote } from '../helpers/fakeRemote';
import { item, servicesFor, setupDb } from '../helpers/fixtures';

const DAY = '2024-05-01';
const USER = '11111111-1111-4111-8111-111111111111';
const photo = (uri = 'camera://shot-1'): PreparedPhoto => ({ uri, mimeType: 'image/jpeg', width: 1600, height: 1200 });

describe('PhotoService', () => {
  it('stores the file on the device first and creates a pending row', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    const id = await s.photos.add(mealId, photo());
    const row = await s.photos.get(id);
    expect(row).toMatchObject({
      meal_id: mealId,
      upload_status: 'pending',
      local_uri: `file:///media/${id}.jpg`,
      storage_path: null,
      width: 1600,
      height: 1200,
      mime_type: 'image/jpeg',
    });
    expect(s.files.files.has(`file:///media/${id}.jpg`)).toBe(true);
    expect((await s.photos.forMeal(mealId)).map((p) => p.id)).toEqual([id]);
    // queued for sync; the engine only pushes it after the binary is uploaded
    const queued = await db.first("SELECT 1 AS x FROM sync_outbox WHERE entity = 'media_files' AND entity_id = ?", [id]);
    expect(queued).toBeTruthy();
  });

  it('rejects photos for missing meals, too many photos and oversized files', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    await expect(s.photos.add('00000000-0000-4000-8000-000000000000', photo())).rejects.toMatchObject({ code: 'not_found' });
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    for (let i = 0; i < MAX_PHOTOS_PER_MEAL; i++) await s.photos.add(mealId, photo(`camera://${i}`));
    await expect(s.photos.add(mealId, photo())).rejects.toMatchObject({ code: 'validation' });

    const other = await s.meals.ensureMeal({ date: DAY, mealType: 'dinner' });
    s.files.persistSize = 20 * 1024 * 1024;
    const before = s.files.files.size;
    await expect(s.photos.add(other, photo())).rejects.toMatchObject({ code: 'validation' });
    expect(s.files.files.size).toBe(before); // the stored copy was cleaned up
  });

  it('removes a photo: soft delete, queued, local file freed', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    const id = await s.photos.add(mealId, photo());
    await s.photos.remove(id);
    expect(await s.photos.forMeal(mealId)).toEqual([]);
    const row = await s.photos.get(id);
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.local_uri).toBeNull();
    expect(s.files.files.size).toBe(0);
    await expect(s.photos.remove(id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('replaces a photo without losing the old one when storing the new one fails', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    const id = await s.photos.add(mealId, photo());
    s.files.failPersist = true;
    await expect(s.photos.replace(id, photo('camera://2'))).rejects.toMatchObject({ code: 'database' });
    expect((await s.photos.forMeal(mealId)).map((p) => p.id)).toEqual([id]);
    s.files.failPersist = false;
    const next = await s.photos.replace(id, photo('camera://2'));
    expect((await s.photos.forMeal(mealId)).map((p) => p.id)).toEqual([next]);
  });

  it('soft-deletes photos together with their meal', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    const id = await s.photos.add(mealId, photo());
    await s.meals.deleteMeal(mealId);
    expect((await s.photos.get(id))?.deleted_at).not.toBeNull();
  });

  it('reports photo counts per meal for the dashboard', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const lunch = await s.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    await s.photos.add(lunch, photo());
    await s.photos.add(lunch, photo('camera://2'));
    const counts = await s.meals.mediaCounts(DAY);
    expect(counts.get(lunch)).toEqual({ photos: 2, voice: 0 });
  });

  it('works offline and syncs the photo to another device, which downloads it on demand', async () => {
    const remote = new FakeRemote();
    remote.authUser = USER;
    const dbA = await setupDb();
    const a = servicesFor(dbA, { id: 'local' });
    const mealId = await a.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    const id = await a.photos.add(mealId, photo('camera://original'));
    await claimLocalData(dbA, USER);

    const filesA = a.files;
    const engineA = new SyncEngine(dbA, { ...remoteWithFiles(remote, filesA) }, { userId: () => USER });
    expect(await engineA.sync()).toMatchObject({ status: 'ok', uploaded: 1 });
    expect((await dbA.first<{ upload_status: string }>('SELECT upload_status FROM media_files'))?.upload_status).toBe('uploaded');

    const dbB = await setupDb();
    const b = servicesFor(dbB, { id: USER }, new FakeFiles());
    await new SyncEngine(dbB, remote, { userId: () => USER }).sync();
    const remotePhoto = await b.photos.get(id);
    expect(remotePhoto?.local_uri).toBeNull();
    expect(await b.photos.ensureLocal(remotePhoto!, null)).toBeNull(); // signed out / offline: no download
    const uri = await b.photos.ensureLocal(remotePhoto!, (path) => remote.downloadFile(path));
    expect(uri).toBe(`file:///media/${id}.jpg`);
    expect(new TextDecoder().decode(await b.files.readFileBytes(uri!))).toBe('camera://original');
    expect((await b.photos.get(id))?.local_uri).toBe(uri);
  });

  it('frees device files when the account data is wiped', async () => {
    const db = await setupDb();
    const s = servicesFor(db, { id: USER });
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    const id = await s.photos.add(mealId, photo());
    expect(await wipeAccountData(db, USER)).toEqual([`file:///media/${id}.jpg`]);
  });

  it('re-queues failed uploads', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    const id = await s.photos.add(mealId, photo());
    await db.run("UPDATE media_files SET upload_status = 'failed', upload_attempts = 10 WHERE id = ?", [id]);
    expect(await s.photos.retryFailedUploads()).toBe(1);
    expect(await s.photos.get(id)).toMatchObject({ upload_status: 'pending', upload_attempts: 0 });
  });
});

describe('targetSize', () => {
  it('downscales the longest edge and never upscales', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(1080, 1920)).toEqual({ width: 900, height: 1600 });
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(0, 0)).toEqual({ width: 1600, height: 1600 });
  });
});

/** FakeRemote records the uploaded "content" as the local URI; resolve it to the device file content. */
function remoteWithFiles(remote: FakeRemote, files: FakeFiles) {
  return {
    upsert: remote.upsert.bind(remote),
    pull: remote.pull.bind(remote),
    downloadFile: remote.downloadFile.bind(remote),
    removeFile: remote.removeFile.bind(remote),
    registerDevice: remote.registerDevice.bind(remote),
    uploadFile: async (path: string, localUri: string) => {
      const content = new TextDecoder().decode(await files.readFileBytes(localUri));
      await remote.uploadFile(path, content);
    },
  };
}
