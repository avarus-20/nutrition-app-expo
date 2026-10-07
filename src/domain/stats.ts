import { addDays, daysBetweenInclusive, eachDay, type LocalDate } from '@/utils/dates';
import type { DailyTotals, WeightEntry } from './types';

export type StatNutrient = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g';

export interface RangeSummary {
  days: number;
  loggedDays: number;
  average: Record<StatNutrient, number | null>;
  total: Record<StatNutrient, number>;
  /** Logged days with calories at or below the calorie goal (null without a goal). */
  goalHitDays: number | null;
}

/** Ordinary least squares slope of y over x (null with fewer than 2 points). */
export function linearSlope(points: readonly { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** Daily series for a range with `null` on days without entries. */
export function dailySeries(totals: readonly DailyTotals[], from: LocalDate, to: LocalDate, nutrient: StatNutrient) {
  const byDate = new Map(totals.filter((t) => t.item_count > 0).map((t) => [t.date, t]));
  return eachDay(from, to).map((date) => {
    const t = byDate.get(date);
    return { date, value: t ? t[nutrient] : null };
  });
}

/** Calorie trend in kcal/day over logged days of the range. */
export function calorieTrend(totals: readonly DailyTotals[], from: LocalDate): number | null {
  const pts = totals
    .filter((t) => t.item_count > 0)
    .map((t) => ({ x: daysBetweenInclusive(from, t.date) - 1, y: t.calories }));
  return pts.length >= 3 ? linearSlope(pts) : null;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export function trendDirection(slope: number | null, threshold: number): TrendDirection | null {
  if (slope === null) return null;
  if (Math.abs(slope) < threshold) return 'flat';
  return slope > 0 ? 'up' : 'down';
}

/** Trailing moving average over the last `window` entries (entries sorted ascending). */
export function movingAverage(values: readonly number[], window = 7): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]!;
    if (i >= window) sum -= values[i - window]!;
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}

/**
 * Weight change over the last `days` days: latest entry minus the latest
 * entry measured at or before (latest - days); falls back to the earliest
 * entry inside the window. Null with fewer than two entries.
 */
export function weightChange(entriesAsc: readonly WeightEntry[], days = 30): number | null {
  if (entriesAsc.length < 2) return null;
  const latest = entriesAsc[entriesAsc.length - 1]!;
  const cutoff = new Date(latest.measured_at).getTime() - days * 86_400_000;
  let base: WeightEntry | null = null;
  for (const e of entriesAsc) {
    if (new Date(e.measured_at).getTime() <= cutoff) base = e;
  }
  base ??= entriesAsc.find((e) => new Date(e.measured_at).getTime() >= cutoff) ?? null;
  if (!base || base.id === latest.id) return null;
  return Math.round((latest.weight_kg - base.weight_kg) * 10) / 10;
}

export type RangePreset = '7' | '30' | 'month' | 'custom';

export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: LocalDate): { from: LocalDate; to: LocalDate } {
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  const n = preset === '7' ? 7 : 30;
  return { from: addDays(today, -(n - 1)), to: today };
}

export const MAX_RANGE_DAYS = 366;

export function isValidRange(from: LocalDate, to: LocalDate): boolean {
  const n = daysBetweenInclusive(from, to);
  return n >= 1 && n <= MAX_RANGE_DAYS;
}
