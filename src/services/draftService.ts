import type { SqlDatabase } from '@/database/types';
import { parseStoredItems, sanitizeDraftItems, type DraftItem, type DraftSource, type EntryDraft } from '@/domain/drafts';
import { MEAL_TYPES, type MealItemSource } from '@/domain/types';
import type { MealItemInput } from '@/domain/validation';
import { isValidLocalDate } from '@/utils/dates';
import { AppError } from '@/utils/errors';
import { newId } from '@/utils/ids';
import { dataEvents } from './events';
import type { MealService, MealTarget, OwnerProvider } from './mealService';

interface DraftRow extends Omit<EntryDraft, 'items'> {
  items: string;
}

export interface NewDraft {
  source: DraftSource;
  target: MealTarget;
  items: unknown[];
  mediaId?: string | null;
  voiceNoteId?: string | null;
  inputText?: string | null;
}

const toDraft = (row: DraftRow): EntryDraft => ({ ...row, items: parseStoredItems(row.items) });

/**
 * Review queue for automatically recognized entries (photo estimates, voice
 * notes). Drafts live only on this device; confirming one writes regular
 * meal items through MealService, dismissing one discards it.
 */
export class DraftService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
    private readonly meals: MealService,
  ) {}

  async list(): Promise<EntryDraft[]> {
    const rows = await this.db.all<DraftRow>('SELECT * FROM entry_drafts WHERE user_id = ? ORDER BY created_at DESC', [
      this.owner(),
    ]);
    return rows.map(toDraft);
  }

  async count(): Promise<number> {
    const r = await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM entry_drafts WHERE user_id = ?', [this.owner()]);
    return r?.n ?? 0;
  }

  async get(id: string): Promise<EntryDraft | null> {
    const row = await this.db.first<DraftRow>('SELECT * FROM entry_drafts WHERE id = ? AND user_id = ?', [id, this.owner()]);
    return row ? toDraft(row) : null;
  }

  /** Creates a draft from recognizer output; fails if nothing usable was recognized. */
  async create(input: NewDraft): Promise<string> {
    if (!isValidLocalDate(input.target.date) || !MEAL_TYPES.includes(input.target.mealType)) {
      throw new AppError('validation', 'Invalid draft target');
    }
    const items = sanitizeDraftItems(input.items, newId);
    if (items.length === 0) throw new AppError('validation', 'Nothing recognized', { details: { items: 'too_small' } });
    const id = newId();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO entry_drafts (id, user_id, source, local_date, meal_type, meal_id, media_id, voice_note_id,
         input_text, items, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        this.owner(),
        input.source,
        input.target.date,
        input.target.mealType,
        input.target.mealId ?? null,
        input.mediaId ?? null,
        input.voiceNoteId ?? null,
        input.inputText?.slice(0, 4000) ?? null,
        JSON.stringify(items),
        now,
        now,
      ],
    );
    dataEvents.emit(['entry_drafts']);
    return id;
  }

  /** Saves edits made during review (so they survive leaving the screen). */
  async saveItems(id: string, items: DraftItem[]): Promise<void> {
    const r = await this.db.run('UPDATE entry_drafts SET items = ?, updated_at = ? WHERE id = ? AND user_id = ?', [
      JSON.stringify(items),
      new Date().toISOString(),
      id,
      this.owner(),
    ]);
    if (r.changes === 0) throw new AppError('not_found', 'Draft not found');
    dataEvents.emit(['entry_drafts']);
  }

  async dismiss(id: string): Promise<void> {
    await this.db.run('DELETE FROM entry_drafts WHERE id = ? AND user_id = ?', [id, this.owner()]);
    dataEvents.emit(['entry_drafts']);
  }

  /**
   * Writes the reviewed entries to the draft's meal and removes the draft.
   * The draft's original meal is used if it still exists; otherwise the meal
   * of the same type on the same day (created if needed).
   */
  async confirm(id: string, items: MealItemInput[], target?: MealTarget): Promise<string> {
    const draft = await this.get(id);
    if (!draft) throw new AppError('not_found', 'Draft not found');
    const source: MealItemSource = draft.source;
    let resolved: MealTarget = target ?? { date: draft.local_date, mealType: draft.meal_type, mealId: draft.meal_id };
    if (resolved.mealId) {
      const meal = await this.meals.getMeal(resolved.mealId);
      if (!meal || meal.local_date !== resolved.date || meal.meal_type !== resolved.mealType) {
        resolved = { date: resolved.date, mealType: resolved.mealType, mealId: null };
      }
    }
    const mealId = await this.meals.addItemsToDay(resolved, items, source);
    await this.dismiss(id);
    return mealId;
  }
}
