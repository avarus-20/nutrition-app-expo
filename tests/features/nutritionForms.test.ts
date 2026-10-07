import { en } from '@/i18n/en';
import { entryNutrition, fromFood, fromRecent, toItemInput } from '@/features/add/selection';
import { nutritionToText, parseNutrition, parsePositive, parseTime, scaleNutrition } from '@/features/nutrition/nutritionForm';
import { inputNumber } from '@/features/nutrition/NutritionFields';
import { mealTypeForTime } from '@/features/nutrition/pickers';
import type { FoodWithFavorite } from '@/repositories/foodRepository';
import type { MealItem } from '@/domain/types';

const N = { calories: 200, protein_g: 10, carbs_g: null, fat_g: 4.4, fiber_g: null, sugar_g: null, salt_g: 0.25 };

describe('nutrition form', () => {
  it('parses decimal commas, requires calories and keeps unknown values null', () => {
    const text = { ...nutritionToText(null, String), calories: '250', protein_g: '12,5' };
    const r = parseNutrition(text, en);
    expect(r.errors).toBeNull();
    expect(r.value).toMatchObject({ calories: 250, protein_g: 12.5, carbs_g: null });
  });

  it('reports field errors', () => {
    const r = parseNutrition({ ...nutritionToText(null, String), protein_g: 'abc', fat_g: '-1' }, en);
    expect(r.errors).toEqual({ calories: en.common.required, protein_g: en.common.invalidNumber, fat_g: en.common.outOfRange });
  });

  it('validates positive amounts', () => {
    expect(parsePositive('0', 10, en).error).toBe(en.common.outOfRange);
    expect(parsePositive('', 10, en).error).toBe(en.common.required);
    expect(parsePositive('2,5', 10, en).value).toBe(2.5);
  });

  it('scales nutrition and keeps unknown nutrients unknown', () => {
    expect(scaleNutrition(N, 100, 150)).toEqual({ calories: 300, protein_g: 15, carbs_g: null, fat_g: 6.6, fiber_g: null, sugar_g: null, salt_g: 0.38 });
  });

  it('parses 24h times', () => {
    expect(parseTime('8:05')).toBe('08:05');
    expect(parseTime('23.59')).toBe('23:59');
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('noon')).toBeNull();
  });

  it('formats numbers for inputs without grouping', () => {
    expect(inputNumber({ language: 'en' }, 1234.5)).toBe('1234.5');
    expect(inputNumber({ language: 'fi' }, 1234.5)).toBe('1234,5');
  });

  it('chooses a meal type for the time of day', () => {
    const at = (h: number, m = 0) => new Date(2024, 0, 1, h, m);
    expect(mealTypeForTime(at(7))).toBe('breakfast');
    expect(mealTypeForTime(at(12))).toBe('lunch');
    expect(mealTypeForTime(at(16))).toBe('snack');
    expect(mealTypeForTime(at(20))).toBe('dinner');
  });
});

describe('add-flow selection', () => {
  const food = { id: 'f1', name: 'Rice', brand: 'Acme', serving_size: 100, serving_unit: 'g', ...N } as unknown as FoodWithFavorite;
  const recent = { food_name: 'Tea', food_id: null, quantity: 2, unit: 'cup', ...N } as unknown as MealItem;

  it('scales a food to the entered amount', () => {
    const e = { ...fromFood(food, String), quantityText: '50' };
    expect(entryNutrition(e)?.calories).toBe(100);
    expect(toItemInput(e)).toMatchObject({ food_name: 'Rice (Acme)', food_id: 'f1', quantity: 50, unit: 'g', source: 'food' });
  });

  it('re-uses recent entries proportionally', () => {
    const e = { ...fromRecent(recent, String), quantityText: '1' };
    expect(toItemInput(e)).toMatchObject({ food_name: 'Tea', quantity: 1, calories: 100, source: 'recent' });
  });

  it('rejects invalid amounts', () => {
    expect(toItemInput({ ...fromFood(food, String), quantityText: 'x' })).toBeNull();
    expect(toItemInput({ ...fromFood(food, String), quantityText: '0' })).toBeNull();
  });
});
