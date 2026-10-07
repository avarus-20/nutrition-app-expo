import type { Food, GoalKey, Goals, MealItem, Nutrient, Nutrition } from './types';
import { NUTRIENTS } from './types';

export const EMPTY_NUTRITION: Nutrition = {
  calories: 0,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  fiber_g: null,
  sugar_g: null,
  salt_g: null,
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Sums nutrition values. A nutrient stays `null` only when it is unknown for
 * every item; otherwise unknown values count as 0 (documented behavior: totals
 * are a lower bound when some items lack data).
 */
export function sumNutrition(items: readonly Partial<Nutrition>[]): Nutrition {
  const total: Nutrition = { ...EMPTY_NUTRITION };
  for (const item of items) {
    for (const key of NUTRIENTS) {
      const v = item[key];
      if (!finite(v)) continue;
      if (key === 'calories') total.calories += v;
      else total[key] = (total[key] ?? 0) + v;
    }
  }
  for (const key of NUTRIENTS) {
    const v = total[key];
    if (v !== null) (total as unknown as Record<Nutrient, number>)[key] = round(v, key === 'calories' ? 0 : 1);
  }
  return total;
}

export function sumCalories(items: readonly { calories: number }[]): number {
  return Math.round(items.reduce((acc, m) => acc + (finite(m.calories) ? m.calories : 0), 0));
}

/** Scales a food's per-serving nutrition to a quantity expressed in the food's serving unit. */
export function scaleFoodNutrition(food: Pick<Food, keyof Nutrition | 'serving_size'>, quantity: number): Nutrition {
  if (!finite(quantity) || quantity <= 0 || !finite(food.serving_size) || food.serving_size <= 0) {
    return { ...EMPTY_NUTRITION };
  }
  const factor = quantity / food.serving_size;
  const scale = (v: number | null, digits: number) => (finite(v) ? round(v * factor, digits) : null);
  return {
    calories: round(food.calories * factor, 0),
    protein_g: scale(food.protein_g, 1),
    carbs_g: scale(food.carbs_g, 1),
    fat_g: scale(food.fat_g, 1),
    fiber_g: scale(food.fiber_g, 1),
    sugar_g: scale(food.sugar_g, 1),
    salt_g: scale(food.salt_g, 2),
  };
}

export interface GoalProgress {
  key: GoalKey;
  consumed: number;
  target: number | null;
  remaining: number | null;
  /** 0..n ratio of consumed / target (may exceed 1). */
  ratio: number | null;
}

export function goalProgress(key: GoalKey, consumed: number | null, goals: Goals): GoalProgress {
  const target = goals[key];
  const c = finite(consumed) ? consumed : 0;
  if (!finite(target) || target <= 0) {
    return { key, consumed: c, target: null, remaining: null, ratio: null };
  }
  return { key, consumed: c, target, remaining: round(target - c, 1), ratio: c / target };
}

/** Macro energy split (protein/carbs 4 kcal/g, fat 9 kcal/g). */
export function macroEnergySplit(n: Nutrition): { protein: number; carbs: number; fat: number } | null {
  const p = (n.protein_g ?? 0) * 4;
  const c = (n.carbs_g ?? 0) * 4;
  const f = (n.fat_g ?? 0) * 9;
  const total = p + c + f;
  if (total <= 0) return null;
  return { protein: p / total, carbs: c / total, fat: f / total };
}

export function itemNutrition(item: MealItem): Nutrition {
  return {
    calories: item.calories,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
    fiber_g: item.fiber_g,
    sugar_g: item.sugar_g,
    salt_g: item.salt_g,
  };
}
