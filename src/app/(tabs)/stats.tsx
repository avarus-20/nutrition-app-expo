import React, { useMemo } from 'react';
import { SafeAreaView, Text, View } from 'react-native';

import { useQuery } from '@/hooks/useQuery';
import { useServices } from '@/providers/ServicesProvider';
import { todayLocalDate } from '@/utils/dates';

export default function StatsScreen() {
  const { meals } = useServices();
  const iso = useMemo(() => todayLocalDate(), []);
  const totals = useQuery(() => meals.dailyTotals(iso, iso), [iso], ['meals', 'meal_items']);
  const total = totals.data?.[0]?.calories ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>Статистика за {iso}</Text>
      <View style={{ height: 12 }} />
      <Text style={{ fontSize: 18 }}>Съедено сегодня: {total} ккал</Text>
    </SafeAreaView>
  );
}
