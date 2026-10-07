import type { SqlDatabase } from '@/database/types';
import type { GoalKey, Goals, WaterEntry, WeightEntry } from '@/domain/types';
import {
  goalInputSchema,
  waterInputSchema,
  weightInputSchema,
  type WaterInput,
  type WeightInput,
} from '@/domain/validation';
import { baseRow, enqueueChange, insertEntity, nextTimestamp, softDeleteEntity, updateEntity } from '@/repositories/base';
import { goalRepository, waterRepository, weightRepository } from '@/repositories/bodyRepository';
import type { LocalDate } from '@/utils/dates';
import { AppError } from '@/utils/errors';
import { deterministicId, newId } from '@/utils/ids';
import { dataEvents } from './events';
import type { OwnerProvider } from './mealService';
import { validate } from './validate';

/** Goal ids are derived from (owner, nutrient) so devices converge on one row per nutrient. */
export function goalId(ownerId: string, nutrient: GoalKey): Promise<string> {
  return deterministicId('nutrition_goal', `${ownerId}:${nutrient}`);
}

export class GoalService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
  ) {}

  async getGoals(): Promise<Goals> {
    const rows = await goalRepository.list(this.db, this.owner());
    const goals: Goals = {};
    for (const r of rows) goals[r.nutrient] = r.target;
    return goals;
  }

  /** Sets or clears (`null`) a daily target. */
  async setGoal(nutrient: GoalKey, target: number | null): Promise<void> {
    const owner = this.owner();
    if (target !== null) validate(goalInputSchema, { nutrient, target });
    const id = await goalId(owner, nutrient);
    await this.db.transaction(async (tx) => {
      const existing = await goalRepository.getAny(tx, owner, nutrient);
      if (!existing) {
        if (target !== null) await insertEntity(tx, 'nutrition_goals', { ...baseRow(id, owner), nutrient, target });
        return;
      }
      const ts = nextTimestamp(existing.updated_at);
      if (target === null) {
        if (existing.deleted_at) return;
        await tx.run('UPDATE nutrition_goals SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, existing.id]);
      } else {
        await tx.run('UPDATE nutrition_goals SET target = ?, deleted_at = NULL, updated_at = ? WHERE id = ?', [
          target,
          ts,
          existing.id,
        ]);
      }
      await enqueueChange(tx, 'nutrition_goals', existing.id);
    });
    dataEvents.emit(['nutrition_goals']);
  }
}

export class WeightService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
  ) {}

  list(limit?: number): Promise<WeightEntry[]> {
    return weightRepository.list(this.db, this.owner(), limit);
  }

  inRange(fromIso: string, toIso: string): Promise<WeightEntry[]> {
    return weightRepository.inRange(this.db, this.owner(), fromIso, toIso);
  }

  get(id: string): Promise<WeightEntry | null> {
    return weightRepository.get(this.db, this.owner(), id);
  }

  async add(input: WeightInput): Promise<string> {
    const entry = validate(weightInputSchema, input);
    const owner = this.owner();
    const id = newId();
    await this.db.transaction((tx) => insertEntity(tx, 'weight_entries', { ...baseRow(id, owner), ...entry }));
    dataEvents.emit(['weight_entries']);
    return id;
  }

  async update(id: string, input: WeightInput): Promise<void> {
    const entry = validate(weightInputSchema, input);
    const owner = this.owner();
    await this.db.transaction((tx) => updateEntity(tx, 'weight_entries', owner, id, entry));
    dataEvents.emit(['weight_entries']);
  }

  async remove(id: string): Promise<void> {
    const owner = this.owner();
    await this.db.transaction(async (tx) => {
      const n = await softDeleteEntity(tx, 'weight_entries', owner, { column: 'id', value: id });
      if (n === 0) throw new AppError('not_found', 'Weight entry not found');
    });
    dataEvents.emit(['weight_entries']);
  }
}

export class WaterService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
  ) {}

  forDay(date: LocalDate): Promise<WaterEntry[]> {
    return waterRepository.forDay(this.db, this.owner(), date);
  }

  dailyTotals(from: LocalDate, to: LocalDate) {
    return waterRepository.dailyTotals(this.db, this.owner(), from, to);
  }

  async add(input: WaterInput): Promise<string> {
    const entry = validate(waterInputSchema, input);
    const owner = this.owner();
    const id = newId();
    await this.db.transaction((tx) => insertEntity(tx, 'water_entries', { ...baseRow(id, owner), ...entry }));
    dataEvents.emit(['water_entries']);
    return id;
  }

  async remove(id: string): Promise<void> {
    const owner = this.owner();
    await this.db.transaction(async (tx) => {
      const n = await softDeleteEntity(tx, 'water_entries', owner, { column: 'id', value: id });
      if (n === 0) throw new AppError('not_found', 'Water entry not found');
    });
    dataEvents.emit(['water_entries']);
  }
}
