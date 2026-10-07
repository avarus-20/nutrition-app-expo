import { migrate } from '@/database/migrations';
import type { SqlDatabase } from '@/database/types';
import type { MealItemInput } from '@/domain/validation';
import { FoodService } from '@/services/foodService';
import { GoalService, WaterService, WeightService } from '@/services/bodyService';
import { MealService } from '@/services/mealService';
import { createTestDatabase } from './nodeDriver';

export async function setupDb(): Promise<SqlDatabase> {
  const db = createTestDatabase();
  await migrate(db);
  return db;
}

export function servicesFor(db: SqlDatabase, owner: { id: string } = { id: 'local' }) {
  const o = () => owner.id;
  return {
    meals: new MealService(db, o),
    foods: new FoodService(db, o),
    goals: new GoalService(db, o),
    weight: new WeightService(db, o),
    water: new WaterService(db, o),
  };
}

export function item(overrides: Partial<MealItemInput> = {}): MealItemInput {
  return {
    food_name: 'Egg',
    food_id: null,
    quantity: 1,
    unit: 'piece',
    calories: 70,
    protein_g: 6,
    carbs_g: 0.5,
    fat_g: 5,
    fiber_g: null,
    sugar_g: null,
    salt_g: null,
    ...overrides,
  };
}
