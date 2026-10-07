import { z } from 'zod';

import { ENTITY_ORDER, MEDIA_ENTITIES, remoteColumns, type EntityName } from '@/database/schema';
import type { SqlDatabase, SqlExecutor, SqlValue } from '@/database/types';
import { enqueueChange, insertEntity, type Row } from '@/repositories/base';
import { REMOTE_SCHEMAS } from '@/sync/remoteSchemas';
import { toCsv } from '@/utils/csv';
import { compareIso, isoToLocalTime, nowIso } from '@/utils/dates';
import { AppError, errorMessage, toAppError } from '@/utils/errors';
import { dataEvents } from './events';
import type { OwnerProvider } from './mealService';

export const BACKUP_FORMAT = 'nutrition-tracker-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

/**
 * Entities in a backup, in dependency order. Photos and voice recordings are
 * binaries tied to device storage or the account's bucket, so their records
 * are not part of a backup.
 */
export const BACKUP_ENTITIES = ENTITY_ORDER.filter(
  (e) => !(MEDIA_ENTITIES as readonly string[]).includes(e),
) as Exclude<EntityName, (typeof MEDIA_ENTITIES)[number]>[];
export type BackupEntity = (typeof BACKUP_ENTITIES)[number];

/** Sync bookkeeping and ownership are device/account specific and never exported. */
const EXCLUDED_COLUMNS = ['user_id', 'server_updated_at', 'version', 'deleted_at'] as const;

const exportColumns = (entity: BackupEntity) =>
  remoteColumns(entity).filter((c) => !(EXCLUDED_COLUMNS as readonly string[]).includes(c));

const ROW_SCHEMAS = Object.fromEntries(
  BACKUP_ENTITIES.map((e) => [
    e,
    (REMOTE_SCHEMAS[e] as z.ZodObject<z.ZodRawShape>).omit({
      user_id: true,
      server_updated_at: true,
      version: true,
      deleted_at: true,
    }),
  ]),
) as Record<BackupEntity, z.ZodObject<z.ZodRawShape>>;

/** Natural keys enforced by UNIQUE constraints (besides the id). */
const NATURAL_KEYS: Partial<Record<BackupEntity, string>> = {
  favorite_foods: 'food_id',
  nutrition_goals: 'nutrient',
};

const PARENTS: Partial<Record<BackupEntity, { column: string; table: EntityName }>> = {
  favorite_foods: { column: 'food_id', table: 'foods' },
  meal_items: { column: 'meal_id', table: 'meals' },
};

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  app_version: string | null;
  data: Record<BackupEntity, Row[]>;
}

export interface RestoreResult {
  inserted: number;
  updated: number;
  skipped: number;
}

const envelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  exported_at: z.string(),
  app_version: z.string().nullable().optional(),
  data: z.record(z.string(), z.array(z.unknown())),
});

export function backupRecordCount(backup: BackupFile): number {
  return BACKUP_ENTITIES.reduce((n, e) => n + backup.data[e].length, 0);
}

/**
 * Parses and fully validates a backup before anything is written. Rejects
 * foreign files, newer format versions and any invalid record; duplicate ids
 * within the file collapse to the newest version.
 */
export function parseBackup(text: string): BackupFile {
  if (text.length > MAX_BACKUP_BYTES) throw new AppError('invalid_import', 'Backup file is too large');
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    throw new AppError('invalid_import', 'Backup is not valid JSON', {
      cause: error,
    });
  }
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    const version = (raw as { format?: unknown; version?: unknown } | null)?.version;
    throw new AppError('invalid_import', 'Not a Nutrition Tracker backup', {
      details: { version },
    });
  }
  if (envelope.data.version > BACKUP_VERSION) {
    throw new AppError(
      'unsupported_version',
      `Backup version ${envelope.data.version} is newer than ${BACKUP_VERSION}`,
      {
        details: { version: envelope.data.version },
      },
    );
  }
  const data = {} as Record<BackupEntity, Row[]>;
  for (const entity of BACKUP_ENTITIES) {
    const rows = envelope.data.data[entity] ?? [];
    const byId = new Map<string, Row>();
    rows.forEach((value, index) => {
      const parsed = ROW_SCHEMAS[entity].safeParse(value);
      if (!parsed.success) {
        throw new AppError('invalid_import', `Invalid ${entity} record #${index + 1}`, {
          details: { entity, index, issues: parsed.error.issues.slice(0, 3) },
        });
      }
      const row = parsed.data as Row;
      const id = String(row.id);
      const existing = byId.get(id);
      if (!existing || compareIso(String(row.updated_at), String(existing.updated_at)) > 0) byId.set(id, row);
    });
    data[entity] = [...byId.values()];
  }
  return {
    format: BACKUP_FORMAT,
    version: envelope.data.version,
    exported_at: envelope.data.exported_at,
    app_version: envelope.data.app_version ?? null,
    data,
  };
}

export class BackupService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
    private readonly appVersion: string | null = null,
  ) {}

  async exportBackup(now: string = nowIso()): Promise<BackupFile> {
    const ownerId = this.owner();
    const data = {} as Record<BackupEntity, Row[]>;
    for (const entity of BACKUP_ENTITIES) {
      const cols = exportColumns(entity);
      data[entity] = await this.db.all<Row>(
        `SELECT ${cols.join(', ')} FROM ${entity} WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at, id`,
        [ownerId],
      );
    }
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: now,
      app_version: this.appVersion,
      data,
    };
  }

  async exportJson(now?: string): Promise<string> {
    return JSON.stringify(await this.exportBackup(now), null, 1);
  }

  /** One row per logged food item, oldest first. */
  async exportCsv(): Promise<string> {
    const rows = await this.db.all<Row>(
      `SELECT m.local_date, m.eaten_at, m.meal_type, i.food_name, i.quantity, i.unit, i.calories, i.protein_g,
              i.carbs_g, i.fat_g, i.fiber_g, i.sugar_g, i.salt_g, i.source
       FROM meal_items i JOIN meals m ON m.id = i.meal_id
       WHERE i.user_id = ? AND i.deleted_at IS NULL AND m.deleted_at IS NULL
       ORDER BY m.local_date, m.eaten_at, i.created_at`,
      [this.owner()],
    );
    const header = [
      'date',
      'time',
      'meal',
      'food',
      'quantity',
      'unit',
      'calories_kcal',
      'protein_g',
      'carbs_g',
      'fat_g',
      'fiber_g',
      'sugar_g',
      'salt_g',
      'source',
    ];
    return toCsv(
      header,
      rows.map((r) => [
        r.local_date as string,
        isoToLocalTime(String(r.eaten_at)),
        r.meal_type as string,
        r.food_name as string,
        r.quantity as number,
        r.unit as string,
        r.calories as number,
        r.protein_g as number | null,
        r.carbs_g as number | null,
        r.fat_g as number | null,
        r.fiber_g as number | null,
        r.sugar_g as number | null,
        r.salt_g as number | null,
        r.source as string,
      ]),
    );
  }

  /**
   * Merges a validated backup into the current owner's data in one
   * transaction. Unknown records are inserted; existing ones are replaced only
   * when the backup copy is newer (`updated_at`). Local deletions that are
   * newer than the backup win. Restored changes are queued for sync.
   */
  async restore(backup: BackupFile): Promise<RestoreResult> {
    const ownerId = this.owner();
    const result: RestoreResult = { inserted: 0, updated: 0, skipped: 0 };
    const changed = new Set<EntityName>();
    await this.db.transaction(async (tx) => {
      for (const entity of BACKUP_ENTITIES) {
        for (const row of backup.data[entity]) {
          const outcome = await this.restoreRow(tx, entity, ownerId, row).catch((error: unknown) => {
            // A record violating a local constraint (e.g. an out-of-range value
            // from a hand-edited file) is skipped; anything else aborts the restore.
            if (/constraint/i.test(errorMessage(error))) return 'skipped' as const;
            throw toAppError(error, 'database');
          });
          result[outcome] += 1;
          if (outcome !== 'skipped') changed.add(entity);
        }
      }
    });
    if (changed.size > 0) dataEvents.emit([...changed]);
    return result;
  }

  private async restoreRow(
    tx: SqlExecutor,
    entity: BackupEntity,
    ownerId: string,
    row: Row,
  ): Promise<'inserted' | 'updated' | 'skipped'> {
    const parent = PARENTS[entity];
    if (parent) {
      const exists = await tx.first(`SELECT 1 AS ok FROM ${parent.table} WHERE id = ? AND user_id = ?`, [
        row[parent.column] ?? null,
        ownerId,
      ]);
      if (!exists) return 'skipped';
    }

    const naturalKey = NATURAL_KEYS[entity];
    const local = await tx.first<{
      id: string;
      user_id: string;
      updated_at: string;
    }>(
      naturalKey
        ? `SELECT id, user_id, updated_at FROM ${entity} WHERE id = ? OR (user_id = ? AND ${naturalKey} = ?) ORDER BY id = ? DESC LIMIT 1`
        : `SELECT id, user_id, updated_at FROM ${entity} WHERE id = ?`,
      naturalKey ? [row.id ?? null, ownerId, row[naturalKey] ?? null, row.id ?? null] : [row.id ?? null],
    );

    if (!local) {
      await insertEntity(tx, entity, {
        ...row,
        user_id: ownerId,
        deleted_at: null,
        server_updated_at: null,
        version: 0,
      });
      return 'inserted';
    }
    if (local.user_id !== ownerId) return 'skipped';
    if (compareIso(String(row.updated_at), local.updated_at) <= 0) return 'skipped';

    const cols = exportColumns(entity).filter((c) => c !== 'id' && c !== 'created_at');
    const values: SqlValue[] = cols.map((c) => row[c] ?? null);
    await tx.run(`UPDATE ${entity} SET ${cols.map((c) => `${c} = ?`).join(', ')}, deleted_at = NULL WHERE id = ?`, [
      ...values,
      local.id,
    ]);
    await enqueueChange(tx, entity, local.id);
    return 'updated';
  }
}
