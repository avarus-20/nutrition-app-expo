import type { DraftItem } from '@/domain/drafts';
import type { Unit } from '@/domain/types';
import type { MealItemInput } from '@/domain/validation';
import { nutritionToText, parseNutrition, parsePositive, type NutritionText } from '@/features/nutrition/nutritionForm';
import type { Messages } from '@/i18n';

export interface DraftItemForm {
  key: string;
  name: string;
  quantity: string;
  unit: Unit;
  nutrition: NutritionText;
  confidence: number | null;
}

export type DraftFormErrors = Record<string, Record<string, string>>;

export function toDraftForm(item: DraftItem, format: (v: number) => string): DraftItemForm {
  return {
    key: item.key,
    name: item.food_name,
    quantity: format(item.quantity),
    unit: item.unit,
    nutrition: nutritionToText(
      { calories: item.calories ?? undefined, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g },
      format,
    ),
    confidence: item.confidence,
  };
}

/** Validates every reviewed entry; calories are required before confirmation. */
export function parseDraftForms(
  forms: DraftItemForm[],
  m: Messages,
): { items: MealItemInput[]; errors: null } | { items: null; errors: DraftFormErrors } {
  const errors: DraftFormErrors = {};
  const items: MealItemInput[] = [];
  for (const form of forms) {
    const e: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) e.name = m.common.required;
    else if (name.length > 200) e.name = m.common.tooLong;
    const q = parsePositive(form.quantity, 100000, m);
    if (q.error) e.quantity = q.error;
    const n = parseNutrition(form.nutrition, m);
    if (n.errors) Object.assign(e, n.errors);
    if (Object.keys(e).length > 0 || !n.value || q.value === null) {
      errors[form.key] = e;
      continue;
    }
    items.push({ ...n.value, food_name: name, food_id: null, quantity: q.value, unit: form.unit });
  }
  if (Object.keys(errors).length > 0) return { items: null, errors };
  return { items, errors: null };
}

/** Converts the current form back into storable draft items (unparseable numbers become unknown). */
export function formsToDraftItems(forms: DraftItemForm[], parse: (s: string) => number | null): DraftItem[] {
  const num = (s: string) => {
    const v = parse(s);
    return v === null || Number.isNaN(v) || v < 0 ? null : v;
  };
  return forms.map((f) => ({
    key: f.key,
    food_name: f.name.trim() || '?',
    quantity: num(f.quantity) || 1,
    unit: f.unit,
    calories: num(f.nutrition.calories),
    protein_g: num(f.nutrition.protein_g),
    carbs_g: num(f.nutrition.carbs_g),
    fat_g: num(f.nutrition.fat_g),
    confidence: f.confidence,
  }));
}
