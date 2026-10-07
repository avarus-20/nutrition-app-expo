import type { SqlDatabase } from '@/database/types';
import type { Food } from '@/domain/types';
import { foodInputSchema, type FoodInput } from '@/domain/validation';
import { baseRow, enqueueChange, insertEntity, nextTimestamp, softDeleteEntity, updateEntity } from '@/repositories/base';
import { foodRepository, type FoodWithFavorite } from '@/repositories/foodRepository';
import { AppError } from '@/utils/errors';
import { newId } from '@/utils/ids';
import { dataEvents } from './events';
import type { OwnerProvider } from './mealService';
import { validate } from './validate';

/**
 * External food databases (barcode lookup, Open Food Facts, ...) plug in
 * through this interface. Results are copied into the local `foods` table
 * with `source = 'provider'` so they work offline afterwards.
 */
export interface FoodProvider {
  readonly id: string;
  lookupBarcode(barcode: string): Promise<FoodInput | null>;
  search(query: string): Promise<(FoodInput & { external_id: string })[]>;
}

export class FoodService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
    private readonly providers: FoodProvider[] = [],
  ) {}

  search(query: string, limit?: number): Promise<FoodWithFavorite[]> {
    return foodRepository.search(this.db, this.owner(), query, limit);
  }

  favorites(): Promise<FoodWithFavorite[]> {
    return foodRepository.favorites(this.db, this.owner());
  }

  get(id: string): Promise<FoodWithFavorite | null> {
    return foodRepository.get(this.db, this.owner(), id);
  }

  async create(input: FoodInput): Promise<string> {
    const food = validate(foodInputSchema, input);
    const owner = this.owner();
    const id = newId();
    await this.db.transaction((tx) =>
      insertEntity(tx, 'foods', { ...baseRow(id, owner), ...food, source: 'custom', external_id: null }),
    );
    dataEvents.emit(['foods']);
    return id;
  }

  async update(id: string, input: FoodInput): Promise<void> {
    const food = validate(foodInputSchema, input);
    const owner = this.owner();
    await this.db.transaction((tx) => updateEntity(tx, 'foods', owner, id, food));
    dataEvents.emit(['foods']);
  }

  async remove(id: string): Promise<void> {
    const owner = this.owner();
    await this.db.transaction(async (tx) => {
      await softDeleteEntity(tx, 'favorite_foods', owner, { column: 'food_id', value: id });
      const n = await softDeleteEntity(tx, 'foods', owner, { column: 'id', value: id });
      if (n === 0) throw new AppError('not_found', 'Food not found');
    });
    dataEvents.emit(['foods', 'favorite_foods']);
  }

  /**
   * Favorites use the food id as their primary key, so marking the same food
   * as favorite on two offline devices converges to one server row.
   */
  async setFavorite(foodId: string, favorite: boolean): Promise<void> {
    const owner = this.owner();
    await this.db.transaction(async (tx) => {
      const food = await foodRepository.get(tx, owner, foodId);
      if (!food) throw new AppError('not_found', 'Food not found');
      const existing = await foodRepository.favoriteRow(tx, foodId);
      if (!existing) {
        if (favorite) await insertEntity(tx, 'favorite_foods', { ...baseRow(foodId, owner), food_id: foodId });
        return;
      }
      const isActive = existing.deleted_at === null;
      if (isActive === favorite) return;
      const ts = nextTimestamp(existing.updated_at);
      await tx.run('UPDATE favorite_foods SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        favorite ? null : ts,
        ts,
        existing.id,
      ]);
      await enqueueChange(tx, 'favorite_foods', existing.id);
    });
    dataEvents.emit(['favorite_foods']);
  }

  /** Looks up a barcode locally first, then in configured providers. */
  async lookupBarcode(barcode: string): Promise<Food | FoodInput | null> {
    const local = await foodRepository.findByBarcode(this.db, this.owner(), barcode);
    if (local) return local;
    for (const p of this.providers) {
      const found = await p.lookupBarcode(barcode);
      if (found) return found;
    }
    return null;
  }
}
