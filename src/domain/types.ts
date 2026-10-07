import type { LocalDate } from '@/utils/dates';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const NUTRIENTS = [
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'salt_g',
] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

export const GOAL_KEYS = [...NUTRIENTS, 'water_ml'] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

export const UNITS = ['g', 'ml', 'piece', 'serving', 'slice', 'cup', 'tbsp', 'tsp'] as const;
export type Unit = (typeof UNITS)[number];

/** Nutrition values. Calories are required; everything else may be unknown (null). */
export interface Nutrition {
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
}

/** Columns shared by every synchronized, user-owned record. */
export interface SyncedRecord {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string | null;
  version: number;
}

export interface Meal extends SyncedRecord {
  eaten_at: string;
  local_date: LocalDate;
  meal_type: MealType;
  title: string | null;
  notes: string | null;
}

export type MealItemSource = 'manual' | 'food' | 'recent' | 'voice' | 'photo_ai' | 'legacy' | 'import';

export interface MealItem extends SyncedRecord, Nutrition {
  meal_id: string;
  food_id: string | null;
  food_name: string;
  quantity: number;
  unit: Unit;
  source: MealItemSource;
}

export interface Food extends SyncedRecord, Nutrition {
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_size: number;
  serving_unit: Unit;
  source: 'custom' | 'provider';
  external_id: string | null;
}

export interface FavoriteFood extends SyncedRecord {
  food_id: string;
}

export interface NutritionGoal extends SyncedRecord {
  nutrient: GoalKey;
  target: number;
}

export interface WeightEntry extends SyncedRecord {
  measured_at: string;
  weight_kg: number;
  notes: string | null;
}

export interface WaterEntry extends SyncedRecord {
  consumed_at: string;
  local_date: LocalDate;
  amount_ml: number;
}

export type UploadStatus = 'pending' | 'uploaded' | 'failed';

/** Local-only columns of media records (never sent to the server). */
export interface LocalMediaState {
  local_uri: string | null;
  upload_status: UploadStatus;
  upload_attempts: number;
  upload_error: string | null;
}

export interface MediaFile extends SyncedRecord, LocalMediaState {
  meal_id: string;
  kind: 'photo';
  storage_path: string | null;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
}

export interface VoiceNote extends SyncedRecord, LocalMediaState {
  meal_id: string | null;
  storage_path: string | null;
  mime_type: string;
  size_bytes: number | null;
  duration_ms: number | null;
  transcript: string | null;
}

export interface MealWithItems extends Meal {
  items: MealItem[];
}

export interface DailyTotals extends Nutrition {
  date: LocalDate;
  item_count: number;
}

export type Goals = Partial<Record<GoalKey, number>>;

/** Placeholder owner for data created before the user signs in. */
export const LOCAL_OWNER = 'local';
