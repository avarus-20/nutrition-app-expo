import type { Meal } from '../types/meal';

export const sumCalories = (items: Meal[]) =>
  items.reduce((acc, m) => acc + (Number.isFinite(m.calories) ? m.calories : 0), 0);

export const dayKey = (isoDate: string) => `meals_${isoDate}`;

export const todayISO = () => new Date().toISOString().slice(0, 10);
