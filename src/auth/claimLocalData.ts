import { ENTITY_ORDER, MEDIA_ENTITIES } from '@/database/schema';
import type { SqlDatabase } from '@/database/types';
import { GOAL_KEYS, LOCAL_OWNER, type GoalKey, type NutritionGoal } from '@/domain/types';
import { enqueueChange } from '@/repositories/base';
import { goalId } from '@/services/bodyService';
import { dataEvents } from '@/services/events';
import { syncKeys } from '@/sync/syncEngine';

/**
 * Transfers records created before sign-in (owner `local`) to the signed-in
 * account so they are synchronized. Runs in one transaction.
 *
 * Goals have per-user deterministic ids and a (user, nutrient) unique key, so
 * they are re-keyed; if the account already has a goal for the nutrient the
 * newer one (by updated_at) is kept.
 */
export async function claimLocalData(db: SqlDatabase, userId: string): Promise<number> {
  if (userId === LOCAL_OWNER) return 0;
  let claimed = 0;
  await db.transaction(async (tx) => {
    const localGoals = await tx.all<NutritionGoal>('SELECT * FROM nutrition_goals WHERE user_id = ?', [LOCAL_OWNER]);
    for (const g of localGoals) {
      if (!GOAL_KEYS.includes(g.nutrient as GoalKey)) continue;
      const newId = await goalId(userId, g.nutrient);
      const existing = await tx.first<NutritionGoal>('SELECT * FROM nutrition_goals WHERE user_id = ? AND nutrient = ?', [
        userId,
        g.nutrient,
      ]);
      await tx.run('DELETE FROM nutrition_goals WHERE id = ?', [g.id]);
      await tx.run("DELETE FROM sync_outbox WHERE entity = 'nutrition_goals' AND entity_id = ?", [g.id]);
      if (existing) {
        if (new Date(g.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
          await tx.run('UPDATE nutrition_goals SET target = ?, deleted_at = ?, updated_at = ? WHERE id = ?', [
            g.target,
            g.deleted_at,
            g.updated_at,
            existing.id,
          ]);
          await enqueueChange(tx, 'nutrition_goals', existing.id);
        }
      } else {
        await tx.run(
          `INSERT INTO nutrition_goals (id, user_id, nutrient, target, created_at, updated_at, deleted_at, server_updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
          [newId, userId, g.nutrient, g.target, g.created_at, g.updated_at, g.deleted_at],
        );
        await enqueueChange(tx, 'nutrition_goals', newId);
      }
      claimed += 1;
    }

    for (const entity of ENTITY_ORDER) {
      if (entity === 'nutrition_goals') continue;
      const r = await tx.run(`UPDATE ${entity} SET user_id = ? WHERE user_id = ?`, [userId, LOCAL_OWNER]);
      claimed += r.changes;
    }
    const drafts = await tx.run('UPDATE entry_drafts SET user_id = ? WHERE user_id = ?', [userId, LOCAL_OWNER]);
    claimed += drafts.changes;
  });
  if (claimed > 0) dataEvents.emit([...ENTITY_ORDER, 'entry_drafts']);
  return claimed;
}

export async function countLocalRecords(db: SqlDatabase): Promise<number> {
  let n = 0;
  for (const entity of ENTITY_ORDER) {
    const r = await db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${entity} WHERE user_id = ? AND deleted_at IS NULL`,
      [LOCAL_OWNER],
    );
    n += r?.n ?? 0;
  }
  return n;
}

/**
 * Removes every local row of `userId` (after the account was deleted on the
 * server) including queued changes, cursors and parked rows.
 */
export async function wipeAccountData(db: SqlDatabase, userId: string): Promise<string[]> {
  const files: string[] = [];
  await db.transaction(async (tx) => {
    for (const entity of [...ENTITY_ORDER].reverse()) {
      if ((MEDIA_ENTITIES as readonly string[]).includes(entity)) {
        const rows = await tx.all<{ local_uri: string | null }>(
          `SELECT local_uri FROM ${entity} WHERE user_id = ? AND local_uri IS NOT NULL`,
          [userId],
        );
        for (const r of rows) if (r.local_uri) files.push(r.local_uri);
      }
      await tx.run(
        `DELETE FROM sync_outbox WHERE entity = ? AND entity_id IN (SELECT id FROM ${entity} WHERE user_id = ?)`,
        [entity, userId],
      );
      await tx.run(`DELETE FROM ${entity} WHERE user_id = ?`, [userId]);
    }
    await tx.run('DELETE FROM entry_drafts WHERE user_id = ?', [userId]);
    await tx.run('DELETE FROM app_meta WHERE substr(key, 1, ?) = ? OR key = ?', [
      syncKeys.prefix(userId).length,
      syncKeys.prefix(userId),
      `device.id.${userId}`,
    ]);
  });
  return files;
}
