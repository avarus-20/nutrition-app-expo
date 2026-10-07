import { localColumns, type EntityName } from '@/database/schema';
import type { SqlExecutor, SqlValue } from '@/database/types';
import { AppError } from '@/utils/errors';

export type Row = Record<string, SqlValue>;

/**
 * Timestamp for a local modification. Never goes backwards relative to the
 * record's previous `updated_at`, so last-write-wins stays correct even if
 * the device clock is adjusted.
 */
export function nextTimestamp(previous?: string | null, now: Date = new Date()): string {
  const prev = previous ? new Date(previous).getTime() : Number.NaN;
  const t = Number.isFinite(prev) && prev >= now.getTime() ? prev + 1 : now.getTime();
  return new Date(t).toISOString();
}

function pickColumns(entity: EntityName, row: Row): string[] {
  const allowed = localColumns(entity);
  const cols = Object.keys(row).filter((k) => allowed.includes(k));
  const unknown = Object.keys(row).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new AppError('database', `Unknown columns for ${entity}: ${unknown.join(', ')}`);
  }
  return cols;
}

/** Records that a local entity changed and must be pushed. Coalesces per entity. */
export async function enqueueChange(tx: SqlExecutor, entity: EntityName, id: string): Promise<void> {
  await tx.run(
    `INSERT INTO sync_outbox (entity, entity_id, revision, attempts, created_at)
     VALUES (?, ?, 1, 0, ?)
     ON CONFLICT (entity, entity_id) DO UPDATE SET
       revision = revision + 1, attempts = 0, next_attempt_at = NULL, last_error = NULL`,
    [entity, id, new Date().toISOString()],
  );
}

export async function insertEntity(
  tx: SqlExecutor,
  entity: EntityName,
  row: Row,
  options: { enqueue?: boolean; orIgnore?: boolean } = {},
): Promise<boolean> {
  const cols = pickColumns(entity, row);
  const sql = `INSERT ${options.orIgnore ? 'OR IGNORE ' : ''}INTO ${entity} (${cols.join(', ')}) VALUES (${cols
    .map(() => '?')
    .join(', ')})`;
  const result = await tx.run(
    sql,
    cols.map((c) => row[c] ?? null),
  );
  const inserted = result.changes > 0;
  if (inserted && options.enqueue !== false) await enqueueChange(tx, entity, String(row.id));
  return inserted;
}

/** Updates an owned, non-deleted record; bumps `updated_at` and enqueues it. */
export async function updateEntity(
  tx: SqlExecutor,
  entity: EntityName,
  ownerId: string,
  id: string,
  patch: Row,
): Promise<void> {
  const current = await tx.first<{ updated_at: string }>(
    `SELECT updated_at FROM ${entity} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, ownerId],
  );
  if (!current) throw new AppError('not_found', `${entity} ${id} not found`);
  const values: Row = { ...patch, updated_at: nextTimestamp(current.updated_at) };
  const cols = pickColumns(entity, values);
  await tx.run(`UPDATE ${entity} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user_id = ?`, [
    ...cols.map((c) => values[c] ?? null),
    id,
    ownerId,
  ]);
  await enqueueChange(tx, entity, id);
}

/** Soft deletion: keeps the row so the deletion can propagate through sync. */
export async function softDeleteEntity(
  tx: SqlExecutor,
  entity: EntityName,
  ownerId: string,
  where: { column: 'id' | 'meal_id' | 'food_id'; value: string },
): Promise<number> {
  const rows = await tx.all<{ id: string; updated_at: string }>(
    `SELECT id, updated_at FROM ${entity} WHERE ${where.column} = ? AND user_id = ? AND deleted_at IS NULL`,
    [where.value, ownerId],
  );
  for (const r of rows) {
    const ts = nextTimestamp(r.updated_at);
    await tx.run(`UPDATE ${entity} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [ts, ts, r.id]);
    await enqueueChange(tx, entity, r.id);
  }
  return rows.length;
}

export function baseRow(id: string, ownerId: string, now: string = new Date().toISOString()): Row {
  return {
    id,
    user_id: ownerId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    server_updated_at: null,
    version: 0,
  };
}
