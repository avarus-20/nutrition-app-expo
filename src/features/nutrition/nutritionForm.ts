import type { Messages } from '@/i18n';
import { NUTRIENTS, type Nutrient, type Nutrition } from '@/domain/types';
import { parseDecimal } from '@/domain/validation';

export type NutritionText = Record<Nutrient, string>;

const LIMITS: Record<Nutrient, number> = {
  calories: 20000,
  protein_g: 2000,
  carbs_g: 2000,
  fat_g: 2000,
  fiber_g: 500,
  sugar_g: 2000,
  salt_g: 200,
};

export function nutritionToText(n: Partial<Nutrition> | null | undefined, format: (v: number) => string): NutritionText {
  const out = {} as NutritionText;
  for (const k of NUTRIENTS) {
    const v = n?.[k];
    out[k] = v === null || v === undefined ? '' : format(v);
  }
  return out;
}

/** Parses the form; calories are required, other nutrients optional. */
export function parseNutrition(
  text: NutritionText,
  m: Messages,
): { value: Nutrition; errors: null } | { value: null; errors: Partial<Record<Nutrient, string>> } {
  const errors: Partial<Record<Nutrient, string>> = {};
  const value = {} as Record<Nutrient, number | null>;
  for (const k of NUTRIENTS) {
    const parsed = parseDecimal(text[k]);
    if (parsed === null) {
      if (k === 'calories') errors[k] = m.common.required;
      value[k] = null;
    } else if (Number.isNaN(parsed)) {
      errors[k] = m.common.invalidNumber;
    } else if (parsed < 0 || parsed > LIMITS[k]) {
      errors[k] = m.common.outOfRange;
    } else {
      value[k] = parsed;
    }
  }
  if (Object.keys(errors).length > 0) return { value: null, errors };
  return { value: { ...value, calories: value.calories ?? 0 } as Nutrition, errors: null };
}

export function parsePositive(text: string, max: number, m: Messages): { value: number; error: null } | { value: null; error: string } {
  const v = parseDecimal(text);
  if (v === null) return { value: null, error: m.common.required };
  if (Number.isNaN(v)) return { value: null, error: m.common.invalidNumber };
  if (v <= 0 || v > max) return { value: null, error: m.common.outOfRange };
  return { value: v, error: null };
}

/** Scales nutrition from `baseQuantity` to `quantity` (unknown stays unknown). */
export function scaleNutrition(n: Nutrition, baseQuantity: number, quantity: number): Nutrition {
  const f = baseQuantity > 0 ? quantity / baseQuantity : 1;
  const r = (v: number | null, d = 1) => (v === null ? null : Math.round(v * f * 10 ** d) / 10 ** d);
  return {
    calories: Math.round(n.calories * f),
    protein_g: r(n.protein_g),
    carbs_g: r(n.carbs_g),
    fat_g: r(n.fat_g),
    fiber_g: r(n.fiber_g),
    sugar_g: r(n.sugar_g),
    salt_g: r(n.salt_g, 2),
  };
}

/** HH:MM (24h) validation for time inputs. */
export function parseTime(text: string): string | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
