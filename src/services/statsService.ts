import type { SqlDatabase } from '@/database/types';
import { calorieTrend, isValidRange, type RangeSummary } from '@/domain/stats';
import type { DailyTotals, Goals } from '@/domain/types';
import { mealRepository } from '@/repositories/mealRepository';
import { daysBetweenInclusive, type LocalDate } from '@/utils/dates';
import { AppError } from '@/utils/errors';
import { goalRepository } from '@/repositories/bodyRepository';
import type { OwnerProvider } from './mealService';

export interface RangeStats {
  from: LocalDate;
  to: LocalDate;
  daily: DailyTotals[];
  summary: RangeSummary;
  /** kcal per day (least squares over logged days), null with < 3 logged days. */
  calorieTrend: number | null;
  goals: Goals;
}

export class StatsService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
  ) {}

  async range(from: LocalDate, to: LocalDate): Promise<RangeStats> {
    if (!isValidRange(from, to)) throw new AppError('validation', 'Invalid range', { details: { range: 'invalid' } });
    const owner = this.owner();
    const goalRows = await goalRepository.list(this.db, owner);
    const goals: Goals = {};
    for (const g of goalRows) goals[g.nutrient] = g.target;
    const [daily, s] = await Promise.all([
      mealRepository.dailyTotals(this.db, owner, from, to),
      mealRepository.rangeSummary(this.db, owner, from, to, goals.calories ?? null),
    ]);
    const round = (v: number | null, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
    return {
      from,
      to,
      daily,
      goals,
      calorieTrend: calorieTrend(daily, from),
      summary: {
        days: daysBetweenInclusive(from, to),
        loggedDays: s.logged_days,
        average: {
          calories: round(s.avg_calories, 0),
          protein_g: round(s.avg_protein_g),
          carbs_g: round(s.avg_carbs_g),
          fat_g: round(s.avg_fat_g),
        },
        total: {
          calories: Math.round(s.total_calories),
          protein_g: round(s.total_protein_g) ?? 0,
          carbs_g: round(s.total_carbs_g) ?? 0,
          fat_g: round(s.total_fat_g) ?? 0,
        },
        goalHitDays: goals.calories ? s.goal_hit_days : null,
      },
    };
  }
}
