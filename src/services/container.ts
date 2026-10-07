import type { SqlDatabase } from '@/database/types';
import * as localFiles from '@/media/localFiles';
import { GoalService, WaterService, WeightService } from './bodyService';
import { DraftService } from './draftService';
import { FoodService } from './foodService';
import { MealService, type OwnerProvider } from './mealService';
import { PhotoService, type MediaFileStore } from './photoService';
import { SettingsService } from './settingsService';
import { StatsService } from './statsService';
import { VoiceService } from './voiceService';

export interface Services {
  db: SqlDatabase;
  meals: MealService;
  foods: FoodService;
  goals: GoalService;
  weight: WeightService;
  water: WaterService;
  settings: SettingsService;
  stats: StatsService;
  photos: PhotoService;
  voice: VoiceService;
  drafts: DraftService;
  files: MediaFileStore;
}

export function createServices(db: SqlDatabase, owner: OwnerProvider, files: MediaFileStore = localFiles): Services {
  const meals = new MealService(db, owner);
  return {
    db,
    meals,
    foods: new FoodService(db, owner),
    goals: new GoalService(db, owner),
    weight: new WeightService(db, owner),
    water: new WaterService(db, owner),
    settings: new SettingsService(db),
    stats: new StatsService(db, owner),
    photos: new PhotoService(db, owner, files),
    voice: new VoiceService(db, owner, files),
    drafts: new DraftService(db, owner, meals),
    files,
  };
}
