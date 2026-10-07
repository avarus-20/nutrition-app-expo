import type { SqlExecutor } from '@/database/types';
import type { NutritionGoal, WaterEntry, WeightEntry } from '@/domain/types';
import type { LocalDate } from '@/utils/dates';

export const goalRepository = {
  async list(db: SqlExecutor, ownerId: string): Promise<NutritionGoal[]> {
    return db.all<NutritionGoal>(
      'SELECT * FROM nutrition_goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY nutrient',
      [ownerId],
    );
  },

  async getAny(db: SqlExecutor, ownerId: string, nutrient: string): Promise<NutritionGoal | null> {
    return db.first<NutritionGoal>('SELECT * FROM nutrition_goals WHERE user_id = ? AND nutrient = ?', [
      ownerId,
      nutrient,
    ]);
  },
};

export const weightRepository = {
  async list(db: SqlExecutor, ownerId: string, limit = 365): Promise<WeightEntry[]> {
    return db.all<WeightEntry>(
      `SELECT * FROM weight_entries WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY measured_at DESC LIMIT ?`,
      [ownerId, limit],
    );
  },

  async inRange(db: SqlExecutor, ownerId: string, fromIso: string, toIso: string): Promise<WeightEntry[]> {
    return db.all<WeightEntry>(
      `SELECT * FROM weight_entries WHERE user_id = ? AND deleted_at IS NULL
         AND measured_at >= ? AND measured_at < ?
       ORDER BY measured_at ASC`,
      [ownerId, fromIso, toIso],
    );
  },

  async get(db: SqlExecutor, ownerId: string, id: string): Promise<WeightEntry | null> {
    return db.first<WeightEntry>(
      'SELECT * FROM weight_entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, ownerId],
    );
  },
};

export const waterRepository = {
  async forDay(db: SqlExecutor, ownerId: string, date: LocalDate): Promise<WaterEntry[]> {
    return db.all<WaterEntry>(
      `SELECT * FROM water_entries WHERE user_id = ? AND local_date = ? AND deleted_at IS NULL
       ORDER BY consumed_at ASC`,
      [ownerId, date],
    );
  },

  async dailyTotals(
    db: SqlExecutor,
    ownerId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ date: LocalDate; amount_ml: number }[]> {
    return db.all(
      `SELECT local_date AS date, SUM(amount_ml) AS amount_ml FROM water_entries
       WHERE user_id = ? AND deleted_at IS NULL AND local_date BETWEEN ? AND ?
       GROUP BY local_date ORDER BY local_date`,
      [ownerId, from, to],
    );
  },
};
