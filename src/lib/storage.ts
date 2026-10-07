// Сохранение/загрузка из AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Meal } from '../types/meal';
import { dayKey } from './logic';

// Загрузить приёмы пищи на указанную дату (ISO yyyy-mm-dd)
export async function loadMealsForDay(isoDate: string): Promise<Meal[]> {
  const key = dayKey(isoDate);
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as Meal[]) : [];
}

// Сохранить все приёмы пищи на день
export async function saveMealsForDay(isoDate: string, meals: Meal[]) {
  const key = dayKey(isoDate);
  await AsyncStorage.setItem(key, JSON.stringify(meals));
}
// НОВОЕ: список всех дней, для которых есть записи
export async function listDays(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  const dates = keys
    .filter((k) => k.startsWith('meals_'))
    .map((k) => k.replace('meals_', ''));

  // по убыванию (свежие сверху)
  return dates.sort((a, b) => (a > b ? -1 : 1));
}
