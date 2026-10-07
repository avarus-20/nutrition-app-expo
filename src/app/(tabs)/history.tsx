import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';

import { useQuery } from '@/hooks/useQuery';
import { useT } from '@/lib/i18n';
import { useServices } from '@/providers/ServicesProvider';

export default function HistoryScreen() {
  const { t } = useT();
  const router = useRouter();
  const { meals } = useServices();
  const days = useQuery(() => meals.daysWithData(100, 0), [], ['meals', 'meal_items']);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '600', marginBottom: 8 }}>{t.historyTitle}</Text>
      <FlatList
        data={days.data ?? []}
        keyExtractor={(it) => it.date}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/day/[date]', params: { date: item.date } })}
            style={{ borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 16 }}>{item.date}</Text>
            <Text style={{ fontWeight: '600' }}>{item.calories} kcal</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ color: '#777' }}>{t.nothingYet}</Text>}
      />
    </SafeAreaView>
  );
}
