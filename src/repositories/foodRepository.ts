import type { SqlExecutor } from '@/database/types';
import type { Food } from '@/domain/types';

export interface FoodWithFavorite extends Food {
  is_favorite: number;
}

const SELECT = `SELECT f.*, CASE WHEN fav.id IS NULL THEN 0 ELSE 1 END AS is_favorite
  FROM foods f
  LEFT JOIN favorite_foods fav ON fav.food_id = f.id AND fav.user_id = ? AND fav.deleted_at IS NULL`;

export const foodRepository = {
  /**
   * SQLite's LIKE/NOCASE only fold ASCII, so Cyrillic and Finnish letters are
   * matched in JS with locale-aware lowercasing. The candidate set is bounded.
   */
  async search(db: SqlExecutor, ownerId: string, query: string, limit = 50): Promise<FoodWithFavorite[]> {
    const q = query.trim().toLocaleLowerCase();
    const rows = await db.all<FoodWithFavorite>(
      `${SELECT}
       WHERE f.deleted_at IS NULL AND (f.user_id = ? OR f.source = 'provider')
       ORDER BY is_favorite DESC, f.updated_at DESC
       LIMIT 5000`,
      [ownerId, ownerId],
    );
    const matches = q
      ? rows.filter(
          (f) =>
            f.name.toLocaleLowerCase().includes(q) ||
            (f.brand ?? '').toLocaleLowerCase().includes(q) ||
            f.barcode === q,
        )
      : rows;
    return matches.slice(0, limit);
  },

  async favorites(db: SqlExecutor, ownerId: string): Promise<FoodWithFavorite[]> {
    return db.all<FoodWithFavorite>(
      `${SELECT}
       WHERE f.deleted_at IS NULL AND fav.id IS NOT NULL
       ORDER BY f.name COLLATE NOCASE ASC`,
      [ownerId],
    );
  },

  async get(db: SqlExecutor, ownerId: string, id: string): Promise<FoodWithFavorite | null> {
    return db.first<FoodWithFavorite>(
      `${SELECT} WHERE f.id = ? AND f.deleted_at IS NULL AND (f.user_id = ? OR f.source = 'provider')`,
      [ownerId, id, ownerId],
    );
  },

  async findByBarcode(db: SqlExecutor, ownerId: string, barcode: string): Promise<Food | null> {
    return db.first<Food>(
      `SELECT * FROM foods WHERE barcode = ? AND deleted_at IS NULL AND (user_id = ? OR source = 'provider') LIMIT 1`,
      [barcode, ownerId],
    );
  },

  async favoriteRow(db: SqlExecutor, foodId: string) {
    return db.first<{ id: string; user_id: string; deleted_at: string | null; updated_at: string }>(
      'SELECT id, user_id, deleted_at, updated_at FROM favorite_foods WHERE food_id = ?',
      [foodId],
    );
  },
};
