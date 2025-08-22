import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View } from 'react-native';
import type { Meal } from '../../types/meal';
import { loadMealsForDay } from '../../lib/storage';
import { sumCalories, todayISO } from '../../lib/logic';

export default function StatsScreen() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const iso = useMemo(() => todayISO(), []);
  const total = useMemo(() => sumCalories(meals), [meals]);

  useEffect(() => {
    loadMealsForDay(iso).then(setMeals).catch(console.error);
  }, [iso]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>Статистика за {iso}</Text>
      <View style={{ height: 12 }} />
      <Text style={{ fontSize: 18 }}>Съедено сегодня: {total} ккал</Text>
      <Text style={{ color: '#555', marginTop: 8 }}>Позже добавим графики по неделям/месяцам.</Text>
    </SafeAreaView>
  );
}
