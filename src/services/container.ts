import type { SqlDatabase } from '@/database/types';
import { GoalService, WaterService, WeightService } from './bodyService';
import { FoodService } from './foodService';
import { MealService, type OwnerProvider } from './mealService';
import { SettingsService } from './settingsService';

export interface Services {
  db: SqlDatabase;
  meals: MealService;
  foods: FoodService;
  goals: GoalService;
  weight: WeightService;
  water: WaterService;
  settings: SettingsService;
}

export function createServices(db: SqlDatabase, owner: OwnerProvider): Services {
  return {
    db,
    meals: new MealService(db, owner),
    foods: new FoodService(db, owner),
    goals: new GoalService(db, owner),
    weight: new WeightService(db, owner),
    water: new WaterService(db, owner),
    settings: new SettingsService(db),
  };
}
