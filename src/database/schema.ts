/**
 * Registry of synchronized tables. Column names are identical in SQLite and
 * PostgreSQL; `localColumns` exist only on the device and are never pushed.
 * The array order is the dependency order used for push, pull and restore.
 */
export const SYNC_BASE_COLUMNS = [
  'id',
  'user_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'server_updated_at',
  'version',
] as const;

const NUTRITION = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'salt_g'] as const;
const LOCAL_MEDIA = ['local_uri', 'upload_status', 'upload_attempts', 'upload_error'] as const;

export const ENTITY_TABLES = {
  foods: {
    columns: ['name', 'brand', 'barcode', 'serving_size', 'serving_unit', 'source', 'external_id', ...NUTRITION],
    localColumns: [],
  },
  favorite_foods: { columns: ['food_id'], localColumns: [] },
  nutrition_goals: { columns: ['nutrient', 'target'], localColumns: [] },
  meals: { columns: ['eaten_at', 'local_date', 'meal_type', 'title', 'notes'], localColumns: [] },
  meal_items: {
    columns: ['meal_id', 'food_id', 'food_name', 'quantity', 'unit', 'source', ...NUTRITION],
    localColumns: [],
  },
  media_files: {
    columns: ['meal_id', 'kind', 'storage_path', 'mime_type', 'size_bytes', 'width', 'height'],
    localColumns: LOCAL_MEDIA,
  },
  voice_notes: {
    columns: ['meal_id', 'storage_path', 'mime_type', 'size_bytes', 'duration_ms', 'transcript'],
    localColumns: LOCAL_MEDIA,
  },
  weight_entries: { columns: ['measured_at', 'weight_kg', 'notes'], localColumns: [] },
  water_entries: { columns: ['consumed_at', 'local_date', 'amount_ml'], localColumns: [] },
} as const satisfies Record<string, { columns: readonly string[]; localColumns: readonly string[] }>;

export type EntityName = keyof typeof ENTITY_TABLES;

export const ENTITY_ORDER = Object.keys(ENTITY_TABLES) as EntityName[];

export const MEDIA_ENTITIES = ['media_files', 'voice_notes'] as const;
export type MediaEntity = (typeof MEDIA_ENTITIES)[number];

/** Columns sent to / received from the server. */
export function remoteColumns(entity: EntityName): string[] {
  return [...SYNC_BASE_COLUMNS, ...ENTITY_TABLES[entity].columns];
}

/** All columns stored locally. */
export function localColumns(entity: EntityName): string[] {
  return [...remoteColumns(entity), ...ENTITY_TABLES[entity].localColumns];
}

export function isEntityName(value: string): value is EntityName {
  return Object.prototype.hasOwnProperty.call(ENTITY_TABLES, value);
}
