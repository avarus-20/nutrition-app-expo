import {
  calorieTrend,
  dailySeries,
  isValidRange,
  linearSlope,
  movingAverage,
  presetRange,
  trendDirection,
  weightChange,
} from '@/domain/stats';
import type { DailyTotals, WeightEntry } from '@/domain/types';
import { StatsService } from '@/services/statsService';
import { item, servicesFor, setupDb } from '../helpers/fixtures';

const day = (date: string, calories: number, item_count = 1): DailyTotals => ({
  date,
  item_count,
  calories,
  protein_g: 10,
  carbs_g: null,
  fat_g: null,
  fiber_g: null,
  sugar_g: null,
  salt_g: null,
});

const w = (id: string, iso: string, kg: number) => ({ id, measured_at: iso, weight_kg: kg }) as WeightEntry;

describe('stats domain', () => {
  it('computes a least-squares slope', () => {
    expect(linearSlope([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])).toBeCloseTo(2);
    expect(linearSlope([{ x: 0, y: 1 }])).toBeNull();
    expect(linearSlope([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toBeNull();
  });

  it('builds a daily series with gaps for days without entries', () => {
    const s = dailySeries([day('2024-01-01', 100), day('2024-01-03', 0, 0)], '2024-01-01', '2024-01-03', 'calories');
    expect(s).toEqual([
      { date: '2024-01-01', value: 100 },
      { date: '2024-01-02', value: null },
      { date: '2024-01-03', value: null },
    ]);
  });

  it('derives the calorie trend over logged days only', () => {
    const totals = [day('2024-01-01', 2000), day('2024-01-03', 2200), day('2024-01-05', 2400), day('2024-01-06', 0, 0)];
    expect(calorieTrend(totals, '2024-01-01')).toBeCloseTo(100);
    expect(calorieTrend(totals.slice(0, 2), '2024-01-01')).toBeNull();
    expect(trendDirection(100, 10)).toBe('up');
    expect(trendDirection(-5, 10)).toBe('flat');
    expect(trendDirection(null, 10)).toBeNull();
  });

  it('computes a trailing moving average', () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
  });

  it('computes the 30-day weight change', () => {
    const entries = [
      w('a', '2024-01-01T08:00:00Z', 82),
      w('b', '2024-01-20T08:00:00Z', 81),
      w('c', '2024-02-15T08:00:00Z', 79.5),
    ];
    expect(weightChange(entries)).toBe(-2.5);
    expect(weightChange([entries[0]!])).toBeNull();
    expect(weightChange([w('a', '2024-02-10T08:00:00Z', 80), w('b', '2024-02-15T08:00:00Z', 79)])).toBe(-1);
  });

  it('resolves presets and validates ranges', () => {
    expect(presetRange('7', '2024-03-10')).toEqual({ from: '2024-03-04', to: '2024-03-10' });
    expect(presetRange('month', '2024-03-10')).toEqual({ from: '2024-03-01', to: '2024-03-10' });
    expect(isValidRange('2024-03-10', '2024-03-01')).toBe(false);
    expect(isValidRange('2023-01-01', '2024-03-01')).toBe(false);
    expect(isValidRange('2024-03-01', '2024-03-01')).toBe(true);
  });
});

describe('StatsService', () => {
  it('aggregates averages, totals and goal completion in SQL over logged days', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    await s.goals.setGoal('calories', 1000);
    await s.meals.addItemsToDay({ date: '2024-05-01', mealType: 'lunch' }, [item({ calories: 800, protein_g: 40 })]);
    await s.meals.addItemsToDay({ date: '2024-05-02', mealType: 'lunch' }, [
      item({ calories: 700, protein_g: null }),
      item({ calories: 500, protein_g: 20 }),
    ]);
    // An empty meal does not count as a logged day.
    await s.meals.createMeal({ local_date: '2024-05-03', eaten_at: '2024-05-03T10:00:00.000Z', meal_type: 'snack', title: null, notes: null });
    const stats = await new StatsService(db, () => 'local').range('2024-05-01', '2024-05-07');
    expect(stats.summary).toMatchObject({
      days: 7,
      loggedDays: 2,
      goalHitDays: 1,
      average: { calories: 1000, protein_g: 30 },
      total: { calories: 2000, protein_g: 60 },
    });
    expect(stats.daily.filter((d) => d.item_count > 0)).toHaveLength(2);
  });

  it('rejects invalid ranges', async () => {
    const db = await setupDb();
    await expect(new StatsService(db, () => 'local').range('2024-05-07', '2024-05-01')).rejects.toMatchObject({ code: 'validation' });
  });
});
