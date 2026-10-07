import type { Messages, Translator } from '@/i18n';
import type { MealItem, Nutrition, Unit } from '@/domain/types';

export function unitLabel(m: Messages, unit: Unit): string {
  return m.units[unit];
}

export function kcal(i18n: Translator, value: number): string {
  return `${i18n.number(Math.round(value), 0)} ${i18n.m.units.kcal}`;
}

export function grams(i18n: Translator, value: number | null): string {
  return value === null ? '—' : `${i18n.number(value, 1)} ${i18n.m.units.g}`;
}

export function amount(i18n: Translator, quantity: number, unit: Unit): string {
  return `${i18n.number(quantity, 2)} ${unitLabel(i18n.m, unit)}`;
}

/** "150 g · P 12 · C 30 · F 5" style summary for list rows. */
export function itemSubtitle(i18n: Translator, item: Pick<MealItem, 'quantity' | 'unit'> & Partial<Nutrition>): string {
  const parts = [amount(i18n, item.quantity, item.unit)];
  const { m } = i18n;
  const macro = (label: string, v: number | null | undefined) =>
    v === null || v === undefined ? null : `${label.charAt(0)} ${i18n.number(v, 1)}`;
  for (const p of [
    macro(m.nutrients.protein_g, item.protein_g),
    macro(m.nutrients.carbs_g, item.carbs_g),
    macro(m.nutrients.fat_g, item.fat_g),
  ]) {
    if (p) parts.push(p);
  }
  return parts.join(' · ');
}
