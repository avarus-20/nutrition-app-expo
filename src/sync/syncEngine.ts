import {
  ENTITY_ORDER,
  ENTITY_TABLES,
  MEDIA_ENTITIES,
  remoteColumns,
  type EntityName,
  type MediaEntity,
} from '@/database/schema';
import type { SqlDatabase, SqlExecutor, SqlValue } from '@/database/types';
import { LOCAL_OWNER, type MediaFile, type VoiceNote } from '@/domain/types';
import { enqueueChange } from '@/repositories/base';
import { metaRepository } from '@/repositories/metaRepository';
import { mediaRepository } from '@/repositories/mediaRepository';
import { dataEvents } from '@/services/events';
import { AppError, errorMessage, toAppError } from '@/utils/errors';
import { newId } from '@/utils/ids';
import { logger } from '@/utils/logger';
import type { PullCursor, RemoteGateway, RemoteRow } from './remoteGateway';
import { parseRemoteRow } from './remoteSchemas';

export interface SyncOptions {
  /** Signed-in user id, or null when signed out. */
  userId: () => string | null;
  now?: () => Date;
  pushBatchSize?: number;
  pullPageSize?: number;
  maxUploadAttempts?: number;
  /** Re-read window that tolerates server transactions committing late. */
  pullOverlapMs?: number;
  /** Keep soft-deleted, synchronized rows locally for this long. */
  purgeAfterMs?: number;
  deviceInfo?: () => { platform: 'ios' | 'android' | 'web' | 'other'; appVersion: string | null };
  /** Deletes a local media file after its record was purged. */
  deleteLocalFile?: (uri: string) => Promise<void>;
}

export interface SyncResult {
  status: 'ok' | 'skipped' | 'offline' | 'partial';
  uploaded: number;
  pushed: number;
  pulled: number;
  failed: number;
  errors: string[];
}

interface OutboxEntry {
  id: number;
  entity: EntityName;
  entity_id: string;
  revision: number;
  attempts: number;
}

/** Server-managed columns are never sent by the client. */
const SERVER_MANAGED = new Set(['server_updated_at', 'version']);

/** Sync bookkeeping is per account: several users may sign in on one device. */
export const syncKeys = {
  cursor: (userId: string, entity: EntityName) => `sync.${userId}.cursor.${entity}`,
  orphans: (userId: string, entity: EntityName) => `sync.${userId}.orphans.${entity}`,
  lastSuccess: (userId: string) => `sync.${userId}.last_success_at`,
  prefix: (userId: string) => `sync.${userId}.`,
};
/** Per account: a device row belongs to exactly one user (RLS). */
const DEVICE_KEY = (userId: string) => `device.id.${userId}`;

const MEDIA_FOLDER: Record<MediaEntity, string> = { media_files: 'photo', voice_notes: 'voice' };

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

export function storagePathFor(entity: MediaEntity, userId: string, id: string, mimeType: string): string {
  return `${userId}/${MEDIA_FOLDER[entity]}/${id}.${EXTENSIONS[mimeType] ?? 'bin'}`;
}

/** Exponential backoff: 30 s, 1 min, 2 min ... capped at 6 h. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 6 * 3600_000);
}

const isNetwork = (e: unknown) => e instanceof AppError && e.code === 'network';

/**
 * Offline-first synchronization between the local SQLite database and the
 * server. See docs/OFFLINE_SYNC.md for the algorithm.
 */
export class SyncEngine {
  private running: Promise<SyncResult> | null = null;
  private rerun = false;
  private readonly now: () => Date;
  private readonly pushBatchSize: number;
  private readonly pullPageSize: number;
  private readonly maxUploadAttempts: number;
  private readonly pullOverlapMs: number;
  private readonly purgeAfterMs: number;

  constructor(
    private readonly db: SqlDatabase,
    private readonly gateway: RemoteGateway,
    private readonly options: SyncOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.pushBatchSize = options.pushBatchSize ?? 100;
    this.pullPageSize = options.pullPageSize ?? 500;
    this.maxUploadAttempts = options.maxUploadAttempts ?? 10;
    this.pullOverlapMs = options.pullOverlapMs ?? 2 * 60_000;
    this.purgeAfterMs = options.purgeAfterMs ?? 30 * 86_400_000;
  }

  /**
   * Runs one synchronization. Concurrent calls share the running sync; a call
   * made while a sync is running schedules exactly one follow-up run so that
   * changes made during the sync are not left waiting.
   */
  sync(): Promise<SyncResult> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    const run = async (): Promise<SyncResult> => {
      let result: SyncResult;
      do {
        this.rerun = false;
        result = await this.runOnce();
      } while (this.rerun && result.status === 'ok');
      return result;
    };
    this.running = run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  isRunning(): boolean {
    return this.running !== null;
  }

  async pendingCount(): Promise<number> {
    const r = await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox');
    return r?.n ?? 0;
  }

  async lastSyncedAt(): Promise<string | null> {
    const userId = this.options.userId();
    if (!userId || userId === LOCAL_OWNER) return null;
    return metaRepository.get(this.db, syncKeys.lastSuccess(userId));
  }

  private async runOnce(): Promise<SyncResult> {
    const result: SyncResult = { status: 'ok', uploaded: 0, pushed: 0, pulled: 0, failed: 0, errors: [] };
    const userId = this.options.userId();
    if (!userId || userId === LOCAL_OWNER) return { ...result, status: 'skipped' };

    const changed = new Set<EntityName>();
    try {
      await this.registerDevice(userId);
      await this.uploadMedia(userId, result, changed);
      await this.push(userId, result);
      await this.pull(userId, result, changed);
      const files = await this.purge();
      for (const uri of files) {
        await this.options.deleteLocalFile?.(uri).catch((e: unknown) => logger.warn('sync', 'file cleanup failed', e));
      }
      if (result.failed === 0) await metaRepository.set(this.db, syncKeys.lastSuccess(userId), this.now().toISOString());
      else result.status = 'partial';
    } catch (error) {
      if (isNetwork(error)) {
        result.status = 'offline';
      } else {
        result.status = 'partial';
        result.errors.push(errorMessage(error));
        logger.error('sync', 'sync failed', error);
      }
    } finally {
      if (changed.size > 0) dataEvents.emit([...changed]);
    }
    return result;
  }

  private async registerDevice(userId: string): Promise<void> {
    if (!this.options.deviceInfo) return;
    let id = await metaRepository.get(this.db, DEVICE_KEY(userId));
    if (!id) {
      id = newId();
      await metaRepository.set(this.db, DEVICE_KEY(userId), id);
    }
    const info = this.options.deviceInfo();
    try {
      await this.gateway.registerDevice({
        id,
        user_id: userId,
        platform: info.platform,
        app_version: info.appVersion,
        last_seen_at: this.now().toISOString(),
      });
    } catch (error) {
      if (isNetwork(error)) throw error;
      logger.warn('sync', 'device registration failed', error);
    }
  }

  // ---------------------------------------------------------------- media --

  /**
   * Uploads binaries of pending photos/voice notes. The metadata row is only
   * marked `uploaded` (and queued for push) after the object exists remotely;
   * a failed upload keeps the local file and is retried with backoff.
   */
  private async uploadMedia(userId: string, result: SyncResult, changed: Set<EntityName>): Promise<void> {
    for (const entity of MEDIA_ENTITIES) {
      const pending = await mediaRepository.pendingUploads(this.db, entity, userId, this.maxUploadAttempts);
      for (const row of pending as (MediaFile | VoiceNote)[]) {
        const path = row.storage_path ?? storagePathFor(entity, userId, row.id, row.mime_type);
        try {
          await this.gateway.uploadFile(path, row.local_uri!, row.mime_type);
        } catch (error) {
          if (isNetwork(error)) throw error;
          result.failed += 1;
          result.errors.push(`upload ${entity}/${row.id}: ${errorMessage(error)}`);
          await this.db.run(
            `UPDATE ${entity} SET upload_status = 'failed', upload_attempts = upload_attempts + 1, upload_error = ? WHERE id = ?`,
            [errorMessage(error).slice(0, 500), row.id],
          );
          changed.add(entity);
          continue;
        }
        await this.db.transaction(async (tx) => {
          await tx.run(
            `UPDATE ${entity} SET storage_path = ?, upload_status = 'uploaded', upload_error = NULL WHERE id = ?`,
            [path, row.id],
          );
          await enqueueChange(tx, entity, row.id);
        });
        result.uploaded += 1;
        changed.add(entity);
      }
    }
  }

  // ----------------------------------------------------------------- push --

  private toPayload(entity: EntityName, row: Record<string, SqlValue>): RemoteRow {
    const out: RemoteRow = {};
    for (const col of remoteColumns(entity)) {
      if (!SERVER_MANAGED.has(col)) out[col] = row[col] ?? null;
    }
    return out;
  }

  private async push(userId: string, result: SyncResult): Promise<void> {
    const nowIso = this.now().toISOString();
    for (const entity of ENTITY_ORDER) {
      let lastId = 0;
      for (;;) {
        const entries = await this.db.all<OutboxEntry>(
          `SELECT id, entity, entity_id, revision, attempts FROM sync_outbox
           WHERE entity = ? AND id > ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
           ORDER BY id LIMIT ?`,
          [entity, lastId, nowIso, this.pushBatchSize],
        );
        if (entries.length === 0) break;
        lastId = entries[entries.length - 1]!.id;

        const ids = entries.map((e) => e.entity_id);
        const rows = await this.db.all<Record<string, SqlValue>>(
          `SELECT * FROM ${entity} WHERE id IN (${ids.map(() => '?').join(', ')})`,
          ids,
        );
        const byId = new Map(rows.map((r) => [String(r.id), r]));
        const ready: { entry: OutboxEntry; payload: RemoteRow }[] = [];
        for (const entry of entries) {
          const row = byId.get(entry.entity_id);
          const isMedia = (MEDIA_ENTITIES as readonly string[]).includes(entity);
          if (!row || (isMedia && row.deleted_at !== null && row.storage_path === null)) {
            // Gone locally, or media deleted before it was ever uploaded:
            // nothing exists remotely, nothing to push.
            await this.db.run('DELETE FROM sync_outbox WHERE id = ? AND revision = ?', [entry.id, entry.revision]);
            continue;
          }
          if (row.user_id !== userId) continue; // belongs to another (or no) account
          if (isMedia && row.upload_status !== 'uploaded') continue; // binary first
          ready.push({ entry, payload: this.toPayload(entity, row) });
        }
        if (ready.length > 0) await this.pushBatch(entity, ready, result);
      }
    }
  }

  private async pushBatch(
    entity: EntityName,
    batch: { entry: OutboxEntry; payload: RemoteRow }[],
    result: SyncResult,
  ): Promise<void> {
    try {
      await this.gateway.upsert(
        entity,
        batch.map((b) => b.payload),
      );
      await this.db.transaction(async (tx) => {
        for (const { entry } of batch) {
          // Only clear the entry if the record was not modified meanwhile.
          await tx.run('DELETE FROM sync_outbox WHERE id = ? AND revision = ?', [entry.id, entry.revision]);
        }
      });
      result.pushed += batch.length;
      if ((MEDIA_ENTITIES as readonly string[]).includes(entity)) await this.removeDeletedObjects(batch);
    } catch (error) {
      if (isNetwork(error)) throw error;
      if (batch.length > 1) {
        // Isolate the record(s) the server rejects so they don't block others.
        for (const item of batch) await this.pushBatch(entity, [item], result);
        return;
      }
      const { entry } = batch[0]!;
      const message = errorMessage(error).slice(0, 500);
      result.failed += 1;
      result.errors.push(`push ${entity}/${entry.entity_id}: ${message}`);
      const next = new Date(this.now().getTime() + backoffMs(entry.attempts + 1)).toISOString();
      await this.db.run(
        'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE id = ?',
        [message, next, entry.id],
      );
    }
  }

  /**
   * Once a media deletion has reached the server, the binary is removed from
   * object storage. Best effort: a failure leaves an unreferenced object
   * (cleaned up with the account) but never blocks synchronization.
   */
  private async removeDeletedObjects(batch: { payload: RemoteRow }[]): Promise<void> {
    for (const { payload } of batch) {
      if (payload.deleted_at === null || typeof payload.storage_path !== 'string') continue;
      try {
        await this.gateway.removeFile(payload.storage_path);
      } catch (error) {
        logger.warn('sync', 'could not remove deleted media object', errorMessage(error));
      }
    }
  }

  // ----------------------------------------------------------------- pull --

  private async pull(userId: string, result: SyncResult, changed: Set<EntityName>): Promise<void> {
    for (const entity of ENTITY_ORDER) {
      await this.retryOrphans(entity, userId, result, changed);
      const saved = await metaRepository.getJson<PullCursor>(this.db, syncKeys.cursor(userId, entity));
      let cursor: PullCursor | null = saved;
      let after: PullCursor | null = saved
        ? { ts: new Date(new Date(saved.ts).getTime() - this.pullOverlapMs).toISOString(), id: '' }
        : null;
      for (;;) {
        const page = await this.gateway.pull(entity, userId, after, this.pullPageSize);
        if (page.length === 0) break;
        const applied = await this.applyPage(entity, userId, page, result);
        if (applied > 0) changed.add(entity);
        const last = page[page.length - 1]!;
        after = { ts: String(last.server_updated_at), id: String(last.id) };
        if (!cursor || compareCursor(after, cursor) > 0) cursor = after;
        await metaRepository.setJson(this.db, syncKeys.cursor(userId, entity), cursor);
        if (page.length < this.pullPageSize) break;
      }
    }
  }

  private async applyPage(entity: EntityName, userId: string, page: RemoteRow[], result: SyncResult): Promise<number> {
    let applied = 0;
    const orphans: RemoteRow[] = [];
    await this.db.transaction(async (tx) => {
      for (const raw of page) {
        const outcome = await this.applyRow(tx, entity, userId, raw);
        if (outcome === 'applied') applied += 1;
        else if (outcome === 'orphan') orphans.push(raw);
        else if (outcome === 'invalid') result.errors.push(`invalid ${entity} row ${String(raw.id)}`);
      }
    });
    if (orphans.length > 0) await this.saveOrphans(userId, entity, orphans);
    result.pulled += applied;
    return applied;
  }

  /**
   * Reconciles one server row with the local database:
   * - unknown locally -> insert;
   * - local copy without pending changes -> overwrite with server state;
   * - local copy with pending changes -> last-write-wins on `updated_at`
   *   (if the server is newer, the pending local change is discarded).
   */
  private async applyRow(
    tx: SqlExecutor,
    entity: EntityName,
    userId: string,
    raw: RemoteRow,
  ): Promise<'applied' | 'skipped' | 'invalid' | 'orphan'> {
    const row = parseRemoteRow(entity, raw);
    if (!row) {
      logger.warn('sync', `ignoring invalid ${entity} row`, raw.id);
      return 'invalid';
    }
    if (row.user_id !== userId) return 'skipped';

    const local = await tx.first<{ updated_at: string; server_updated_at: string | null; version: number | null; pending: number }>(
      `SELECT updated_at, server_updated_at, version,
              EXISTS (SELECT 1 FROM sync_outbox WHERE entity = ? AND entity_id = ?) AS pending
       FROM ${entity} WHERE id = ?`,
      [entity, row.id as string, row.id as string],
    );
    // Re-read through the overlap window and already applied: nothing to do.
    if (local && !local.pending && local.version === row.version && local.server_updated_at === row.server_updated_at) {
      return 'skipped';
    }
    if (local?.pending) {
      const localTime = new Date(local.updated_at).getTime();
      const remoteTime = new Date(row.updated_at as string).getTime();
      if (localTime >= remoteTime) return 'skipped';
      await tx.run('DELETE FROM sync_outbox WHERE entity = ? AND entity_id = ?', [entity, row.id as string]);
    }

    const cols = remoteColumns(entity);
    const isMedia = ENTITY_TABLES[entity].localColumns.length > 0;
    const insertCols = isMedia ? [...cols, 'upload_status'] : cols;
    const values: SqlValue[] = cols.map((c) => row[c] ?? null);
    if (isMedia) values.push('uploaded');
    const updates = insertCols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
    try {
      await tx.run(
        `INSERT INTO ${entity} (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})
         ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
        values,
      );
    } catch (error) {
      if (/FOREIGN KEY/i.test(errorMessage(error))) return 'orphan';
      throw toAppError(error, 'sync');
    }
    return 'applied';
  }

  /**
   * Children whose parent has not arrived yet (e.g. a meal created on another
   * device between our meals and meal_items pulls) are parked and retried on
   * the next sync instead of blocking the cursor.
   */
  private async saveOrphans(userId: string, entity: EntityName, rows: RemoteRow[]): Promise<void> {
    const key = syncKeys.orphans(userId, entity);
    const existing = (await metaRepository.getJson<RemoteRow[]>(this.db, key)) ?? [];
    const merged = new Map(existing.map((r) => [String(r.id), r]));
    for (const r of rows) merged.set(String(r.id), r);
    await metaRepository.setJson(this.db, key, [...merged.values()].slice(-2000));
  }

  private async retryOrphans(
    entity: EntityName,
    userId: string,
    result: SyncResult,
    changed: Set<EntityName>,
  ): Promise<void> {
    const key = syncKeys.orphans(userId, entity);
    const orphans = await metaRepository.getJson<RemoteRow[]>(this.db, key);
    if (!orphans || orphans.length === 0) return;
    await metaRepository.remove(this.db, key);
    const applied = await this.applyPage(entity, userId, orphans, result);
    if (applied > 0) changed.add(entity);
  }

  // ---------------------------------------------------------------- purge --

  /**
   * Physically removes soft-deleted rows once the deletion has reached the
   * server (no pending outbox entry) and the retention period has passed.
   * Children are purged before parents.
   */
  async purge(): Promise<string[]> {
    const cutoff = new Date(this.now().getTime() - this.purgeAfterMs).toISOString();
    const localFiles: string[] = [];
    const order: EntityName[] = [
      'meal_items',
      'media_files',
      'voice_notes',
      'favorite_foods',
      'meals',
      'foods',
      'nutrition_goals',
      'weight_entries',
      'water_entries',
    ];
    await this.db.transaction(async (tx) => {
      for (const entity of order) {
        const childGuard =
          entity === 'meals'
            ? `AND NOT EXISTS (SELECT 1 FROM meal_items c WHERE c.meal_id = t.id)
               AND NOT EXISTS (SELECT 1 FROM media_files c WHERE c.meal_id = t.id)
               AND NOT EXISTS (SELECT 1 FROM voice_notes c WHERE c.meal_id = t.id)`
            : entity === 'foods'
              ? 'AND NOT EXISTS (SELECT 1 FROM favorite_foods c WHERE c.food_id = t.id)'
              : '';
        const where = `t.deleted_at IS NOT NULL AND t.deleted_at < ?
          AND NOT EXISTS (SELECT 1 FROM sync_outbox o WHERE o.entity = '${entity}' AND o.entity_id = t.id)
          ${childGuard}`;
        if ((MEDIA_ENTITIES as readonly string[]).includes(entity)) {
          const files = await tx.all<{ local_uri: string | null }>(
            `SELECT local_uri FROM ${entity} t WHERE ${where} AND local_uri IS NOT NULL`,
            [cutoff],
          );
          for (const f of files) if (f.local_uri) localFiles.push(f.local_uri);
        }
        await tx.run(`DELETE FROM ${entity} AS t WHERE ${where}`, [cutoff]);
      }
    });
    return localFiles;
  }
}

function compareCursor(a: PullCursor, b: PullCursor): number {
  const d = new Date(a.ts).getTime() - new Date(b.ts).getTime();
  if (d !== 0) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
