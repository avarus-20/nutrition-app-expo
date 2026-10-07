import { AppError } from '@/utils/errors';
import type { SqlDatabase } from './types';

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

/** Columns shared by every synchronized table (mirrors PostgreSQL). */
const SYNC_COLUMNS = `
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  server_updated_at TEXT,
  version INTEGER NOT NULL DEFAULT 0`;

const NUTRITION_COLUMNS = `
  calories REAL NOT NULL CHECK (calories >= 0),
  protein_g REAL CHECK (protein_g IS NULL OR protein_g >= 0),
  carbs_g REAL CHECK (carbs_g IS NULL OR carbs_g >= 0),
  fat_g REAL CHECK (fat_g IS NULL OR fat_g >= 0),
  fiber_g REAL CHECK (fiber_g IS NULL OR fiber_g >= 0),
  sugar_g REAL CHECK (sugar_g IS NULL OR sugar_g >= 0),
  salt_g REAL CHECK (salt_g IS NULL OR salt_g >= 0)`;

const LOCAL_MEDIA_COLUMNS = `
  local_uri TEXT,
  upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'uploaded', 'failed')),
  upload_attempts INTEGER NOT NULL DEFAULT 0,
  upload_error TEXT`;

/**
 * Append-only list. Never edit a released migration: add a new one.
 * Destructive changes (DROP/rename) must copy data first and are reviewed
 * against docs/DATABASE.md "SQLite migration rules".
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    statements: [
      `CREATE TABLE app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE meals (
        id TEXT PRIMARY KEY NOT NULL,
        eaten_at TEXT NOT NULL,
        local_date TEXT NOT NULL CHECK (length(local_date) = 10),
        meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
        title TEXT,
        notes TEXT,${SYNC_COLUMNS}
      )`,
      `CREATE INDEX idx_meals_user_date ON meals (user_id, local_date)`,
      `CREATE INDEX idx_meals_user_eaten ON meals (user_id, eaten_at)`,
      `CREATE TABLE foods (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        brand TEXT,
        barcode TEXT,
        serving_size REAL NOT NULL CHECK (serving_size > 0),
        serving_unit TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('custom', 'provider')),
        external_id TEXT,${NUTRITION_COLUMNS},${SYNC_COLUMNS}
      )`,
      `CREATE INDEX idx_foods_user_name ON foods (user_id, name COLLATE NOCASE)`,
      `CREATE INDEX idx_foods_barcode ON foods (barcode) WHERE barcode IS NOT NULL`,
      `CREATE TABLE meal_items (
        id TEXT PRIMARY KEY NOT NULL,
        meal_id TEXT NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
        food_id TEXT,
        food_name TEXT NOT NULL CHECK (length(trim(food_name)) > 0),
        quantity REAL NOT NULL CHECK (quantity > 0),
        unit TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',${NUTRITION_COLUMNS},${SYNC_COLUMNS}
      )`,
      `CREATE INDEX idx_meal_items_meal ON meal_items (meal_id)`,
      `CREATE INDEX idx_meal_items_user_created ON meal_items (user_id, created_at)`,
      `CREATE INDEX idx_meal_items_food ON meal_items (food_id) WHERE food_id IS NOT NULL`,
      `CREATE TABLE favorite_foods (
        id TEXT PRIMARY KEY NOT NULL,
        food_id TEXT NOT NULL REFERENCES foods (id) ON DELETE CASCADE,${SYNC_COLUMNS},
        UNIQUE (user_id, food_id)
      )`,
      `CREATE TABLE nutrition_goals (
        id TEXT PRIMARY KEY NOT NULL,
        nutrient TEXT NOT NULL,
        target REAL NOT NULL CHECK (target > 0),${SYNC_COLUMNS},
        UNIQUE (user_id, nutrient)
      )`,
      `CREATE TABLE weight_entries (
        id TEXT PRIMARY KEY NOT NULL,
        measured_at TEXT NOT NULL,
        weight_kg REAL NOT NULL CHECK (weight_kg > 0 AND weight_kg < 1000),
        notes TEXT,${SYNC_COLUMNS}
      )`,
      `CREATE INDEX idx_weight_user_measured ON weight_entries (user_id, measured_at)`,
      `CREATE TABLE water_entries (
        id TEXT PRIMARY KEY NOT NULL,
        consumed_at TEXT NOT NULL,
        local_date TEXT NOT NULL CHECK (length(local_date) = 10),
        amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 10000),${SYNC_COLUMNS}
      )`,
      `CREATE INDEX idx_water_user_date ON water_entries (user_id, local_date)`,
      `CREATE TABLE media_files (
        id TEXT PRIMARY KEY NOT NULL,
        meal_id TEXT NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo')),
        storage_path TEXT,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
        width INTEGER,
        height INTEGER,${LOCAL_MEDIA_COLUMNS},${SYNC_COLUMNS}
      )`,
      `CREATE INDEX idx_media_user_meal ON media_files (user_id, meal_id)`,
      `CREATE TABLE voice_notes (
        id TEXT PRIMARY KEY NOT NULL,
        meal_id TEXT REFERENCES meals (id) ON DELETE SET NULL,
        storage_path TEXT,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
        duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
        transcript TEXT,${LOCAL_MEDIA_COLUMNS},${SYNC_COLUMNS}
      )`,
      `CREATE INDEX idx_voice_user_meal ON voice_notes (user_id, meal_id)`,
      `CREATE TABLE sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_attempt_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (entity, entity_id)
      )`,
      `CREATE INDEX idx_outbox_due ON sync_outbox (next_attempt_at)`,
    ],
  },
];

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const row = await db.first<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  return row?.v ?? 0;
}

/**
 * Applies pending migrations in order, each one atomically together with its
 * bookkeeping row. A failure leaves the database at the last good version.
 */
export async function migrate(db: SqlDatabase, migrations: Migration[] = MIGRATIONS): Promise<number> {
  await db.exec('PRAGMA foreign_keys = ON');
  const current = await getSchemaVersion(db);
  const latest = migrations.reduce((max, m) => Math.max(max, m.version), 0);
  if (current > latest) {
    throw new AppError('migration', `Database schema v${current} is newer than this app (v${latest}).`);
  }
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    try {
      await db.transaction(async (tx) => {
        for (const sql of m.statements) await tx.exec(sql);
        await tx.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
          m.version,
          m.name,
          new Date().toISOString(),
        ]);
      });
    } catch (error) {
      throw new AppError('migration', `Migration ${m.version} (${m.name}) failed`, { cause: error });
    }
  }
  return latest;
}
