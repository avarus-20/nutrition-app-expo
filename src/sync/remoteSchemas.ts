import { z } from 'zod';

import type { EntityName } from '@/database/schema';
import { GOAL_KEYS, MEAL_TYPES, UNITS } from '@/domain/types';
import { isValidLocalDate, normalizeIso } from '@/utils/dates';

/** Validation of rows received from the server before they touch SQLite. */
const ts = z.string().transform((v, ctx) => {
  try {
    return normalizeIso(v);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'invalid_timestamp' });
    return z.NEVER;
  }
});
const num = z.number().finite();
const optNum = num.nullable();
const optText = z.string().nullable();
const localDate = z.string().refine(isValidLocalDate);

const base = {
  id: z.uuid(),
  user_id: z.uuid(),
  created_at: ts,
  updated_at: ts,
  deleted_at: ts.nullable(),
  server_updated_at: ts,
  version: z.number().int(),
};

const nutrition = {
  calories: num.min(0),
  protein_g: optNum,
  carbs_g: optNum,
  fat_g: optNum,
  fiber_g: optNum,
  sugar_g: optNum,
  salt_g: optNum,
};

export const REMOTE_SCHEMAS = {
  foods: z.object({
    ...base,
    ...nutrition,
    name: z.string().min(1),
    brand: optText,
    barcode: optText,
    serving_size: num.positive(),
    serving_unit: z.enum(UNITS),
    source: z.enum(['custom', 'provider']),
    external_id: optText,
  }),
  favorite_foods: z.object({ ...base, food_id: z.uuid() }),
  nutrition_goals: z.object({ ...base, nutrient: z.enum(GOAL_KEYS), target: num.positive() }),
  meals: z.object({
    ...base,
    eaten_at: ts,
    local_date: localDate,
    meal_type: z.enum(MEAL_TYPES),
    title: optText,
    notes: optText,
  }),
  meal_items: z.object({
    ...base,
    ...nutrition,
    meal_id: z.uuid(),
    food_id: z.uuid().nullable(),
    food_name: z.string().min(1),
    quantity: num.positive(),
    unit: z.enum(UNITS),
    source: z.string(),
  }),
  media_files: z.object({
    ...base,
    meal_id: z.uuid(),
    kind: z.literal('photo'),
    storage_path: z.string().min(1),
    mime_type: z.string(),
    size_bytes: optNum,
    width: optNum,
    height: optNum,
  }),
  voice_notes: z.object({
    ...base,
    meal_id: z.uuid().nullable(),
    storage_path: z.string().min(1),
    mime_type: z.string(),
    size_bytes: optNum,
    duration_ms: optNum,
    transcript: optText,
  }),
  weight_entries: z.object({ ...base, measured_at: ts, weight_kg: num.positive(), notes: optText }),
  water_entries: z.object({ ...base, consumed_at: ts, local_date: localDate, amount_ml: z.number().int().positive() }),
} satisfies Record<EntityName, z.ZodType>;

export function parseRemoteRow(entity: EntityName, row: unknown): Record<string, string | number | null> | null {
  const result = REMOTE_SCHEMAS[entity].safeParse(row);
  return result.success ? (result.data as Record<string, string | number | null>) : null;
}
