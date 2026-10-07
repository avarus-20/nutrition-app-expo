import { z } from 'zod';

import { isValidLocalDate } from '@/utils/dates';
import { GOAL_KEYS, MEAL_TYPES, UNITS } from './types';

/**
 * Parses user-entered numbers. Accepts both `1.5` and `1,5` (RU/FI decimal
 * comma). Returns `null` for an empty string and `NaN` for garbage.
 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return input;
  const s = input.trim().replace(/\s+/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return Number.NaN;
  return Number(s);
}

const nonNegative = (max: number) => z.number().finite().min(0).max(max);
const optionalNonNegative = (max: number) => nonNegative(max).nullable();

export const nutritionInputSchema = z.object({
  calories: nonNegative(20000),
  protein_g: optionalNonNegative(2000),
  carbs_g: optionalNonNegative(2000),
  fat_g: optionalNonNegative(2000),
  fiber_g: optionalNonNegative(500),
  sugar_g: optionalNonNegative(2000),
  salt_g: optionalNonNegative(200),
});

export const mealItemInputSchema = nutritionInputSchema.extend({
  food_name: z.string().trim().min(1).max(200),
  food_id: z.uuid().nullable(),
  quantity: z.number().finite().positive().max(100000),
  unit: z.enum(UNITS),
});
export type MealItemInput = z.infer<typeof mealItemInputSchema>;

export const mealInputSchema = z.object({
  local_date: z.string().refine(isValidLocalDate, 'invalid_date'),
  eaten_at: z.iso.datetime({ offset: true }),
  meal_type: z.enum(MEAL_TYPES),
  title: z.string().trim().max(200).nullable(),
  notes: z.string().trim().max(4000).nullable(),
});
export type MealInput = z.infer<typeof mealInputSchema>;

export const foodInputSchema = nutritionInputSchema.extend({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).nullable(),
  barcode: z
    .string()
    .trim()
    .regex(/^[0-9]{6,14}$/)
    .nullable(),
  serving_size: z.number().finite().positive().max(100000),
  serving_unit: z.enum(UNITS),
});
export type FoodInput = z.infer<typeof foodInputSchema>;

export const goalInputSchema = z.object({
  nutrient: z.enum(GOAL_KEYS),
  target: z.number().finite().positive().max(100000),
});

export const weightInputSchema = z.object({
  measured_at: z.iso.datetime({ offset: true }),
  weight_kg: z.number().finite().min(1).max(700),
  notes: z.string().trim().max(1000).nullable(),
});
export type WeightInput = z.infer<typeof weightInputSchema>;

export const waterInputSchema = z.object({
  consumed_at: z.iso.datetime({ offset: true }),
  local_date: z.string().refine(isValidLocalDate, 'invalid_date'),
  amount_ml: z.number().int().positive().max(10000),
});
export type WaterInput = z.infer<typeof waterInputSchema>;

export type FieldErrors = Record<string, string>;

/** Flattens a zod error into `{ field: issueCode }` for form display. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.code;
  }
  return out;
}
