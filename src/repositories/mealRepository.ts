import type { SqlExecutor } from '@/database/types';
import type { DailyTotals, Meal, MealItem, MealType, MealWithItems } from '@/domain/types';
import type { LocalDate } from '@/utils/dates';

const ITEM_ORDER = 'ORDER BY created_at ASC, id ASC';

async function attachItems(db: SqlExecutor, meals: Meal[]): Promise<MealWithItems[]> {
  if (meals.length === 0) return [];
  const ids = meals.map((m) => m.id);
  const items = await db.all<MealItem>(
    `SELECT * FROM meal_items WHERE deleted_at IS NULL AND meal_id IN (${ids.map(() => '?').join(', ')}) ${ITEM_ORDER}`,
    ids,
  );
  const byMeal = new Map<string, MealItem[]>();
  for (const item of items) {
    const list = byMeal.get(item.meal_id) ?? [];
    list.push(item);
    byMeal.set(item.meal_id, list);
  }
  return meals.map((m) => ({ ...m, items: byMeal.get(m.id) ?? [] }));
}

export const mealRepository = {
  async getMealsForDay(db: SqlExecutor, ownerId: string, date: LocalDate): Promise<MealWithItems[]> {
    const meals = await db.all<Meal>(
      `SELECT * FROM meals WHERE user_id = ? AND local_date = ? AND deleted_at IS NULL
       ORDER BY eaten_at ASC, created_at ASC`,
      [ownerId, date],
    );
    return attachItems(db, meals);
  },

  async getMeal(db: SqlExecutor, ownerId: string, id: string): Promise<MealWithItems | null> {
    const meal = await db.first<Meal>(
      'SELECT * FROM meals WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, ownerId],
    );
    if (!meal) return null;
    const [withItems] = await attachItems(db, [meal]);
    return withItems ?? null;
  },

  async findMealByType(
    db: SqlExecutor,
    ownerId: string,
    date: LocalDate,
    mealType: MealType,
  ): Promise<Meal | null> {
    return db.first<Meal>(
      `SELECT * FROM meals WHERE user_id = ? AND local_date = ? AND meal_type = ? AND deleted_at IS NULL
       ORDER BY created_at ASC LIMIT 1`,
      [ownerId, date, mealType],
    );
  },

  async getItem(db: SqlExecutor, ownerId: string, id: string): Promise<MealItem | null> {
    return db.first<MealItem>(
      'SELECT * FROM meal_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, ownerId],
    );
  },

  /** Per-day nutrition totals computed by SQLite (no per-item rows reach JS). */
  async dailyTotals(db: SqlExecutor, ownerId: string, from: LocalDate, to: LocalDate): Promise<DailyTotals[]> {
    return db.all<DailyTotals>(
      `SELECT m.local_date AS date,
              COUNT(i.id) AS item_count,
              COALESCE(ROUND(SUM(i.calories)), 0) AS calories,
              ROUND(SUM(i.protein_g), 1) AS protein_g,
              ROUND(SUM(i.carbs_g), 1) AS carbs_g,
              ROUND(SUM(i.fat_g), 1) AS fat_g,
              ROUND(SUM(i.fiber_g), 1) AS fiber_g,
              ROUND(SUM(i.sugar_g), 1) AS sugar_g,
              ROUND(SUM(i.salt_g), 2) AS salt_g
       FROM meals m
       LEFT JOIN meal_items i ON i.meal_id = m.id AND i.deleted_at IS NULL
       WHERE m.user_id = ? AND m.deleted_at IS NULL AND m.local_date BETWEEN ? AND ?
       GROUP BY m.local_date
       ORDER BY m.local_date ASC`,
      [ownerId, from, to],
    );
  },

  /**
   * Aggregates over the logged days (days with at least one item) of a
   * range: averages, totals and calorie-goal completion, all in SQL.
   */
  async rangeSummary(
    db: SqlExecutor,
    ownerId: string,
    from: LocalDate,
    to: LocalDate,
    calorieGoal: number | null,
  ): Promise<{
    logged_days: number;
    avg_calories: number | null;
    avg_protein_g: number | null;
    avg_carbs_g: number | null;
    avg_fat_g: number | null;
    total_calories: number;
    total_protein_g: number;
    total_carbs_g: number;
    total_fat_g: number;
    goal_hit_days: number;
  }> {
    const row = await db.first<{
      logged_days: number;
      avg_calories: number | null;
      avg_protein_g: number | null;
      avg_carbs_g: number | null;
      avg_fat_g: number | null;
      total_calories: number | null;
      total_protein_g: number | null;
      total_carbs_g: number | null;
      total_fat_g: number | null;
      goal_hit_days: number | null;
    }>(
      `WITH daily AS (
         SELECT m.local_date AS date,
                SUM(i.calories) AS calories, SUM(i.protein_g) AS protein_g,
                SUM(i.carbs_g) AS carbs_g, SUM(i.fat_g) AS fat_g
         FROM meals m
         JOIN meal_items i ON i.meal_id = m.id AND i.deleted_at IS NULL
         WHERE m.user_id = ? AND m.deleted_at IS NULL AND m.local_date BETWEEN ? AND ?
         GROUP BY m.local_date
       )
       SELECT COUNT(*) AS logged_days,
              AVG(calories) AS avg_calories, AVG(protein_g) AS avg_protein_g,
              AVG(carbs_g) AS avg_carbs_g, AVG(fat_g) AS avg_fat_g,
              SUM(calories) AS total_calories, SUM(protein_g) AS total_protein_g,
              SUM(carbs_g) AS total_carbs_g, SUM(fat_g) AS total_fat_g,
              SUM(CASE WHEN ? IS NOT NULL AND calories <= ? THEN 1 ELSE 0 END) AS goal_hit_days
       FROM daily`,
      [ownerId, from, to, calorieGoal, calorieGoal],
    );
    return {
      logged_days: row?.logged_days ?? 0,
      avg_calories: row?.avg_calories ?? null,
      avg_protein_g: row?.avg_protein_g ?? null,
      avg_carbs_g: row?.avg_carbs_g ?? null,
      avg_fat_g: row?.avg_fat_g ?? null,
      total_calories: row?.total_calories ?? 0,
      total_protein_g: row?.total_protein_g ?? 0,
      total_carbs_g: row?.total_carbs_g ?? 0,
      total_fat_g: row?.total_fat_g ?? 0,
      goal_hit_days: row?.goal_hit_days ?? 0,
    };
  },

  /** Days that have at least one meal, newest first (paged). */
  async daysWithData(
    db: SqlExecutor,
    ownerId: string,
    limit: number,
    offset: number,
  ): Promise<{ date: LocalDate; calories: number; meal_count: number }[]> {
    return db.all(
      `SELECT m.local_date AS date,
              COUNT(DISTINCT m.id) AS meal_count,
              COALESCE(ROUND(SUM(i.calories)), 0) AS calories
       FROM meals m
       LEFT JOIN meal_items i ON i.meal_id = m.id AND i.deleted_at IS NULL
       WHERE m.user_id = ? AND m.deleted_at IS NULL
       GROUP BY m.local_date
       ORDER BY m.local_date DESC
       LIMIT ? OFFSET ?`,
      [ownerId, limit, offset],
    );
  },

  /** Most recently used distinct items (by name), for quick re-entry. */
  async recentItems(db: SqlExecutor, ownerId: string, limit: number): Promise<MealItem[]> {
    return db.all<MealItem>(
      `SELECT i.* FROM meal_items i
       JOIN (
         SELECT lower(food_name) AS k, MAX(created_at) AS latest
         FROM meal_items WHERE user_id = ? AND deleted_at IS NULL
         GROUP BY lower(food_name)
       ) r ON lower(i.food_name) = r.k AND i.created_at = r.latest
       WHERE i.user_id = ? AND i.deleted_at IS NULL
       GROUP BY lower(i.food_name)
       ORDER BY i.created_at DESC
       LIMIT ?`,
      [ownerId, ownerId, limit],
    );
  },

  async allItemsInRange(db: SqlExecutor, ownerId: string, from: LocalDate, to: LocalDate) {
    return db.all<MealItem & { local_date: string; meal_type: MealType; eaten_at: string; meal_title: string | null }>(
      `SELECT i.*, m.local_date, m.meal_type, m.eaten_at, m.title AS meal_title
       FROM meal_items i JOIN meals m ON m.id = i.meal_id
       WHERE m.user_id = ? AND m.deleted_at IS NULL AND i.deleted_at IS NULL
         AND m.local_date BETWEEN ? AND ?
       ORDER BY m.local_date ASC, m.eaten_at ASC, i.created_at ASC`,
      [ownerId, from, to],
    );
  },
};
