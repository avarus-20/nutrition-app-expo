import {
  goalProgress,
  macroEnergySplit,
  scaleFoodNutrition,
  sumCalories,
  sumNutrition,
} from '@/domain/nutrition';

describe('nutrition calculations', () => {
  it('sums calories and keeps unknown nutrients null', () => {
    const total = sumNutrition([
      { calories: 100.4, protein_g: 10, carbs_g: null },
      { calories: 200.2, protein_g: 2.25, fat_g: 5 },
    ]);
    expect(total.calories).toBe(301);
    expect(total.protein_g).toBe(12.3);
    expect(total.fat_g).toBe(5);
    expect(total.carbs_g).toBeNull();
    expect(total.salt_g).toBeNull();
  });

  it('ignores non-finite values', () => {
    expect(sumCalories([{ calories: 50 }, { calories: Number.NaN }, { calories: Infinity }])).toBe(50);
    expect(sumNutrition([{ calories: Number.NaN }]).calories).toBe(0);
  });

  it('returns zero totals for an empty list', () => {
    expect(sumNutrition([]).calories).toBe(0);
  });

  it('scales food nutrition by serving size', () => {
    const food = {
      calories: 52,
      protein_g: 0.3,
      carbs_g: 14,
      fat_g: 0.2,
      fiber_g: 2.4,
      sugar_g: null,
      salt_g: 0.002,
      serving_size: 100,
    };
    const n = scaleFoodNutrition(food, 150);
    expect(n.calories).toBe(78);
    expect(n.carbs_g).toBe(21);
    expect(n.sugar_g).toBeNull();
    expect(n.salt_g).toBe(0);
  });

  it('refuses invalid quantities', () => {
    const food = { calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: null, sugar_g: null, salt_g: null, serving_size: 1 };
    expect(scaleFoodNutrition(food, 0).calories).toBe(0);
    expect(scaleFoodNutrition(food, -5).calories).toBe(0);
  });

  it('computes goal progress', () => {
    expect(goalProgress('calories', 1500, { calories: 2000 })).toEqual({
      key: 'calories',
      consumed: 1500,
      target: 2000,
      remaining: 500,
      ratio: 0.75,
    });
    expect(goalProgress('calories', 2500, { calories: 2000 }).remaining).toBe(-500);
    expect(goalProgress('protein_g', 50, {}).target).toBeNull();
    expect(goalProgress('protein_g', null, { protein_g: 100 }).consumed).toBe(0);
  });

  it('computes macro energy split', () => {
    const split = macroEnergySplit({ calories: 0, protein_g: 25, carbs_g: 25, fat_g: 0, fiber_g: null, sugar_g: null, salt_g: null });
    expect(split).toEqual({ protein: 0.5, carbs: 0.5, fat: 0 });
    expect(macroEnergySplit({ calories: 10, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sugar_g: null, salt_g: null })).toBeNull();
  });
});
