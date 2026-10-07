import { z } from 'zod';

import type { LocalDate } from '@/utils/dates';
import { UNITS, type MealType, type Unit } from './types';

export type DraftSource = 'photo_ai' | 'voice';

/**
 * One recognized entry awaiting confirmation. Nutrition may be unknown
 * (`null`): the user has to fill it in before the draft can be confirmed.
 */
export interface DraftItem {
  key: string;
  food_name: string;
  quantity: number;
  unit: Unit;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  /** 0..1 as reported by the recognizer; null when not applicable. */
  confidence: number | null;
}

export interface EntryDraft {
  id: string;
  user_id: string;
  source: DraftSource;
  local_date: LocalDate;
  meal_type: MealType;
  meal_id: string | null;
  media_id: string | null;
  voice_note_id: string | null;
  input_text: string | null;
  items: DraftItem[];
  created_at: string;
  updated_at: string;
}

const optionalAmount = (max: number) =>
  z
    .number()
    .finite()
    .min(0)
    .max(max)
    .nullable()
    .catch(null);

/**
 * Schema for recognizer output (server response or local parser). Untrusted
 * input: out-of-range nutrition becomes `null` instead of failing the whole
 * estimate, but names and amounts must be usable.
 */
export const draftItemInputSchema = z.object({
  food_name: z.string().trim().min(1).max(200),
  quantity: z.number().finite().positive().max(100000),
  unit: z.enum(UNITS).catch('serving'),
  calories: optionalAmount(20000),
  protein_g: optionalAmount(2000),
  carbs_g: optionalAmount(2000),
  fat_g: optionalAmount(2000),
  confidence: z.number().min(0).max(1).nullable().catch(null),
});
export type DraftItemInput = z.input<typeof draftItemInputSchema>;

export const MAX_DRAFT_ITEMS = 30;

/** Keeps the valid recognized items (max 30) and drops the rest. */
export function sanitizeDraftItems(raw: unknown, makeKey: () => string): DraftItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftItem[] = [];
  for (const candidate of raw) {
    const parsed = draftItemInputSchema.safeParse({
      confidence: null,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      ...(typeof candidate === 'object' && candidate !== null ? candidate : {}),
    });
    if (parsed.success) out.push({ key: makeKey(), ...parsed.data });
    if (out.length >= MAX_DRAFT_ITEMS) break;
  }
  return out;
}

const storedItemsSchema = z.array(
  draftItemInputSchema.extend({ key: z.string().min(1) }),
);

export function parseStoredItems(json: string): DraftItem[] {
  try {
    const parsed = storedItemsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}