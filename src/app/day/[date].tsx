import { useLocalSearchParams } from 'expo-router';
import { FlatList, Text, View } from 'react-native';

import { useQuery } from '@/hooks/useQuery';
import { useServices } from '@/providers/ServicesProvider';

export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { meals } = useServices();
  const day = useQuery(() => meals.getDay(String(date)), [date], ['meals', 'meal_items']);
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>{date}</Text>
      <FlatList
        data={(day.data ?? []).flatMap((m) => m.items)}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Text>
            {item.food_name}: {item.calories} kcal
          </Text>
        )}
      />
    </View>
  );
}
