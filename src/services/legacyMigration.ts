import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import type { SqlDatabase } from '@/database/types';
import { baseRow, insertEntity } from '@/repositories/base';
import { metaRepository } from '@/repositories/metaRepository';
import { isValidLocalDate, localDateTimeToIso } from '@/utils/dates';
import { AppError } from '@/utils/errors';
import { deterministicId } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { dataEvents } from './events';

export const LEGACY_MIGRATION_KEY = 'legacy.asyncstorage.v1';
const LEGACY_KEY_RE = /^meals_(\d{4}-\d{2}-\d{2})$/;
const UNTITLED = '—';

/** Shape written by the prototype (`types/meal.ts`), parsed leniently. */
const legacyMealSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  title: z.string().optional().nullable(),
  calories: z.union([z.number(), z.string()]),
  createdAt: z.string().optional(),
});

export interface LegacyMigrationReport {
  status: 'completed' | 'nothing_to_migrate';
  version: 1;
  migratedAt: string;
  keys: number;
  entriesFound: number;
  imported: number;
  alreadyPresent: number;
  skippedInvalid: number;
  invalidKeys: string[];
}

interface PreparedEntry {
  mealId: string;
  itemId: string;
  date: string;
  title: string;
  calories: number;
  order: number;
}

function parseCalories(value: number | string): number | null {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 0 || n > 20000) return null;
  return Math.round(n);
}

/**
 * Imports prototype data (`meals_YYYY-MM-DD` AsyncStorage keys) into SQLite.
 *
 * Idempotent: record ids are derived deterministically from the legacy key,
 * legacy id and position, and rows are inserted with INSERT OR IGNORE, so a
 * re-run (e.g. after a crash mid-way) never duplicates data. The original
 * AsyncStorage keys are left untouched.
 */
export async function migrateLegacyAsyncStorage(
  db: SqlDatabase,
  ownerId: string,
  options: { force?: boolean } = {},
): Promise<LegacyMigrationReport> {
  const previous = await metaRepository.getJson<LegacyMigrationReport>(db, LEGACY_MIGRATION_KEY);
  if (previous && !options.force) return previous;

  const allKeys = await AsyncStorage.getAllKeys();
  const keys = allKeys.filter((k) => LEGACY_KEY_RE.test(k)).sort();
  const report: LegacyMigrationReport = {
    status: keys.length > 0 ? 'completed' : 'nothing_to_migrate',
    version: 1,
    migratedAt: new Date().toISOString(),
    keys: keys.length,
    entriesFound: 0,
    imported: 0,
    alreadyPresent: 0,
    skippedInvalid: 0,
    invalidKeys: [],
  };

  const prepared: PreparedEntry[] = [];
  const pairs = keys.length > 0 ? await AsyncStorage.multiGet(keys) : [];
  for (const [key, raw] of pairs) {
    const date = LEGACY_KEY_RE.exec(key)?.[1];
    if (!date || !isValidLocalDate(date) || raw === null) {
      report.invalidKeys.push(key);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      report.invalidKeys.push(key);
      continue;
    }
    if (!Array.isArray(parsed)) {
      report.invalidKeys.push(key);
      continue;
    }
    const seen = new Map<string, number>();
    // The prototype stored newest first; reverse so `order` grows with time.
    const entries = [...parsed].reverse();
    report.entriesFound += entries.length;
    for (let index = 0; index < entries.length; index += 1) {
      const result = legacyMealSchema.safeParse(entries[index]);
      const calories = result.success ? parseCalories(result.data.calories) : null;
      if (!result.success || calories === null) {
        report.skippedInvalid += 1;
        continue;
      }
      const title = result.data.title?.trim() || UNTITLED;
      const legacyId = result.data.id !== undefined ? String(result.data.id) : `#${index}:${title}:${calories}`;
      const occurrence = seen.get(legacyId) ?? 0;
      seen.set(legacyId, occurrence + 1);
      const mealId = await deterministicId('legacy-meal', `${date}:${legacyId}:${occurrence}`);
      prepared.push({
        mealId,
        itemId: await deterministicId('legacy-item', mealId),
        date,
        title: title.slice(0, 200),
        calories,
        order: index,
      });
    }
  }

  try {
    await db.transaction(async (tx) => {
      for (const e of prepared) {
        const noon = new Date(localDateTimeToIso(e.date, '12:00'));
        const ts = new Date(noon.getTime() + e.order * 1000).toISOString();
        const now = new Date().toISOString();
        const meal = {
          ...baseRow(e.mealId, ownerId, now),
          created_at: ts,
          updated_at: now,
          eaten_at: ts,
          local_date: e.date,
          meal_type: 'snack',
          title: e.title,
          notes: null,
        };
        const inserted = await insertEntity(tx, 'meals', meal, { orIgnore: true });
        if (!inserted) {
          report.alreadyPresent += 1;
          continue;
        }
        await insertEntity(
          tx,
          'meal_items',
          {
            ...baseRow(e.itemId, ownerId, now),
            created_at: ts,
            meal_id: e.mealId,
            food_id: null,
            food_name: e.title,
            quantity: 1,
            unit: 'serving',
            source: 'legacy',
            calories: e.calories,
            protein_g: null,
            carbs_g: null,
            fat_g: null,
            fiber_g: null,
            sugar_g: null,
            salt_g: null,
          },
          { orIgnore: true },
        );
        report.imported += 1;
      }

      // Verification: every prepared record must now exist exactly once.
      if (prepared.length > 0) {
        const ids = prepared.map((p) => p.mealId);
        let found = 0;
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          const row = await tx.first<{ n: number }>(
            `SELECT COUNT(*) AS n FROM meals m JOIN meal_items i ON i.meal_id = m.id
             WHERE m.id IN (${chunk.map(() => '?').join(', ')})`,
            chunk,
          );
          found += row?.n ?? 0;
        }
        if (found !== prepared.length) {
          throw new AppError('migration', `Legacy verification failed: expected ${prepared.length}, found ${found}`);
        }
      }

      await metaRepository.setJson(tx, LEGACY_MIGRATION_KEY, report);
    });
  } catch (error) {
    logger.error('legacy-migration', 'failed; AsyncStorage data left untouched', error);
    throw error instanceof AppError && error.code === 'migration'
      ? error
      : new AppError('migration', 'Legacy migration failed', { cause: error });
  }

  if (report.imported > 0) dataEvents.emit(['meals', 'meal_items']);
  return report;
}

/** Legacy UI language preference (`app_lang`). */
export async function readLegacyLanguage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('app_lang');
  } catch {
    return null;
  }
}
