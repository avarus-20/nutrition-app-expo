import type { MealItem, MealItemSource, Nutrition, Unit } from '@/domain/types';
import type { MealItemInput } from '@/domain/validation';
import type { FoodWithFavorite } from '@/repositories/foodRepository';
import { parseDecimal } from '@/domain/validation';
import { scaleNutrition } from '@/features/nutrition/nutritionForm';

/** A food or recent entry picked in the add flow, with an editable amount. */
export interface SelectedEntry {
  key: string;
  name: string;
  unit: Unit;
  foodId: string | null;
  source: MealItemSource;
  baseQuantity: number;
  baseNutrition: Nutrition;
  quantityText: string;
}

const nutritionOf = (n: Nutrition): Nutrition => ({
  calories: n.calories,
  protein_g: n.protein_g,
  carbs_g: n.carbs_g,
  fat_g: n.fat_g,
  fiber_g: n.fiber_g,
  sugar_g: n.sugar_g,
  salt_g: n.salt_g,
});

export function fromFood(food: FoodWithFavorite, format: (v: number) => string): SelectedEntry {
  return {
    key: `food:${food.id}`,
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    unit: food.serving_unit,
    foodId: food.id,
    source: 'food',
    baseQuantity: food.serving_size,
    baseNutrition: nutritionOf(food),
    quantityText: format(food.serving_size),
  };
}

export function fromRecent(item: MealItem, format: (v: number) => string): SelectedEntry {
  return {
    key: `recent:${item.food_name.toLocaleLowerCase()}`,
    name: item.food_name,
    unit: item.unit,
    foodId: item.food_id,
    source: 'recent',
    baseQuantity: item.quantity,
    baseNutrition: nutritionOf(item),
    quantityText: format(item.quantity),
  };
}

export function entryQuantity(e: SelectedEntry): number | null {
  const q = parseDecimal(e.quantityText);
  return q === null || Number.isNaN(q) || q <= 0 || q > 100000 ? null : q;
}

export function entryNutrition(e: SelectedEntry): Nutrition | null {
  const q = entryQuantity(e);
  return q === null ? null : scaleNutrition(e.baseNutrition, e.baseQuantity, q);
}

export function toItemInput(e: SelectedEntry): (MealItemInput & { source: MealItemSource }) | null {
  const quantity = entryQuantity(e);
  const n = entryNutrition(e);
  if (quantity === null || !n) return null;
  return { ...n, food_name: e.name, food_id: e.foodId, quantity, unit: e.unit, source: e.source };
}
