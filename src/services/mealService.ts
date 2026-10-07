import type { SqlDatabase, SqlExecutor } from '@/database/types';
import type { Meal, MealItem, MealItemSource, MealType, MealWithItems } from '@/domain/types';
import {
  mealInputSchema,
  mealItemInputSchema,
  type MealInput,
  type MealItemInput,
} from '@/domain/validation';
import { baseRow, insertEntity, softDeleteEntity, updateEntity } from '@/repositories/base';
import { mealRepository } from '@/repositories/mealRepository';
import { localDateTimeToIso, type LocalDate } from '@/utils/dates';
import { AppError } from '@/utils/errors';
import { newId } from '@/utils/ids';
import { dataEvents } from './events';
import { validate } from './validate';

export type OwnerProvider = () => string;

const DEFAULT_TIMES: Record<MealType, string> = {
  breakfast: '08:00',
  lunch: '12:30',
  dinner: '18:30',
  snack: '15:30',
};

export function defaultEatenAt(date: LocalDate, mealType: MealType, now: Date = new Date()): string {
  const isToday =
    now.getFullYear() === Number(date.slice(0, 4)) &&
    now.getMonth() + 1 === Number(date.slice(5, 7)) &&
    now.getDate() === Number(date.slice(8, 10));
  return isToday ? now.toISOString() : localDateTimeToIso(date, DEFAULT_TIMES[mealType]);
}

export class MealService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
  ) {}

  getDay(date: LocalDate): Promise<MealWithItems[]> {
    return mealRepository.getMealsForDay(this.db, this.owner(), date);
  }

  getMeal(id: string): Promise<MealWithItems | null> {
    return mealRepository.getMeal(this.db, this.owner(), id);
  }

  getItem(id: string): Promise<MealItem | null> {
    return mealRepository.getItem(this.db, this.owner(), id);
  }

  dailyTotals(from: LocalDate, to: LocalDate) {
    return mealRepository.dailyTotals(this.db, this.owner(), from, to);
  }

  daysWithData(limit: number, offset: number) {
    return mealRepository.daysWithData(this.db, this.owner(), limit, offset);
  }

  recentItems(limit = 20) {
    return mealRepository.recentItems(this.db, this.owner(), limit);
  }

  private async insertMeal(tx: SqlExecutor, owner: string, input: MealInput): Promise<string> {
    const id = newId();
    await insertEntity(tx, 'meals', { ...baseRow(id, owner), ...input });
    return id;
  }

  private async insertItem(
    tx: SqlExecutor,
    owner: string,
    mealId: string,
    input: MealItemInput,
    source: MealItemSource,
  ): Promise<string> {
    const id = newId();
    await insertEntity(tx, 'meal_items', { ...baseRow(id, owner), ...input, meal_id: mealId, source });
    return id;
  }

  async createMeal(input: MealInput, items: MealItemInput[] = [], source: MealItemSource = 'manual'): Promise<string> {
    const meal = validate(mealInputSchema, input);
    const validItems = items.map((i) => validate(mealItemInputSchema, i));
    const owner = this.owner();
    const id = await this.db.transaction(async (tx) => {
      const mealId = await this.insertMeal(tx, owner, meal);
      for (const item of validItems) await this.insertItem(tx, owner, mealId, item, source);
      return mealId;
    });
    dataEvents.emit(['meals', 'meal_items']);
    return id;
  }

  /**
   * Adds items to the meal of the given type on the given day, creating the
   * meal if needed. All items are written in one transaction.
   */
  async addItemsToDay(
    target: { date: LocalDate; mealType: MealType; mealId?: string | null },
    items: MealItemInput[],
    source: MealItemSource = 'manual',
  ): Promise<string> {
    if (items.length === 0) throw new AppError('validation', 'No items', { details: { items: 'too_small' } });
    const validItems = items.map((i) => validate(mealItemInputSchema, i));
    const owner = this.owner();
    const mealId = await this.db.transaction(async (tx) => {
      let id = target.mealId ?? null;
      if (id) {
        const existing = await tx.first<{ id: string }>(
          'SELECT id FROM meals WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
          [id, owner],
        );
        if (!existing) throw new AppError('not_found', 'Meal not found');
      } else {
        const existing = await mealRepository.findMealByType(tx, owner, target.date, target.mealType);
        id =
          existing?.id ??
          (await this.insertMeal(
            tx,
            owner,
            validate(mealInputSchema, {
              local_date: target.date,
              eaten_at: defaultEatenAt(target.date, target.mealType),
              meal_type: target.mealType,
              title: null,
              notes: null,
            }),
          ));
      }
      for (const item of validItems) await this.insertItem(tx, owner, id, item, source);
      return id;
    });
    dataEvents.emit(['meals', 'meal_items']);
    return mealId;
  }

  async updateMeal(id: string, patch: Partial<MealInput>): Promise<void> {
    const owner = this.owner();
    const current = await mealRepository.getMeal(this.db, owner, id);
    if (!current) throw new AppError('not_found', 'Meal not found');
    const merged = validate(mealInputSchema, {
      local_date: current.local_date,
      eaten_at: current.eaten_at,
      meal_type: current.meal_type,
      title: current.title,
      notes: current.notes,
      ...patch,
    });
    await this.db.transaction((tx) => updateEntity(tx, 'meals', owner, id, merged));
    dataEvents.emit(['meals']);
  }

  /** Soft-deletes the meal and everything attached to it. */
  async deleteMeal(id: string): Promise<void> {
    const owner = this.owner();
    await this.db.transaction(async (tx) => {
      const n = await softDeleteEntity(tx, 'meals', owner, { column: 'id', value: id });
      if (n === 0) throw new AppError('not_found', 'Meal not found');
      await softDeleteEntity(tx, 'meal_items', owner, { column: 'meal_id', value: id });
      await softDeleteEntity(tx, 'media_files', owner, { column: 'meal_id', value: id });
      await softDeleteEntity(tx, 'voice_notes', owner, { column: 'meal_id', value: id });
    });
    dataEvents.emit(['meals', 'meal_items', 'media_files', 'voice_notes']);
  }

  async addItem(mealId: string, input: MealItemInput, source: MealItemSource = 'manual'): Promise<string> {
    return this.addItemsToDay({ date: '1970-01-01', mealType: 'snack', mealId }, [input], source);
  }

  async updateItem(id: string, input: MealItemInput): Promise<void> {
    const item = validate(mealItemInputSchema, input);
    const owner = this.owner();
    await this.db.transaction((tx) => updateEntity(tx, 'meal_items', owner, id, item));
    dataEvents.emit(['meal_items']);
  }

  /** Moves an item to another meal (e.g. lunch -> dinner). */
  async moveItem(id: string, mealId: string): Promise<void> {
    const owner = this.owner();
    await this.db.transaction(async (tx) => {
      const meal = await tx.first<Meal>('SELECT id FROM meals WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [
        mealId,
        owner,
      ]);
      if (!meal) throw new AppError('not_found', 'Meal not found');
      await updateEntity(tx, 'meal_items', owner, id, { meal_id: mealId });
    });
    dataEvents.emit(['meal_items']);
  }

  async deleteItem(id: string): Promise<void> {
    const owner = this.owner();
    await this.db.transaction(async (tx) => {
      const n = await softDeleteEntity(tx, 'meal_items', owner, { column: 'id', value: id });
      if (n === 0) throw new AppError('not_found', 'Item not found');
    });
    dataEvents.emit(['meal_items']);
  }
}
