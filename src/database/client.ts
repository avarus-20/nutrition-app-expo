import { Platform } from 'react-native';

import { AppError } from '@/utils/errors';
import { openExpoDriver } from './expoDriver';
import { migrate } from './migrations';
import { SerialDatabase } from './serialDatabase';
import type { SqlDatabase } from './types';

export const DATABASE_NAME = 'nutrition.db';

let opening: Promise<SqlDatabase> | null = null;

async function open(): Promise<SqlDatabase> {
  if (Platform.OS === 'web') {
    const g = globalThis as { crossOriginIsolated?: boolean; SharedArrayBuffer?: unknown };
    if (!g.crossOriginIsolated || typeof g.SharedArrayBuffer === 'undefined') {
      throw new AppError(
        'unsupported_platform',
        'Local database needs a cross-origin isolated page (COOP/COEP headers). See docs/DEPLOYMENT.md.',
      );
    }
  }
  const db = new SerialDatabase(await openExpoDriver(DATABASE_NAME));
  if (Platform.OS !== 'web') await db.exec('PRAGMA journal_mode = WAL');
  await migrate(db);
  return db;
}

/** Opens (once) and migrates the app database. */
export function getDatabase(): Promise<SqlDatabase> {
  if (!opening) {
    opening = open().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}
