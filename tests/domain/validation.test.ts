import {
  fieldErrors,
  foodInputSchema,
  mealInputSchema,
  mealItemInputSchema,
  parseDecimal,
  waterInputSchema,
  weightInputSchema,
} from '@/domain/validation';
import { toCsv } from '@/utils/csv';
import { deterministicId, isUuid, newId } from '@/utils/ids';

const item = {
  food_name: 'Egg',
  food_id: null,
  quantity: 2,
  unit: 'piece' as const,
  calories: 140,
  protein_g: 12,
  carbs_g: null,
  fat_g: 10,
  fiber_g: null,
  sugar_g: null,
  salt_g: null,
};

describe('input validation', () => {
  it('parses decimal comma and dot', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal(' 2.25 ')).toBe(2.25);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('1.2.3')).toBeNaN();
  });

  it('accepts a valid meal item with unknown optional nutrients', () => {
    expect(mealItemInputSchema.safeParse(item).success).toBe(true);
  });

  it('rejects negative calories and macros', () => {
    expect(mealItemInputSchema.safeParse({ ...item, calories: -1 }).success).toBe(false);
    expect(mealItemInputSchema.safeParse({ ...item, protein_g: -0.1 }).success).toBe(false);
  });

  it('requires positive quantity and a name', () => {
    const r = mealItemInputSchema.safeParse({ ...item, quantity: 0, food_name: '  ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(errs.quantity).toBeDefined();
      expect(errs.food_name).toBeDefined();
    }
  });

  it('validates meals', () => {
    const base = { local_date: '2024-05-01', eaten_at: '2024-05-01T08:00:00.000Z', meal_type: 'breakfast', title: null, notes: null };
    expect(mealInputSchema.safeParse(base).success).toBe(true);
    expect(mealInputSchema.safeParse({ ...base, local_date: '2024-02-30' }).success).toBe(false);
    expect(mealInputSchema.safeParse({ ...base, meal_type: 'brunch' }).success).toBe(false);
  });

  it('validates foods, weight and water', () => {
    expect(
      foodInputSchema.safeParse({ ...item, name: 'Oats', brand: null, barcode: '6414893400012', serving_size: 100, serving_unit: 'g' }).success,
    ).toBe(true);
    expect(
      foodInputSchema.safeParse({ ...item, name: 'Oats', brand: null, barcode: 'abc', serving_size: 100, serving_unit: 'g' }).success,
    ).toBe(false);
    expect(weightInputSchema.safeParse({ measured_at: '2024-05-01T08:00:00Z', weight_kg: 0, notes: null }).success).toBe(false);
    expect(waterInputSchema.safeParse({ consumed_at: '2024-05-01T08:00:00Z', local_date: '2024-05-01', amount_ml: 250 }).success).toBe(true);
    expect(waterInputSchema.safeParse({ consumed_at: '2024-05-01T08:00:00Z', local_date: '2024-05-01', amount_ml: 2.5 }).success).toBe(false);
  });
});

describe('ids', () => {
  it('generates random uuids', () => {
    expect(isUuid(newId())).toBe(true);
    expect(newId()).not.toBe(newId());
  });

  it('generates stable name-based uuids', async () => {
    const a = await deterministicId('legacy', 'x');
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('5');
    expect(await deterministicId('legacy', 'x')).toBe(a);
    expect(await deterministicId('legacy', 'y')).not.toBe(a);
  });
});

describe('csv', () => {
  it('escapes fields and neutralizes formulas', () => {
    const csv = toCsv(['a', 'b'], [['x,y', '=SUM(A1)'], [1.5, null], ['say "hi"', -3]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"x,y",\'=SUM(A1)');
    expect(csv).toContain('1.5,\r\n');
    expect(csv).toContain('"say ""hi""",-3');
  });
});
