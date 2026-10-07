import React, { useMemo, useState } from 'react';
import { Alert, Button, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, Text, TextInput, View } from 'react-native';

import { sumCalories } from '@/domain/nutrition';
import { parseDecimal } from '@/domain/validation';
import { useQuery } from '@/hooks/useQuery';
import { useServices } from '@/providers/ServicesProvider';
import { todayLocalDate } from '@/utils/dates';

export default function TodayScreen() {
  const { meals } = useServices();
  const [title, setTitle] = useState('');
  const [cal, setCal] = useState('');
  const iso = useMemo(() => todayLocalDate(), []);
  const day = useQuery(() => meals.getDay(iso), [iso], ['meals', 'meal_items']);
  const items = useMemo(() => (day.data ?? []).flatMap((m) => m.items).reverse(), [day.data]);
  const total = sumCalories(items);

  const addMeal = async () => {
    const c = parseDecimal(cal);
    if (!title.trim() || c === null || !Number.isFinite(c) || c <= 0) {
      Alert.alert('Проверьте данные', 'Название и положительные калории обязательны.');
      return;
    }
    await meals.addItemsToDay({ date: iso, mealType: 'snack' }, [
      { food_name: title.trim(), food_id: null, quantity: 1, unit: 'serving', calories: Math.round(c), protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sugar_g: null, salt_g: null },
    ]);
    setTitle('');
    setCal('');
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1, padding: 16, gap: 12 }} behavior={Platform.select({ ios: 'padding', android: undefined })}>
        <Text style={{ fontSize: 22, fontWeight: '600' }}>Сегодня ({iso}) — всего: {total} ккал</Text>
        <TextInput placeholder="Блюдо" value={title} onChangeText={setTitle} style={{ borderWidth: 1, borderRadius: 10, padding: 10 }} />
        <TextInput placeholder="Калории" keyboardType="numeric" value={cal} onChangeText={setCal} style={{ borderWidth: 1, borderRadius: 10, padding: 10 }} />
        <Button title="Добавить" onPress={addMeal} />
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <View style={{ borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.food_name}</Text>
                <Text style={{ color: '#555' }}>{item.calories} ккал</Text>
              </View>
              <Button title="Удалить" color="#b00020" onPress={() => meals.deleteItem(item.id)} />
            </View>
          )}
          ListEmptyComponent={<Text style={{ color: '#777' }}>Пока пусто. Добавьте первый приём пищи 👇</Text>}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
